import { NextRequest, NextResponse } from "next/server";
import { analyzeEquity } from "@/lib/engines/equity";
import { DEFAULT_WATCHLIST } from "@/lib/data/universes";
import { normalizeSymbol } from "@/lib/data/universes";

export const maxDuration = 120;

export async function GET() {
  const results = [];
  for (const sym of DEFAULT_WATCHLIST) {
    try {
      const r = await analyzeEquity(sym);
      if (!("error" in r)) {
        results.push({ symbol: r.symbol, name: r.name, signal: r.signal, final_score: r.final_score, current_price: r.current_price, recommendation: r.recommendation });
      }
    } catch { /* skip */ }
  }
  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const symbols = (body.symbols || DEFAULT_WATCHLIST).map(normalizeSymbol);
  const results = [];
  for (const sym of symbols) {
    try {
      const r = await analyzeEquity(sym);
      if (!("error" in r)) results.push({ symbol: r.symbol, name: r.name, signal: r.signal, final_score: r.final_score, current_price: r.current_price, recommendation: r.recommendation });
    } catch { /* skip */ }
  }
  return NextResponse.json(results);
}
