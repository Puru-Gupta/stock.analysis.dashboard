import { NextRequest, NextResponse } from "next/server";
import { analyzeExpiryOutliers } from "@/lib/engines/expiry-outliers";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const result = await analyzeExpiryOutliers({
      symbol: p.get("symbol") || "^NSEI",
      label: p.get("label") || undefined,
      universe: p.get("universe") === "stock" ? "stock" : "index",
      cadence: p.get("cadence") === "monthly" ? "monthly" : "weekly",
      return_mode: p.get("return_mode") === "hl" ? "hl" : "oc",
      start_date: p.get("start_date") || "2021-01-01",
      end_date: p.get("end_date") || new Date().toISOString().split("T")[0],
      coverage_pct: Number(p.get("coverage_pct") || 90),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Expiry outlier analysis failed" },
      { status: 400 },
    );
  }
}
