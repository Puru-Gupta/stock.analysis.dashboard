import { fetchLiveMarketBundle } from "@/lib/data/agents/orchestrator";
import { getPriceHistory } from "@/lib/data/sync";
import { NIFTY_50, normalizeSymbol } from "@/lib/data/universes";
import type { AgentOptionLeg } from "@/lib/data/agents/types";
import { detectTrend } from "./technical";
import { blackScholesGreeks, daysToExpiryFromNseDate } from "./greeks";
import { historicalVol, normalizeIv, atmIvFromLegs, probAbove, computePriceMovement, mapPool } from "./options";

/**
 * Option Selling Assistant engine.
 * Answers one question per contract: "Should I sell this option right now?"
 * Weighted Seller Score (0–100):
 *   IV Rank 20% · IV vs HV 20% · Probability of Profit 20% · Distance outside
 *   Expected Move 15% · Trend (sideways preferred) 10% · Liquidity 10% · Event Risk 5%
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export type TrendWord = "Sideways" | "Bullish" | "Bearish" | "Highly Volatile";

export interface SellerContract {
  type: "CE" | "PE";
  strike: number;
  expiry: string;
  premium: number;
  fair_premium: number;
  premium_edge: number;
  premium_edge_ok: boolean;
  pop: number;
  seller_score: number;
  rating: "strong_sell" | "good_sell" | "watch" | "avoid";
  rating_label: string;
  premium_quality: "overpriced" | "fair" | "cheap";
  dist_em: number;
  outside_em: boolean;
  risk: { level: "low" | "medium" | "high"; reasons: string[] };
  decision: "sell" | "avoid";
  recommendation: string;
  advanced: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
    oi: number;
    oi_change: number;
    volume: number;
    bid_ask_spread_pct: number | null;
  };
  live: boolean;
}

interface ChainContext {
  spot: number;
  hv: number;
  dte: number;
  em: number;
  ivRank: number;
  trendWord: TrendWord;
  eventRisk: "low" | "elevated";
  eventNote: string;
  expiry: string;
  live: boolean;
}

/**
 * IV Rank / percentile proxy: without a stored IV history, rank current ATM IV
 * inside the distribution of rolling 20d realized-vol readings (~1 year of bars).
 */
function ivRankFromHvSeries(bars: { close: number }[], currentIv: number) {
  const samples: number[] = [];
  for (let end = 40; end <= bars.length; end += 3) {
    samples.push(historicalVol(bars.slice(0, end)));
  }
  if (samples.length < 10) return { rank: 50, percentile: 50 };
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const rank = max > min ? clamp01((currentIv - min) / (max - min)) * 100 : 50;
  const percentile = (samples.filter((s) => s < currentIv).length / samples.length) * 100;
  return { rank: Math.round(rank), percentile: Math.round(percentile) };
}

function trendToWord(trend: string, hv: number): TrendWord {
  if (hv > 0.45) return "Highly Volatile";
  if (trend === "uptrend") return "Bullish";
  if (trend === "downtrend") return "Bearish";
  return "Sideways";
}

function detectEventRisk(bars: { close: number }[], hv: number): { risk: "low" | "elevated"; note: string } {
  const hv7 = bars.length > 26 ? historicalVol(bars.slice(0, -5)) : hv;
  const volJumpPp = (hv - hv7) * 100;
  const last = bars.at(-1)?.close ?? 0;
  const prev = bars.at(-2)?.close ?? last;
  const lastMovePct = prev ? Math.abs((last - prev) / prev) * 100 : 0;
  if (volJumpPp > 4) return { risk: "elevated", note: "Volatility expanded sharply this week — possible event/news risk" };
  if (lastMovePct > 3.5) return { risk: "elevated", note: "Large one-day move — possible event/news in play" };
  return { risk: "low", note: "No abnormal volatility or price shock detected" };
}

function computeMaxPain(legs: AgentOptionLeg[]): number | null {
  const withOi = legs.filter((l) => (l.oi || 0) > 0);
  const strikes = [...new Set(withOi.map((l) => l.strike))].sort((a, b) => a - b);
  if (strikes.length < 3) return null;
  let best: number | null = null;
  let bestPain = Infinity;
  for (const s of strikes) {
    let pain = 0;
    for (const l of withOi) {
      const oi = l.oi || 0;
      pain += l.type === "CE" ? oi * Math.max(0, s - l.strike) : oi * Math.max(0, l.strike - s);
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = s;
    }
  }
  return best;
}

function liquidityScore(oi: number, volume: number, spreadPct: number | null) {
  const oiPart = clamp01(oi / 5000) * 0.45;
  const volPart = clamp01(volume / 2000) * 0.25;
  let spreadPart = 0.5; // unknown spread — neutral
  if (spreadPct != null) {
    spreadPart = spreadPct <= 1 ? 1 : spreadPct <= 3 ? 0.6 : spreadPct <= 6 ? 0.3 : 0;
  }
  return oiPart + volPart + spreadPart * 0.3;
}

function trendScore(word: TrendWord, type: "CE" | "PE") {
  if (word === "Sideways") return 1;
  if (word === "Highly Volatile") return 0.15;
  // Selling calls into a downtrend / puts into an uptrend is the safer directional tilt
  if (word === "Bearish" && type === "CE") return 0.6;
  if (word === "Bullish" && type === "PE") return 0.6;
  return 0.25;
}

function ivHvScore(ratio: number) {
  if (ratio <= 0.85) return 0;
  if (ratio <= 1) return ((ratio - 0.85) / 0.15) * 0.5;
  if (ratio <= 1.25) return 0.5 + ((ratio - 1) / 0.25) * 0.5;
  return 1;
}

function buildContract(
  leg: { type: "CE" | "PE"; strike: number; premium: number; vol: number; oi: number; oiChange: number; volume: number; bid?: number; ask?: number },
  ctx: ChainContext,
): SellerContract {
  const { spot, hv, dte, em, ivRank, trendWord, eventRisk } = ctx;
  const optionType = leg.type === "PE" ? "put" : "call";
  const g = blackScholesGreeks(spot, leg.strike, leg.vol, dte, optionType);
  const fair = blackScholesGreeks(spot, leg.strike, hv, dte, optionType).price;
  // Edge is only meaningful when the fair value isn't a near-zero tail estimate;
  // deep-OTM strikes near expiry would otherwise explode to absurd percentages.
  const edgeMeasurable = ctx.live && fair >= 0.5;
  const edge = edgeMeasurable
    ? r1(Math.max(-95, Math.min(300, ((leg.premium - fair) / fair) * 100)))
    : 0;

  const pAbove = probAbove(spot, leg.strike, leg.vol, dte);
  const pop = optionType === "call" ? r1(100 - pAbove) : pAbove;

  const distEm = em > 0 ? r2(Math.abs(leg.strike - spot) / em) : 0;
  const outsideEm = distEm >= 1;
  const ratio = hv > 0 ? leg.vol / hv : 1;
  const spreadPct =
    leg.bid && leg.ask && leg.premium > 0 ? r1(((leg.ask - leg.bid) / leg.premium) * 100) : null;
  const sLiq = liquidityScore(leg.oi, leg.volume, spreadPct);
  const liqGood = sLiq >= 0.55 || (leg.oi >= 1000 && (spreadPct == null || spreadPct <= 3));

  const score = Math.round(
    100 *
      (0.2 * clamp01(ivRank / 100) +
        0.2 * ivHvScore(ratio) +
        0.2 * clamp01((pop - 50) / 45) +
        0.15 * clamp01(distEm / 1.3) +
        0.1 * trendScore(trendWord, leg.type) +
        0.1 * clamp01(sLiq) +
        0.05 * (eventRisk === "low" ? 1 : 0)),
  );

  const rating =
    score >= 90 ? "strong_sell" : score >= 80 ? "good_sell" : score >= 70 ? "watch" : "avoid";
  const ratingLabel =
    rating === "strong_sell" ? "Strong Sell" : rating === "good_sell" ? "Good Sell" : rating === "watch" ? "Watch" : "Avoid";

  const premiumQuality: SellerContract["premium_quality"] = edgeMeasurable
    ? edge >= 12 ? "overpriced" : edge <= -8 ? "cheap" : "fair"
    : ivRank > 55 && ratio >= 1.1 ? "overpriced" : ratio <= 0.9 ? "cheap" : "fair";

  // Risk assessment — plain reasons only
  const gammaRisk = Math.abs(g.delta) > 0.3 || distEm < 0.6 || (dte <= 5 && Math.abs(g.delta) > 0.2);
  const reasons: string[] = [];
  if (gammaRisk) reasons.push("Gamma Risk");
  if (eventRisk === "elevated") reasons.push("Event Risk");
  if (!liqGood) reasons.push("Low Liquidity");
  const riskLevel: "low" | "medium" | "high" =
    reasons.length >= 2 || (gammaRisk && dte <= 5) ? "high" : reasons.length === 1 ? "medium" : "low";

  // Strict all-conditions sell logic
  const decision: "sell" | "avoid" =
    ivRank > 50 &&
    ratio > 1 &&
    pop > 85 &&
    trendWord === "Sideways" &&
    eventRisk === "low" &&
    liqGood &&
    outsideEm &&
    edge > 15 &&
    score > 85
      ? "sell"
      : "avoid";

  const lines: string[] = [];
  if (!ctx.live) lines.push("Live chain unavailable — figures are estimates from historical volatility.");
  else if (!edgeMeasurable)
    lines.push(
      premiumQuality === "overpriced"
        ? "The premium looks rich relative to how much the stock actually moves."
        : "The premium is too small here for a reliable fair-value comparison.",
    );
  else if (edge >= 15) lines.push(`This option is trading about ${Math.round(edge)}% above its estimated fair value.`);
  else if (edge <= -8) lines.push("This option is priced below fair value — sellers are not being paid enough.");
  else lines.push("This option is priced close to its estimated fair value.");
  lines.push(
    trendWord === "Sideways"
      ? "The stock is currently range-bound, which favors option sellers."
      : trendWord === "Highly Volatile"
        ? "The stock is highly volatile right now, which is dangerous for sellers."
        : `The stock is in a ${trendWord.toLowerCase()} phase, adding directional risk.`,
  );
  lines.push(
    `Probability of expiring worthless is ${Math.round(pop)}%${liqGood ? " and liquidity is good" : ", but liquidity is thin"}.`,
  );
  lines.push(
    decision === "sell"
      ? "This setup is favorable for option selling."
      : "Overall, avoid selling this option right now.",
  );

  return {
    type: leg.type,
    strike: leg.strike,
    expiry: ctx.expiry,
    premium: r2(leg.premium),
    fair_premium: r2(fair),
    premium_edge: edge,
    premium_edge_ok: edgeMeasurable,
    pop: r1(pop),
    seller_score: score,
    rating,
    rating_label: ratingLabel,
    premium_quality: premiumQuality,
    dist_em: distEm,
    outside_em: outsideEm,
    risk: { level: riskLevel, reasons },
    decision,
    recommendation: lines.slice(0, 4).join(" "),
    advanced: {
      delta: g.delta,
      gamma: g.gamma,
      theta: g.theta,
      vega: g.vega,
      iv: r1(leg.vol * 100),
      oi: leg.oi,
      oi_change: leg.oiChange,
      volume: leg.volume,
      bid_ask_spread_pct: spreadPct,
    },
    live: ctx.live,
  };
}

export async function analyzeSellerBoard(symbol: string) {
  const sym = normalizeSymbol(symbol);
  const live = await fetchLiveMarketBundle(sym, { days: 300, includeOptions: true });
  const chain =
    live.option_chain?.ok && live.option_chain.legs.length ? live.option_chain : undefined;

  let bars = live.bars;
  const spot = live.quote || chain?.underlying || bars.at(-1)?.close;
  if (!spot) return { error: `No spot price for ${sym}`, symbol: sym };

  if (bars.length < 25) {
    const synthetic = [];
    for (let i = 60; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const jitter = 1 + Math.sin(i / 7) * 0.004;
      const px = Math.round(spot * jitter * 100) / 100;
      synthetic.push({ date: d.toISOString().split("T")[0], open: px, high: px * 1.002, low: px * 0.998, close: px, volume: 0 });
    }
    bars = synthetic;
  }

  const hv = historicalVol(bars);
  const trendWord = trendToWord(detectTrend(bars), hv);
  const { risk: eventRisk, note: eventNote } = detectEventRisk(bars, hv);

  const nearestExpiry = chain?.expiries?.[0] || "";
  const dte = nearestExpiry ? daysToExpiryFromNseDate(nearestExpiry) : 30;
  const atmIv = atmIvFromLegs(chain?.legs || [], spot, hv);
  const { rank: ivRank, percentile: ivPercentile } = ivRankFromHvSeries(bars, atmIv);
  const em = spot * atmIv * Math.sqrt(dte / 365);
  const expectedRange: [number, number] = [r2(spot - em), r2(spot + em)];

  const chainAvailable = !!chain;
  let expiryLegs: AgentOptionLeg[] = [];
  if (chain) {
    expiryLegs = chain.legs.filter((l) => l.ltp > 0);
    const exact = expiryLegs.filter((l) => l.expiry === nearestExpiry);
    if (exact.length >= 6) expiryLegs = exact;
  }

  const ctx: ChainContext = {
    spot, hv, dte, em, ivRank, trendWord, eventRisk, eventNote,
    expiry: nearestExpiry || "~30d", live: chainAvailable,
  };

  const band = Math.max(em * 2.5, spot * 0.12);
  let contracts: SellerContract[];

  if (chainAvailable && expiryLegs.length >= 6) {
    contracts = expiryLegs
      .filter((l) => Math.abs(l.strike - spot) <= band)
      .map((l) =>
        buildContract(
          {
            type: l.type,
            strike: l.strike,
            premium: l.ltp,
            vol: normalizeIv(l.iv, hv),
            oi: l.oi || 0,
            oiChange: l.change_oi || 0,
            volume: l.volume || 0,
            bid: l.bid,
            ask: l.ask,
          },
          ctx,
        ),
      );
  } else {
    // Synthetic fallback: Black-Scholes premiums at HV. Premium Edge is 0 by
    // construction — the UI flags that live premiums are needed for edge.
    ctx.live = false;
    const step = spot > 1000 ? 50 : spot > 500 ? 20 : 10;
    contracts = [];
    for (let i = -6; i <= 6; i++) {
      const strike = Math.round(spot / step) * step + i * step;
      if (strike <= 0) continue;
      for (const type of ["CE", "PE"] as const) {
        const premium = blackScholesGreeks(spot, strike, hv, dte, type === "PE" ? "put" : "call").price;
        if (premium < 0.5) continue;
        contracts.push(
          buildContract(
            { type, strike, premium, vol: hv, oi: 0, oiChange: 0, volume: 0 },
            ctx,
          ),
        );
      }
    }
  }

  contracts.sort((a, b) => b.seller_score - a.seller_score);
  contracts = contracts.slice(0, 40);

  // Chain-level advanced stats
  const ceOi = expiryLegs.filter((l) => l.type === "CE").reduce((a, l) => a + (l.oi || 0), 0);
  const peOi = expiryLegs.filter((l) => l.type === "PE").reduce((a, l) => a + (l.oi || 0), 0);
  const pcr = ceOi > 0 ? r2(peOi / ceOi) : null;
  const maxPain = computeMaxPain(expiryLegs);

  const smileMap = new Map<number, { strike: number; ce_iv: number | null; pe_iv: number | null }>();
  for (const l of expiryLegs) {
    if (!l.iv || l.iv <= 0 || Math.abs(l.strike - spot) > band) continue;
    const entry = smileMap.get(l.strike) || { strike: l.strike, ce_iv: null, pe_iv: null };
    const iv = r1(normalizeIv(l.iv, hv) * 100);
    if (l.type === "CE") entry.ce_iv = iv;
    else entry.pe_iv = iv;
    smileMap.set(l.strike, entry);
  }
  const smile = [...smileMap.values()].sort((a, b) => a.strike - b.strike);

  return {
    symbol: sym,
    spot: r2(spot),
    expiry: nearestExpiry || "N/A",
    days_to_expiry: dte,
    trend_word: trendWord,
    hv: r1(hv * 100),
    atm_iv: r1(atmIv * 100),
    iv_rank: ivRank,
    iv_percentile: ivPercentile,
    iv_hv_ratio: hv > 0 ? r2(atmIv / hv) : 1,
    expected_move: r2(em),
    expected_range: expectedRange,
    event_risk: eventRisk,
    event_note: eventNote,
    pcr,
    max_pain: maxPain,
    chain_available: chainAvailable,
    note: chainAvailable
      ? `Live NSE option chain (${expiryLegs.length} legs, expiry ${nearestExpiry}). IV Rank is estimated from 1-year realized-vol range.`
      : "Live chain unavailable for this symbol — premiums estimated via Black-Scholes at historical volatility. Index symbols (NIFTY/BANKNIFTY) get full NSE chains.",
    contracts,
    smile,
    data_quality: live.quality,
    analyzed_at: new Date().toISOString(),
  };
}

export interface SellerPick {
  symbol: string;
  name: string;
  spot: number;
  score: number;
  trend_word: TrendWord;
  days_15: number;
  hv: number;
  event_risk: "low" | "elevated";
  reason: string;
}

/**
 * Rank liquid F&O names by how sell-ready the underlying looks right now:
 * sideways tape, quiet recent movement, enough volatility to be paid for,
 * and no event-risk signature. Uses cached price history only — no chains.
 */
export async function scanSellerUniverse(limit = 12): Promise<SellerPick[]> {
  const universe = NIFTY_50.slice(0, 30);

  const results = await mapPool(universe, 6, async (sym) => {
    try {
      const { bars } = await getPriceHistory(sym, 120);
      if (bars.length < 40) return null;
      const spot = bars.at(-1)!.close;
      const hv = historicalVol(bars);
      const hvPct = hv * 100;
      const trendWord = trendToWord(detectTrend(bars), hv);
      const movement = computePriceMovement(bars);
      const { risk: eventRisk } = detectEventRisk(bars, hv);

      let score = 0;
      const why: string[] = [];
      const m15abs = Math.abs(movement.days_15);
      if (trendWord === "Sideways") {
        // A big 15d swing contradicts "range-bound" — trim the bonus
        score += m15abs < 8 ? 35 : 15;
        why.push("range-bound");
      } else if (trendWord === "Highly Volatile") {
        why.push("too volatile for sellers");
      } else {
        score += 12;
        why.push(`${trendWord.toLowerCase()} trend`);
      }
      if (m15abs < 3) {
        score += 20;
        why.push("quiet last 15 days");
      } else if (m15abs < 5) {
        score += 12;
      } else {
        why.push(`moved ${movement.days_15}% in 15d`);
      }
      if (Math.abs(movement.days_30) < 6) score += 10;
      if (hvPct >= 18 && hvPct <= 40) {
        score += 20;
        why.push("healthy premium on offer");
      } else if (hvPct >= 12) {
        score += 10;
      } else {
        why.push("thin premiums");
      }
      if (eventRisk === "low") score += 15;
      else why.push("possible event risk");

      const reason = why.join(", ");
      return {
        symbol: sym,
        name: sym.replace(".NS", ""),
        spot: r2(spot),
        score,
        trend_word: trendWord,
        days_15: movement.days_15,
        hv: r1(hvPct),
        event_risk: eventRisk,
        reason: reason.charAt(0).toUpperCase() + reason.slice(1),
      };
    } catch {
      return null;
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
