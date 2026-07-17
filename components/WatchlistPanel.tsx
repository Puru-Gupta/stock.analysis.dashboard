"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAPI, ScanResult } from "@/lib/api";
import { SignalBadge, ScoreBar } from "@/components/Sidebar";
import { Bookmark, Plus, Trash2, RefreshCw } from "lucide-react";
import { useAppCache } from "@/components/AppCacheProvider";

const STORAGE_KEY = "moneydashboard_watchlist";
const CACHE_KEY = "watchlist";

function loadSymbols(): string[] {
  if (typeof window === "undefined") return ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"];
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(loadSymbols);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  }, [symbols]);

  const add = useCallback((sym: string) => {
    const s = sym.toUpperCase().endsWith(".NS") ? sym.toUpperCase() : `${sym.toUpperCase()}.NS`;
    setSymbols((prev) => (prev.includes(s) ? prev : [...prev, s]));
  }, []);

  const remove = useCallback((sym: string) => {
    setSymbols((prev) => prev.filter((x) => x !== sym));
  }, []);

  return { symbols, add, remove, setSymbols };
}

export default function WatchlistPanel({
  onSelect,
  compact,
}: {
  onSelect?: (symbol: string) => void;
  compact?: boolean;
}) {
  const { symbols, add, remove } = useWatchlist();
  const cache = useAppCache();
  const symbolsKey = symbols.join(",");
  const cached = cache.get<{ rows: ScanResult[]; symbolsKey: string }>(CACHE_KEY);
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<ScanResult[]>(
    cached?.symbolsKey === symbolsKey ? cached.rows : [],
  );
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(cached?.symbolsKey === symbolsKey);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAPI<ScanResult[]>("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      } as RequestInit);
      setRows(data);
      setHasLoaded(true);
      cache.set(CACHE_KEY, { rows: data, symbolsKey });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [symbols, symbolsKey, cache]);

  useEffect(() => {
    const saved = cache.get<{ rows: ScanResult[]; symbolsKey: string }>(CACHE_KEY);
    if (saved?.symbolsKey === symbolsKey) {
      setRows(saved.rows);
      setHasLoaded(true);
    } else {
      setHasLoaded(false);
    }
  }, [symbolsKey, cache]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4" style={{ color: "var(--accent-blue)" }} />
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] !mb-0">
            Watchlist
          </h3>
        </div>
        <button type="button" className="btn-ghost !p-1.5" onClick={refresh} disabled={loading} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {!compact && (
        <div className="flex gap-2 mb-3">
          <input
            className="product-query-input flex-1"
            placeholder="Add symbol"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                add(input.trim());
                setInput("");
              }
            }}
          />
          <button
            type="button"
            className="product-action-secondary"
            onClick={() => {
              if (input.trim()) {
                add(input.trim());
                setInput("");
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="space-y-2">
        {rows.map((w) => (
          <div
            key={w.symbol}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md p-2.5"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onSelect?.(w.symbol)}
            >
              <p className="font-medium text-sm">{w.name || w.symbol.replace(".NS", "")}</p>
              <p className="font-mono text-xs tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                ₹{w.current_price}
              </p>
            </button>
            <div className="flex items-center gap-2">
              <SignalBadge signal={w.signal} />
              {!compact && (
                <div className="w-16 hidden sm:block">
                  <ScoreBar score={w.final_score} />
                </div>
              )}
              <button
                type="button"
                className="btn-ghost !p-1"
                onClick={() => remove(w.symbol)}
                aria-label={`Remove ${w.symbol}`}
              >
                <Trash2 className="h-3 w-3" style={{ color: "var(--fg-muted)" }} />
              </button>
            </div>
          </div>
        ))}
        {!rows.length && !loading && !hasLoaded && (
          <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
            Click refresh to load watchlist scores.
          </p>
        )}
        {!rows.length && !loading && hasLoaded && (
          <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
            Add symbols to track.{" "}
            <Link href="/equity" className="underline" style={{ color: "var(--accent-blue)" }}>
              Analyze equities
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
