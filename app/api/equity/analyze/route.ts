import { NextRequest, NextResponse } from "next/server";
import { analyzeEquity } from "@/lib/engines/equity";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "daily";
  if (!symbol) return NextResponse.json({ detail: "symbol required" }, { status: 400 });
  const result = await analyzeEquity(symbol, timeframe);
  if ("error" in result) return NextResponse.json({ detail: result.error }, { status: 404 });
  return NextResponse.json(result);
}
