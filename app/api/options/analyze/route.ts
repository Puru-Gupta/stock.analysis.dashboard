import { NextRequest, NextResponse } from "next/server";
import { analyzeOptions } from "@/lib/engines/options";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const symbol = p.get("symbol");
  if (!symbol) return NextResponse.json({ detail: "symbol required" }, { status: 400 });
  const result = await analyzeOptions(
    symbol,
    p.get("option_type") || "call",
    p.get("strategy_mode") || "directional",
    Number(p.get("capital") || 100000),
  );
  return NextResponse.json(result);
}
