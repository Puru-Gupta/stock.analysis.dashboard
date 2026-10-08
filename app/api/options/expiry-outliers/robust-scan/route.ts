import { NextRequest, NextResponse } from "next/server";
import { scanExpiryRobustUniverse } from "@/lib/engines/expiry-robust-rank";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const end = p.get("end_date") || new Date().toISOString().split("T")[0];
    const start = p.get("start_date") || "2021-01-01";
    const coverage = Number(p.get("coverage_pct") || 90);
    const limit = Number(p.get("limit") || 50);
    const result = await scanExpiryRobustUniverse(end, start, coverage, limit);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Robust expiry scan failed" },
      { status: 500 },
    );
  }
}
