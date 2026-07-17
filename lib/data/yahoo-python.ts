import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import type { FundamentalsData, OHLCVBar } from "./types";

const BACKEND_DIR = path.join(process.cwd(), "backend");
const PYTHON_BIN = path.join(BACKEND_DIR, "venv/bin/python");
const CLI_SCRIPT = path.join(BACKEND_DIR, "scripts/market_data_cli.py");

export function isPythonFetcherAvailable(): boolean {
  return existsSync(PYTHON_BIN) && existsSync(CLI_SCRIPT);
}

function runPythonCli<T>(args: string[], timeoutMs = 45000): Promise<T | null> {
  if (!isPythonFetcherAvailable()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const proc = spawn(PYTHON_BIN, [CLI_SCRIPT, ...args], {
      cwd: BACKEND_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(null);
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) {
        if (stderr.trim()) console.warn("[yahoo-python]", stderr.trim());
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch {
        resolve(null);
      }
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

export async function fetchHistoryViaPython(symbol: string, days: number): Promise<OHLCVBar[]> {
  const result = await runPythonCli<OHLCVBar[]>(["history", symbol, String(days)]);
  return Array.isArray(result) ? result : [];
}

export async function fetchFundamentalsViaPython(symbol: string): Promise<FundamentalsData | null> {
  const result = await runPythonCli<FundamentalsData>(["fundamentals", symbol]);
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  return { ...result, symbol: result.symbol ?? symbol };
}
