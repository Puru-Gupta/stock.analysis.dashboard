import { fetchLiveMarketBundle } from "@/lib/data/agents/orchestrator";
import { INDEX_SYMBOL } from "@/lib/data/universes";
import { analyzeEquity } from "./equity";
import { evaluateIndexRegime } from "./regime";

const SECTOR_LEADERS: Record<string, string> = {
  IT: "TCS.NS",
  Banking: "HDFCBANK.NS",
  Pharma: "SUNPHARMA.NS",
  Auto: "MARUTI.NS",
  FMCG: "HINDUNILVR.NS",
  Energy: "RELIANCE.NS",
  Metals: "TATASTEEL.NS",
  Realty: "DLF.NS",
};

export async function getMarketOverview() {
  const niftyLive = await fetchLiveMarketBundle(INDEX_SYMBOL, { days: 365 });
  const regime = evaluateIndexRegime(niftyLive.bars);
  const nifty = niftyLive.quote || niftyLive.bars.at(-1)?.close || 0;

  const sectorEntries = await Promise.all(
    Object.entries(SECTOR_LEADERS).map(async ([sector, sym]) => {
      try {
        const r = await analyzeEquity(sym, "daily", niftyLive.bars);
        if ("error" in r) return { sector, symbol: sym, signal: "—", score: 0, trend: "—" as const };
        return {
          sector,
          symbol: sym,
          signal: r.signal,
          score: r.final_score,
          trend: r.trend,
          allows_long: regime.allows_long,
        };
      } catch {
        return { sector, symbol: sym, signal: "—", score: 0, trend: "—" as const };
      }
    }),
  );

  const avgSectorScore = sectorEntries.length
    ? Math.round(sectorEntries.reduce((s, x) => s + x.score, 0) / sectorEntries.length)
    : 0;

  return {
    nifty: {
      symbol: "^NSEI",
      last: Math.round(nifty * 100) / 100,
      change_pct: niftyLive.quotes.find((q) => q.change_pct != null)?.change_pct,
    },
    regime,
    sector_pulse: sectorEntries.sort((a, b) => b.score - a.score),
    sector_avg_score: avgSectorScore,
    updated_at: new Date().toISOString(),
  };
}
