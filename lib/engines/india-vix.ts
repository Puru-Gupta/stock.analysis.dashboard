import { getPriceHistory } from "@/lib/data/sync";

const CACHE_MS = 15 * 60 * 1000;
let cache: { vix: number; at: number } | null = null;

export interface IndiaVixRegime {
  vix: number | null;
  regime: "low" | "normal" | "elevated" | "high" | "unknown";
  label: string;
  sell_size_pct: number;
  note: string;
}

export async function getIndiaVixRegime(): Promise<IndiaVixRegime> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return regimeFromVix(cache.vix);
  }

  try {
    let { bars } = await getPriceHistory("^INDIAVIX", 30);
    if (!bars.length) {
      const alt = await getPriceHistory("INDIAVIX.NS", 30);
      bars = alt.bars;
    }
    const vix = bars.at(-1)?.close ?? null;
    if (vix != null && vix > 0) {
      cache = { vix, at: now };
      return regimeFromVix(vix);
    }
  } catch {
    /* Yahoo may omit INDIAVIX — neutral fallback */
  }

  return {
    vix: null,
    regime: "unknown",
    label: "VIX unavailable",
    sell_size_pct: 100,
    note: "India VIX feed missing — use standard sizing",
  };
}

function regimeFromVix(vix: number): IndiaVixRegime {
  if (vix < 13) {
    return {
      vix,
      regime: "low",
      label: "Low vol — calm market",
      sell_size_pct: 100,
      note: "Complacency risk — tails still exist on event days",
    };
  }
  if (vix < 18) {
    return {
      vix,
      regime: "normal",
      label: "Normal vol regime",
      sell_size_pct: 100,
      note: "Standard weekly strangle sizing OK if name is clean",
    };
  }
  if (vix < 22) {
    return {
      vix,
      regime: "elevated",
      label: "Elevated VIX — widen wings",
      sell_size_pct: 75,
      note: "Reduce size ~25%; prefer next expiry if near DTE < 7",
    };
  }
  return {
    vix,
    regime: "high",
    label: "High VIX — event/stress",
    sell_size_pct: 50,
    note: "Half size or wait; premiums rich but breach risk elevated",
  };
}
