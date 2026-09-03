import { fetchLiveMarketBundle, fetchLiveOptionChain } from "@/lib/data/agents/orchestrator";
import type { AgentOptionLeg } from "@/lib/data/agents/types";
import type { OHLCVBar } from "@/lib/data/types";
import { getPriceHistory } from "@/lib/data/sync";
import { NIFTY_50, normalizeSymbol } from "@/lib/data/universes";
import { buildOptionsAdvantages, getModeDetails } from "./intel";
import { detectTrend } from "./technical";
import {
  blackScholesGreeks,
  daysToExpiryFromNseDate,
  impliedVolFromPrice,
  RISK_FREE_RATE,
} from "./greeks";
import { fetchUpcomingEarnings } from "@/lib/data/earnings-calendar";
import {
  buildPremiumDecayTimeline,
  compareNearestExpiries,
  legPremiumAtExpiry,
} from "./premium-decay";
import { resolveOptionExpiries } from "./chain-expiry";
import { computeOptionStats, type OptionStatsBundle } from "./option-stats";
import { assessStockFocus } from "./stock-focus";
import { analyzeChainSurface, quickChainIv } from "./chain-analytics";
import { compareVolMetrics } from "./vol-metrics";
import { empiricalOtmRate, empiricalStrangleSurvival } from "./empirical-pop";
import { getIndiaVixRegime } from "./india-vix";
import { buildQuantSignals } from "./quant-signals";

export interface PriceMovement {
  days_7: number;
  days_15: number;
  days_30: number;
  price_7d_ago: number;
  price_15d_ago: number;
  price_30d_ago: number;
  change_7d: number;
  change_15d: number;
  change_30d: number;
  direction: "up" | "down" | "flat";
}

function pctReturn(current: number, past: number) {
  if (!past) return 0;
  return Math.round(((current - past) / past) * 10000) / 100;
}

function priceAt(bars: { close: number }[], daysBack: number) {
  const idx = Math.max(0, bars.length - 1 - daysBack);
  return bars[idx]?.close ?? bars[0]?.close ?? 0;
}

export function computePriceMovement(bars: { close: number }[]): PriceMovement {
  const spot = bars.at(-1)?.close ?? 0;
  const p7 = priceAt(bars, 5);
  const p15 = priceAt(bars, 15);
  const p30 = priceAt(bars, 22);
  const r7 = pctReturn(spot, p7);
  const r15 = pctReturn(spot, p15);
  const r30 = pctReturn(spot, p30);
  const direction = r15 > 2 ? "up" : r15 < -2 ? "down" : "flat";
  return {
    days_7: r7, days_15: r15, days_30: r30,
    price_7d_ago: p7, price_15d_ago: p15, price_30d_ago: p30,
    change_7d: Math.round((spot - p7) * 100) / 100,
    change_15d: Math.round((spot - p15) * 100) / 100,
    change_30d: Math.round((spot - p30) * 100) / 100,
    direction,
  };
}

export function historicalVol(bars: { close: number }[], window = 20) {
  if (bars.length < window + 1) return 0.25;
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) rets.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
  const recent = rets.slice(-window);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function normalizeIv(raw: number | undefined, hv: number) {
  if (!raw || raw <= 0) return hv;
  return raw > 1 ? raw / 100 : raw;
}

function computeVolatilityMetrics(bars: { close: number }[], atmIv?: number) {
  const currentHv = historicalVol(bars);
  const hv7 = bars.length > 26 ? historicalVol(bars.slice(0, -5)) : currentHv;
  const hv15 = bars.length > 36 ? historicalVol(bars.slice(0, -15)) : currentHv;
  const hv30 = bars.length > 43 ? historicalVol(bars.slice(0, -22)) : currentHv;
  const currentIv = atmIv ?? currentHv;
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const chg = (now: number, past: number) => Math.round((now - past) * 1000) / 10;
  return {
    current_iv: pct(currentIv),
    current_hv: pct(currentHv),
    iv_hv_ratio: currentHv > 0 ? Math.round((currentIv / currentHv) * 100) / 100 : 1,
    change_7d: chg(currentHv, hv7),
    change_15d: chg(currentHv, hv15),
    change_30d: chg(currentHv, hv30),
    hv_7d_ago: pct(hv7),
    hv_15d_ago: pct(hv15),
    hv_30d_ago: pct(hv30),
  };
}

export function atmIvFromLegs(
  legs: { strike: number; iv?: number; type: string; ltp?: number; expiry?: string }[],
  spot: number,
  hv: number,
) {
  const resolved = resolveAtmIv(
    legs.map((l) => ({ strike: l.strike, ltp: l.ltp ?? 0, iv: l.iv, type: l.type, expiry: l.expiry })),
    spot,
    hv,
  );
  return resolved.iv;
}

function attachGreeks(
  rec: Record<string, unknown>,
  spot: number,
  optionType: string,
  daysToExpiry: number,
  vol: number,
) {
  const g = blackScholesGreeks(
    spot,
    rec.strike as number,
    vol,
    daysToExpiry,
    optionType === "put" ? "put" : "call",
  );
  rec.theta = g.theta;
  rec.delta = g.delta;
  rec.vega = g.vega;
  rec.theta_decay_7d = Math.round(g.theta * 7 * 100) / 100;
}

function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function probAbove(
  spot: number,
  strike: number,
  vol: number,
  days: number,
  rate = RISK_FREE_RATE,
) {
  if (vol <= 0 || days <= 0) return 50;
  const t = days / 365;
  const d2 = (Math.log(spot / strike) + (rate - 0.5 * vol ** 2) * t) / (vol * Math.sqrt(t));
  return Math.round(normCdf(d2) * 1000) / 10;
}

type ChainLeg = {
  strike: number;
  ltp: number;
  iv?: number;
  type: string;
  expiry?: string;
};

/** Fill missing leg IV from LTP when NSE omits impliedVolatility (analyze path only). */
export function enrichLegsWithImpliedVol(legs: ChainLeg[], spot: number): ChainLeg[] {
  if (!legs.length || spot <= 0) return legs;
  return legs.map((leg) => {
    if (leg.iv && leg.iv > 0) return leg;
    if (!(leg.ltp > 0)) return leg;
    const dte = leg.expiry ? daysToExpiryFromNseDate(leg.expiry) : 30;
    const type = leg.type === "PE" || leg.type === "put" ? "put" : "call";
    const iv = impliedVolFromPrice(spot, leg.strike, dte, type, leg.ltp);
    return iv != null ? { ...leg, iv: iv * 100 } : leg;
  });
}

export function resolveAtmIv(
  legs: ChainLeg[] | null | undefined,
  spot: number,
  hv: number,
): { iv: number; ivIsProxy: boolean; legs: ChainLeg[] } {
  const original = legs ?? [];
  const enriched = original.length ? enrichLegsWithImpliedVol(original, spot) : [];
  const withIv = enriched.filter((l) => l.iv && l.iv > 0);
  if (withIv.length) {
    const nearest = withIv.reduce((best, leg) =>
      Math.abs(leg.strike - spot) < Math.abs(best.strike - spot) ? leg : best,
    );
    const orig = original.find((l) => l.strike === nearest.strike && l.type === nearest.type);
    return {
      iv: normalizeIv(nearest.iv, hv),
      ivIsProxy: !(orig?.iv && orig.iv > 0),
      legs: enriched,
    };
  }
  return { iv: hv, ivIsProxy: true, legs: enriched };
}

function moneyness(spot: number, strike: number, type: string) {
  if (type === "call") return strike < spot * 0.99 ? "ITM" : strike > spot * 1.01 ? "OTM" : "ATM";
  return strike > spot * 1.01 ? "ITM" : strike < spot * 0.99 ? "OTM" : "ATM";
}

type LiveOptionLeg = {
  strike: number;
  ltp: number;
  iv?: number;
  type: string;
  oi?: number;
  volume?: number;
  bid?: number;
  ask?: number;
};

function buildStrikeRecommendations(input: {
  spot: number;
  daysToExpiry: number;
  optionType: string;
  strategyMode: string;
  capital: number;
  movement: ReturnType<typeof computePriceMovement>;
  movementInsight: ReturnType<typeof getMovementInsight>;
  trend: string;
  hv: number;
  em: number;
  step: number;
  isSelling: boolean;
  expiryLegs: LiveOptionLeg[];
  focusStatus?: "clean" | "caution" | "avoid";
  allowSells?: boolean;
}): Record<string, unknown>[] {
  const {
    spot,
    daysToExpiry,
    optionType,
    capital,
    movement,
    movementInsight,
    trend,
    hv,
    em,
    step,
    isSelling,
    expiryLegs,
    focusStatus = "clean",
    allowSells = true,
  } = input;

  const focusBlocksSells =
    focusStatus === "avoid" ||
    (focusStatus === "caution" && movementInsight.suitability === "avoid");
  const sellBlocked = isSelling && (!allowSells || focusBlocksSells);

  const strikes: Record<string, unknown>[] = [];

  if (expiryLegs.length >= 5) {
    for (const leg of expiryLegs) {
      const s = leg.strike;
      const premium = leg.ltp;
      const vol = normalizeIv(leg.iv, hv);
      const probItm = optionType === "call" ? probAbove(spot, s, vol, daysToExpiry) : 100 - probAbove(spot, s, vol, daysToExpiry);
      const probOtm = Math.round((100 - probItm) * 10) / 10;
      const money = moneyness(spot, s, optionType);
      let score = 0;
      if ((trend === "uptrend" && optionType === "call") || (trend === "downtrend" && optionType === "put")) score += 30;
      if (money === "ATM" || money === "ITM") score += 25;
      if (probItm > 40 && probItm < 70) score += 15;
      if (premium < capital * 0.02) score += 10;
      if (movementInsight.suitability === "favorable") score += 10;
      if ((leg.oi || 0) > 1000) score += 5;
      if (vol > hv * 1.1 && isSelling) score += 10;

      const rec: Record<string, unknown> = {
        strike: s,
        premium,
        moneyness: money,
        iv: Math.round(vol * 1000) / 10,
        prob_itm: probItm,
        prob_otm: probOtm,
        volume: leg.volume || 0,
        open_interest: leg.oi || 0,
        bid_ask_spread_pct: leg.bid && leg.ask ? Math.round(((leg.ask - leg.bid) / premium) * 1000) / 10 : null,
        liquidity_ok: (leg.oi || 0) > 500 || (leg.volume || 0) > 100,
        score,
        live: true,
      };
      attachGreeks(rec, spot, optionType, daysToExpiry, vol);

      const liquidityOk = rec.liquidity_ok as boolean;
      if (isSelling) {
        if (!sellBlocked && probOtm >= 70 && Math.abs(s - spot) > em * 0.8 && liquidityOk) {
          rec.action = `Sell ${optionType.charAt(0).toUpperCase() + optionType.slice(1)}`;
          rec.premium_received = premium;
          rec.breakeven = optionType === "call" ? Math.round((s + premium) * 100) / 100 : Math.round((s - premium) * 100) / 100;
          rec.stop_loss = Math.round(premium * 2 * 100) / 100;
          rec.stop_label = `≥₹${rec.stop_loss}`;
          rec.reason = `Live NSE LTP ₹${premium}, OI ${leg.oi ?? "—"}, P(OTM) ${probOtm}% (≥70), dist≥0.8×EM.`;
          rec.invalidation = optionType === "call"
            ? `Spot closes above ₹${rec.breakeven} on expiry`
            : `Spot closes below ₹${rec.breakeven} on expiry`;
          rec.max_risk = "Undefined for naked selling — use spreads";
          strikes.push(rec);
        }
      } else if (score >= 65 && liquidityOk && movementInsight.suitability !== "avoid") {
        rec.action = `Buy ${optionType.charAt(0).toUpperCase() + optionType.slice(1)}`;
        rec.entry_premium = [Math.round(premium * 0.95 * 100) / 100, Math.round(premium * 1.05 * 100) / 100];
        rec.stop_loss = Math.round(premium * 0.5 * 100) / 100;
        rec.target = Math.round(premium * 2 * 100) / 100;
        rec.reason = `Live NSE LTP ₹${premium} · score ${score}≥65 · ${trend} · 15d ${movement.days_15}%`;
        rec.invalidation = `Premium below ₹${rec.stop_loss}`;
        strikes.push(rec);
      }
    }
  } else {
    for (let s = Math.floor(spot / step) * step - step * 5; s <= Math.ceil(spot / step) * step + step * 5; s += step) {
      if (s <= 0) continue;
      const dist = Math.abs(s - spot);
      const premium = Math.max(1, Math.round((em * Math.exp(-dist / em) * 0.15) * 100) / 100);
      const iv = hv;
      const probItm = optionType === "call" ? probAbove(spot, s, iv, daysToExpiry) : 100 - probAbove(spot, s, iv, daysToExpiry);
      const probOtm = Math.round((100 - probItm) * 10) / 10;
      const money = moneyness(spot, s, optionType);
      let score = 0;
      if ((trend === "uptrend" && optionType === "call") || (trend === "downtrend" && optionType === "put")) score += 30;
      if (money === "ATM" || money === "ITM") score += 25;
      if (probItm > 40 && probItm < 70) score += 15;
      if (premium < capital * 0.02) score += 10;
      if (movementInsight.suitability === "favorable") score += 10;
      if (iv > hv * 1.1 && isSelling) score += 10;

      const rec: Record<string, unknown> = {
        strike: s,
        premium,
        moneyness: money,
        iv: Math.round(iv * 1000) / 10,
        prob_itm: probItm,
        prob_otm: probOtm,
        volume: 0,
        open_interest: 0,
        bid_ask_spread_pct: null,
        liquidity_ok: false,
        score,
        live: false,
      };
      attachGreeks(rec, spot, optionType, daysToExpiry, iv);

      if (isSelling) {
        if (!sellBlocked && probOtm >= 70 && Math.abs(s - spot) > em * 0.8) {
          rec.action = `Sell ${optionType.charAt(0).toUpperCase() + optionType.slice(1)}`;
          rec.premium_received = premium;
          rec.breakeven = optionType === "call" ? Math.round((s + premium) * 100) / 100 : Math.round((s - premium) * 100) / 100;
          rec.stop_loss = Math.round(premium * 2 * 100) / 100;
          rec.stop_label = `≥₹${rec.stop_loss}`;
          rec.reason = `Synthetic HV estimate — prefer live chain (NIFTY/BANKNIFTY). P(OTM) ${probOtm}%.`;
          rec.invalidation = optionType === "call"
            ? `Spot closes above ₹${rec.breakeven} on expiry`
            : `Spot closes below ₹${rec.breakeven} on expiry`;
          rec.max_risk = "Undefined for naked selling — use spreads";
          strikes.push(rec);
        }
      } else if (score >= 65 && movementInsight.suitability !== "avoid") {
        rec.action = `Buy ${optionType.charAt(0).toUpperCase() + optionType.slice(1)}`;
        rec.entry_premium = [Math.round(premium * 0.95 * 100) / 100, Math.round(premium * 1.05 * 100) / 100];
        rec.stop_loss = Math.round(premium * 0.5 * 100) / 100;
        rec.target = Math.round(premium * 2 * 100) / 100;
        rec.reason = `Synthetic HV estimate (score ${score}≥65) — prefer live chain (NIFTY/BANKNIFTY).`;
        rec.invalidation = `Premium below ₹${rec.stop_loss}`;
        strikes.push(rec);
      }
    }
  }

  return strikes;
}

export function getMovementInsight(
  movement: PriceMovement,
  optionType: string,
  strategyMode: string,
  trend: string,
) {
  const { days_7, days_15, days_30, direction } = movement;
  const isSelling = strategyMode.includes("sell") || strategyMode === "selling";
  const isNeutral = strategyMode === "neutral";
  const isBuying = !isSelling && !isNeutral;

  let suitability: "favorable" | "caution" | "avoid" = "caution";
  let summary = "";
  const points: string[] = [];

  if (isSelling && optionType === "call") {
    if (direction === "flat" && Math.abs(days_15) < 3) {
      suitability = "favorable";
      summary = "Stock is range-bound — ideal for selling OTM calls.";
      points.push("Minimal price movement in last 15–30 days");
      points.push("Range-bound stocks favor premium selling strategies");
    } else if (days_15 > 8 || (days_15 > 5 && days_7 > 3)) {
      suitability = "caution";
      summary = "Recent rally — call selling only with wide OTM strikes; momentum can continue.";
      points.push(`Gain ${days_7}% (7d) / ${days_15}% (15d) — do not treat as free premium`);
    } else if (direction === "down" && days_15 < -5) {
      suitability = "favorable";
      summary = "Stock is falling — call selling safer if you accept bounce risk.";
      points.push(`Down ${Math.abs(days_15)}% in 15 days — calls likely stay OTM`);
    } else {
      summary = "Mixed movement — sell calls only at strikes well outside expected range.";
      points.push(`7d: ${days_7}% · 15d: ${days_15}% · 30d: ${days_30}%`);
    }
  } else if (isSelling && optionType === "put") {
    if (direction === "flat" || (days_15 > -3 && days_15 < 3)) {
      suitability = "favorable";
      summary = "Stable price action — good environment for selling puts (cash-secured put).";
      points.push("Stock not in free-fall — puts can expire OTM with high probability");
    } else if (days_15 < -8) {
      suitability = "avoid";
      summary = "Stock falling sharply — avoid naked put selling.";
      points.push(`Down ${Math.abs(days_15)}% in 15 days — high risk of further decline`);
    } else if (days_15 > 5) {
      suitability = "favorable";
      summary = "Uptrend intact — selling puts on dips can work if you want to own the stock.";
      points.push(`Up ${days_15}% in 15 days — trend supports put selling at support levels`);
    } else {
      summary = "Moderate movement — sell puts only at strikes below strong support.";
      points.push(`7d: ${days_7}% · 15d: ${days_15}% · 30d: ${days_30}%`);
    }
  } else if (isBuying && optionType === "call") {
    if (days_15 > 3 && days_7 > 0 && trend === "uptrend") {
      suitability = "favorable";
      summary = "Momentum supports call buying — price gaining with trend intact.";
      points.push(`Up ${days_15}% in 15 days with uptrend`);
    } else if (days_15 < -3) {
      suitability = "avoid";
      summary = "Stock is weak — avoid buying calls until trend reverses.";
      points.push(`Down ${Math.abs(days_15)}% in 15 days`);
    } else {
      summary = "Weak momentum for call buying — wait for clearer breakout.";
      points.push(`7d: ${days_7}% · 15d: ${days_15}% · 30d: ${days_30}%`);
    }
  } else if (isBuying && optionType === "put") {
    if (days_15 < -3 && trend === "downtrend") {
      suitability = "favorable";
      summary = "Downtrend supports put buying.";
      points.push(`Down ${Math.abs(days_15)}% in 15 days with downtrend`);
    } else if (days_15 > 5) {
      suitability = "avoid";
      summary = "Stock rallying — put buying has poor odds.";
      points.push(`Up ${days_15}% in 15 days — fighting the trend`);
    } else {
      summary = "No clear bearish momentum for put buying.";
      points.push(`7d: ${days_7}% · 15d: ${days_15}% · 30d: ${days_30}%`);
    }
  } else if (isNeutral) {
    if (Math.abs(days_15) < 4 && Math.abs(days_30) < 8) {
      suitability = "favorable";
      summary = "Low movement — ideal for Iron Condor / neutral strategies.";
      points.push(`Range-bound: 15d ${days_15}%, 30d ${days_30}%`);
      points.push("Sell OTM calls and puts outside expected move range");
    } else {
      suitability = "caution";
      summary = "Stock is trending — neutral strategies carry directional risk.";
      points.push(`7d: ${days_7}% · 15d: ${days_15}% · 30d: ${days_30}%`);
    }
  }

  return { suitability, summary, points };
}

function scoreForStrategy(
  movement: PriceMovement,
  trend: string,
  hv: number,
  strategyMode: string,
  optionType: string,
) {
  const { days_7, days_15, days_30 } = movement;
  let score = 50;
  const isSelling = strategyMode.includes("sell") || strategyMode === "selling";
  const isNeutral = strategyMode === "neutral";

  if (isSelling && optionType === "call") {
    // Prefer range-bound / pause — do NOT reward sharp rallies (continuation risk)
    if (Math.abs(days_15) < 3) score += 25;
    else if (days_15 > 8) score -= 15;
    else if (days_15 > 5) score -= 5;
    if (Math.abs(days_30) < 6) score += 10;
    if (hv > 0.25) score += 10;
    if (days_7 > 5) score -= 10;
  } else if (isSelling && optionType === "put") {
    if (Math.abs(days_15) < 4) score += 25;
    if (days_15 > 0 && trend === "uptrend") score += 15;
    if (days_15 < -8) score -= 30;
    if (hv > 0.2) score += 10;
  } else if (isNeutral) {
    if (Math.abs(days_15) < 4) score += 30;
    if (Math.abs(days_30) < 8) score += 20;
    if (trend === "neutral") score += 15;
    if (hv > 0.18 && hv < 0.4) score += 10;
  } else {
    if (optionType === "call" && days_15 > 3 && trend === "uptrend") score += 30;
    if (optionType === "put" && days_15 < -3 && trend === "downtrend") score += 30;
    if (Math.abs(days_7) > 2) score += 10;
    if (hv > 0.15 && hv < 0.45) score += 10;
  }
  return Math.min(100, Math.max(0, score));
}

export async function analyzeOptions(symbol: string, optionType = "call", strategyMode = "directional", capital = 100000) {
  const sym = normalizeSymbol(symbol);
  const live = await fetchLiveMarketBundle(sym, {
    days: 280,
    includeOptions: true,
  });
  // Prefer live NSE option legs when the chain returned CE/PE data
  const chain =
    live.option_chain?.ok && live.option_chain.legs.length
      ? live.option_chain
      : undefined;

  let bars = live.bars;
  // Index symbols often have quote from NSE even when history is sparse
  let spot = live.quote || chain?.underlying || bars.at(-1)?.close;
  if (!spot) return { error: `No spot price for ${sym}`, symbol: sym };

  // Minimal synthetic series if agents returned quote but no history (rare index edge case)
  if (bars.length < 25 && spot > 0) {
    const seed = bars.length ? bars : [];
    const synthetic = [];
    for (let i = 60; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const jitter = 1 + Math.sin(i / 7) * 0.004;
      const px = Math.round(spot * jitter * 100) / 100;
      synthetic.push({
        date: d.toISOString().split("T")[0],
        open: px, high: px * 1.002, low: px * 0.998, close: px, volume: 0,
      });
    }
    bars = seed.length >= 25 ? bars : synthetic;
  }

  const trend = detectTrend(bars);
  const movement = computePriceMovement(bars);
  const movementInsight = getMovementInsight(movement, optionType, strategyMode, trend);
  const hv = historicalVol(bars);
  const earningsEarly = await fetchUpcomingEarnings(sym);
  const focusPre = assessStockFocus({ bars, hv, earnings: earningsEarly });

  const liveLegs = (chain?.legs || []).filter((l) => l.type === (optionType === "put" ? "PE" : "CE") && l.ltp > 0);
  const resolved = resolveOptionExpiries(chain?.expiries);
  const nearestExpiry = resolved.nearestExpiry;
  const daysToExpiry = resolved.nearestDte;
  const atmResolved = resolveAtmIv(chain?.legs || [], spot, hv);
  const atmIv = atmResolved.iv;
  const ivIsProxy = atmResolved.ivIsProxy;
  const volatility = computeVolatilityMetrics(bars, atmIv);
  const em = spot * hv * Math.sqrt(daysToExpiry / 365);
  const expectedRange: [number, number] = [Math.round((spot - em) * 100) / 100, Math.round((spot + em) * 100) / 100];

  const step = spot > 1000 ? 50 : spot > 500 ? 20 : 10;
  const isSelling = strategyMode.includes("sell") || strategyMode === "selling" || strategyMode === "neutral";
  const suppressNearestSells = Boolean(resolved.includeNextChain && isSelling);

  const expiryLegs = nearestExpiry
    ? liveLegs.filter((l) => l.expiry === nearestExpiry)
    : liveLegs;

  const recInput = {
    spot,
    optionType,
    strategyMode,
    capital,
    movement,
    movementInsight,
    trend,
    hv,
    step,
    isSelling,
    focusStatus: focusPre.status,
  };

  const strikes = buildStrikeRecommendations({
    ...recInput,
    daysToExpiry,
    em,
    expiryLegs,
    allowSells: !suppressNearestSells,
  });

  let nextExpiryChain: {
    expiry: string;
    days_to_expiry: number;
    recommendations: Record<string, unknown>[];
  } | null = null;

  if (resolved.includeNextChain && resolved.nextExpiry && resolved.nextDte != null) {
    const nextLegs = liveLegs.filter((l) => l.expiry === resolved.nextExpiry);
    const nextEm = spot * hv * Math.sqrt(resolved.nextDte / 365);
    const nextStrikes = buildStrikeRecommendations({
      ...recInput,
      daysToExpiry: resolved.nextDte,
      em: nextEm,
      expiryLegs: nextLegs,
    });
    nextStrikes.sort((a, b) => (b.score as number) - (a.score as number));
    nextExpiryChain = {
      expiry: resolved.nextExpiry,
      days_to_expiry: resolved.nextDte,
      recommendations: nextStrikes.slice(0, 10) as Record<string, unknown>[],
    };
  }

  strikes.sort((a, b) => (b.score as number) - (a.score as number));
  const top = strikes.slice(0, 10);
  const chainAvailable = !!chain?.ok && (chain.legs?.length || 0) > 0;

  const statsUseNext = resolved.includeNextChain && isSelling && !!nextExpiryChain;
  const statsExpiry = statsUseNext ? resolved.nextExpiry! : nearestExpiry;
  const statsDte = statsUseNext ? resolved.nextDte! : daysToExpiry;
  const statsLegsSource = statsUseNext
    ? liveLegs.filter((l) => l.expiry === statsExpiry)
    : expiryLegs.length
      ? expiryLegs
      : liveLegs;
  let strategy = null;
  if (strategyMode === "neutral" && movementInsight.suitability !== "avoid" && focusPre.status !== "avoid") {
    strategy = {
      name: "Iron Condor",
      reason: `Range-bound stock (15d: ${movement.days_15}%, 30d: ${movement.days_30}%) — sell OTM call and put outside expected move.`,
      legs: [
        `Sell ${roundStrike(spot + em, step)} CE`,
        `Buy ${roundStrike(spot + em * 1.5, step)} CE`,
        `Sell ${roundStrike(spot - em, step)} PE`,
        `Buy ${roundStrike(spot - em * 1.5, step)} PE`,
      ],
      max_loss: "Defined by wing width minus credit received",
      risk: "Defined",
    };
  } else if (isSelling && optionType === "call" && movement.days_15 > 5 && Math.abs(movement.days_15) < 10 && movementInsight.suitability !== "avoid") {
    const sellStrike = roundStrike(spot + em * 1.0, step);
    strategy = {
      name: "Covered Call / Sell OTM Call",
      reason: `Mild extension (${movement.days_15}% in 15d) — sell far OTM only; prefer range-bound tape.`,
      legs: [`Sell ${sellStrike} CE`],
      max_loss: "Unlimited if naked — hedge with stock or spread",
      risk: "High if naked",
    };
  } else if (isSelling && optionType === "put") {
    strategy = {
      name: "Cash-Secured Put",
      reason: `Sell put below support — willing to buy stock at lower price, collect premium.`,
      legs: [`Sell ${roundStrike(spot - em, step)} PE`],
      max_loss: `Strike price × lot size if assigned`,
      risk: "Defined if cash-secured",
    };
  } else if (trend === "uptrend" && !isSelling && top.length >= 1) {
    strategy = {
      name: "Bull Call Spread",
      reason: `Bullish trend (+${movement.days_15}% in 15d) — defined risk vs naked call.`,
      legs: [`Buy ${top[0].strike} CE`, `Sell ${(top[0].strike as number) + step} CE`],
      max_loss: `₹${Math.round((top[0].premium as number) * 60)} per lot (approx)`,
      risk: "Defined",
    };
  } else if (trend === "downtrend" && !isSelling && optionType === "put" && top.length >= 1) {
    strategy = {
      name: "Bear Put Spread",
      reason: `Bearish trend (${movement.days_15}% in 15d) — defined risk put spread.`,
      legs: [`Buy ${top[0].strike} PE`, `Sell ${(top[0].strike as number) - step} PE`],
      max_loss: `₹${Math.round((top[0].premium as number) * 60)} per lot (approx)`,
      risk: "Defined",
    };
  }

  const advantages = buildOptionsAdvantages({
    suitability: movementInsight.suitability,
    strategyMode,
    movement15d: movement.days_15,
    hv,
    chainAvailable,
    quality: live.quality,
    currentIv: volatility.current_iv / 100,
    ivHvRatio: volatility.iv_hv_ratio,
    daysToExpiry,
    topTheta: top[0]?.theta as number | undefined,
  });
  const mode_details = getModeDetails(strategyMode);

  const stats = computeOptionStats({
    bars,
    spot,
    daysToExpiry: statsDte,
    atmIv,
    trend,
    optionType: optionType as "call" | "put",
    strategyMode,
    ivIsProxy,
    legs: enrichLegsWithImpliedVol(
      statsLegsSource.map((l) => ({
        strike: l.strike,
        ltp: l.ltp,
        iv: l.iv,
        type: l.type,
        expiry: l.expiry,
      })),
      spot,
    ),
    earnings: earningsEarly,
  });

  const vixRegime = await getIndiaVixRegime();
  const empStrike = (stats.recommendation?.suggested_strike as number | undefined) || undefined;
  attachQuantToStats(
    stats,
    bars,
    spot,
    atmIv,
    ivIsProxy,
    optionType as "call" | "put",
    chain?.legs ?? [],
    chain?.expiries ?? [],
    vixRegime,
    empStrike,
  );

  const earnings = stats.focus.earnings;
  const decaySource =
    statsUseNext && nextExpiryChain?.recommendations.length
      ? nextExpiryChain.recommendations
      : top;
  const decayDte = statsUseNext && nextExpiryChain ? nextExpiryChain.days_to_expiry : daysToExpiry;
  const decayExpiry =
    statsUseNext && nextExpiryChain ? nextExpiryChain.expiry : nearestExpiry || "N/A";
  const topRec = decaySource[0] as Record<string, unknown> | undefined;
  let premium_decay = null;
  let expiry_comparison = null;

  if (topRec?.strike) {
    const strike = topRec.strike as number;
    const vol = normalizeIv((topRec.iv as number) / 100 || atmIv, hv);
    premium_decay = buildPremiumDecayTimeline({
      spot,
      strike,
      vol,
      daysToExpiry: decayDte,
      optionType: optionType as "call" | "put",
      livePremium: topRec.premium as number,
      expiry: decayExpiry,
      earnings,
    });

    if (chain?.expiries && chain.expiries.length >= 2) {
      const legType = optionType === "put" ? "PE" : "CE";
      expiry_comparison = compareNearestExpiries({
        spot,
        strike,
        vol,
        optionType: optionType as "call" | "put",
        expiries: chain.expiries,
        dteForExpiry: daysToExpiryFromNseDate,
        premiumForExpiry: (exp) => legPremiumAtExpiry(chain.legs, strike, exp, legType),
        earnings,
      });
    }
  }

  let note = chainAvailable
    ? `Live NSE option chain via stock-nse-india (${chain!.legs.length} legs). Multi-agent spot consensus.`
    : "Live premiums unavailable for this symbol — estimates use HV. Index symbols (NIFTY/BANKNIFTY) get full NSE chains.";
  if (nextExpiryChain) {
    note += ` Nearest expiry has ${daysToExpiry} DTE — next expiry (${nextExpiryChain.expiry}, ${nextExpiryChain.days_to_expiry} DTE) chain added below.`;
  }
  if (statsUseNext && statsExpiry) {
    note += ` Strike stats use next expiry (${statsExpiry}) for selling with limited runway on the current series.`;
  }
  if (focusPre.status === "avoid") {
    note += ` Focus: ${focusPre.label} — fresh premium selling blocked.`;
  } else if (suppressNearestSells) {
    note += ` Nearest expiry has only ${daysToExpiry} DTE — sell picks suppressed on current series; use next expiry below.`;
  }

  return {
    symbol: sym,
    spot: Math.round(spot * 100) / 100,
    expiry: nearestExpiry || chain?.expiries?.[0] || "N/A",
    days_to_expiry: daysToExpiry,
    historical_volatility: Math.round(hv * 1000) / 10,
    volatility,
    expected_move: Math.round(em * 100) / 100,
    expected_range: expectedRange,
    trend,
    option_type: optionType,
    strategy_mode: strategyMode,
    price_movement: movement,
    movement_insight: movementInsight,
    recommendations: top,
    strategy,
    chain_available: chainAvailable,
    note,
    data_quality: live.quality,
    advantages,
    mode_details,
    agent_quotes: live.quotes.filter((q) => q.ok).map((q) => ({
      source: q.source,
      last: q.last,
      latency_ms: q.latency_ms,
    })),
    agents_ms: live.agents_ms,
    analyzed_at: new Date().toISOString(),
    stats,
    premium_decay,
    expiry_comparison,
    next_expiry_chain: nextExpiryChain,
  };
}

function roundStrike(price: number, step: number) {
  return Math.round(price / step) * step;
}

function attachQuantToStats(
  stats: OptionStatsBundle,
  bars: OHLCVBar[],
  spot: number,
  atmIv: number,
  ivIsProxy: boolean,
  optionType: "call" | "put",
  legs: AgentOptionLeg[],
  expiries: string[],
  vix: Awaited<ReturnType<typeof getIndiaVixRegime>>,
  strikeForEmpirical?: number,
): OptionStatsBundle {
  const hv = stats.volatility.hv_20 / 100;
  const surface = legs.length ? analyzeChainSurface(legs, spot, expiries, hv) : null;
  const volCompare = compareVolMetrics(bars, ivIsProxy ? null : atmIv, ivIsProxy);
  const step = spot > 5000 ? 50 : spot > 1000 ? 20 : 10;
  const strike = strikeForEmpirical ?? roundStrike(spot, step);
  const emp = empiricalOtmRate(bars, strike, spot, optionType);
  const sigmaPct = hv * Math.sqrt(5 / 252) * 100;
  const strangle = empiricalStrangleSurvival(bars, spot, sigmaPct);
  stats.quant = buildQuantSignals({
    stats,
    volCompare,
    surface,
    vix,
    empiricalPopPct: emp.samples >= 8 ? emp.rate_pct : null,
    empiricalSamples: emp.samples,
    empiricalStranglePct: strangle.samples >= 8 ? strangle.rate_pct : null,
    liveIv: !ivIsProxy,
    optionType,
  });
  return stats;
}

export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R | null>): Promise<R[]> {
  const out: (R | null)[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out.filter((x): x is R => x != null);
}

/** Scan NIFTY 50 for best option candidates by strategy type (parallel) */
export async function scanOptionsUniverse(strategyMode = "selling", optionType = "call", limit = 15) {
  const liquid = NIFTY_50.slice(0, 30);

  const results = await mapPool(liquid, 6, async (sym) => {
    try {
      const { bars } = await getPriceHistory(sym, 90);
      if (bars.length < 25) return null;
      const spot = bars.at(-1)!.close;
      const movement = computePriceMovement(bars);
      const trend = detectTrend(bars);
      const hv = historicalVol(bars);
      const score = scoreForStrategy(movement, trend, hv, strategyMode, optionType);
      const insight = getMovementInsight(movement, optionType, strategyMode, trend);
      if (insight.suitability === "avoid" && score < 55) return null;

      let recStrategy = "—";
      if (strategyMode === "neutral") recStrategy = "Iron Condor";
      else if (strategyMode.includes("sell") || strategyMode === "selling") {
        recStrategy = optionType === "call" ? "Sell OTM Call" : "Cash-Secured Put";
      } else {
        recStrategy = optionType === "call" ? "Buy Call / Bull Spread" : "Buy Put / Bear Spread";
      }

      return {
        symbol: sym,
        name: sym.replace(".NS", ""),
        spot: Math.round(spot * 100) / 100,
        score,
        trend,
        days_7: movement.days_7,
        days_15: movement.days_15,
        days_30: movement.days_30,
        hv: Math.round(hv * 1000) / 10,
        suitability: insight.suitability,
        reason: insight.summary,
        recommended_strategy: recStrategy,
      };
    } catch {
      return null;
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface OptionStatsPick {
  symbol: string;
  name: string;
  spot: number;
  option_score: number;
  seller_vol_score: number;
  iv_rank: number;
  iv_hv_ratio: number;
  regime: string;
  confidence: number;
  z_score_1m: number;
  trend_label: string;
  reason: string;
  focus_status: "clean" | "caution" | "avoid";
  focus_label: string;
  focus_tags: string[];
  focus_note: string;
  event_risk: "low" | "elevated";
  earnings_date?: string;
  earnings_days?: number;
  earnings_label?: string;
  quant_score?: number;
  quant_label?: string;
  live_iv?: boolean;
  pcr_oi?: number | null;
  skew_25d?: number | null;
  empirical_pop?: number | null;
}

function regimeScoreBonus(regime: string) {
  if (regime === "Very Quiet" || regime === "Quiet") return 20;
  if (regime === "Normal") return 15;
  if (regime === "Elevated") return 8;
  if (regime === "High") return 3;
  return 0;
}

/** Rank liquid names by statistical option-selling score (vol, regime, confidence, stretch, quant signals). */
export async function scanOptionStatsUniverse(optionType = "call", limit = 50): Promise<OptionStatsPick[]> {
  const liquid = NIFTY_50;
  const vixRegime = await getIndiaVixRegime();

  const results = await mapPool(liquid, 3, async (sym) => {
    try {
      const { bars } = await getPriceHistory(sym, 280);
      if (bars.length < 40) return null;
      const spot = bars.at(-1)!.close;
      const trend = detectTrend(bars);
      const hv = historicalVol(bars);

      let atmIv = hv;
      let ivIsProxy = true;
      let dte = 30;
      let legs: AgentOptionLeg[] = [];
      let expiries: string[] = [];
      try {
        const chain = await fetchLiveOptionChain(sym);
        if (chain.ok && chain.legs.length) {
          legs = chain.legs;
          expiries = chain.expiries;
          const q = quickChainIv(chain.legs, chain.expiries, spot, hv);
          atmIv = q.atmIv;
          ivIsProxy = q.ivIsProxy;
          dte = q.dte;
        }
      } catch {
        /* NSE rate limit / timeout — HV fallback */
      }

      const stats = computeOptionStats({
        bars,
        spot,
        daysToExpiry: dte,
        atmIv,
        trend,
        optionType: optionType as "call" | "put",
        legs: legs.map((l) => ({
          strike: l.strike,
          ltp: l.ltp,
          iv: l.iv,
          type: l.type,
          expiry: l.expiry,
        })),
        ivIsProxy,
        earnings: await fetchUpcomingEarnings(sym),
      });

      attachQuantToStats(stats, bars, spot, atmIv, ivIsProxy, optionType as "call" | "put", legs, expiries, vixRegime);

      const z1m = stats.distributions.find((d) => d.key === "1m")?.z_score ?? 0;
      let optionScore =
        stats.volatility.seller_favorability * 0.35 +
        (stats.confidence.score / 100) * 12 +
        regimeScoreBonus(stats.volatility_regime);
      optionScore -= Math.min(15, Math.abs(z1m) * 5);
      if (optionType === "call" && z1m > 1.5) optionScore -= 8;
      if (optionType === "put" && z1m < -1.5) optionScore -= 8;
      if (trend === "neutral" || stats.health.trend_label === "Sideways") optionScore += 5;

      if (stats.quant) {
        optionScore = optionScore * 0.55 + stats.quant.quant_score * 0.45;
        if (!stats.quant.live_iv) optionScore *= 0.94;
      }

      const why: string[] = [];
      if (stats.quant?.live_iv) why.push("live IV");
      if (stats.quant && stats.quant.quant_score >= 70) why.push("quant edge");
      if (stats.volatility.seller_favorability >= 55) why.push("strong vol edge");
      else if (stats.volatility.iv_above_hv) why.push("IV > HV");
      if (stats.volatility_regime === "Quiet" || stats.volatility_regime === "Very Quiet") why.push("quiet regime");
      if (stats.confidence.score >= 70) why.push("reliable stats");
      if (Math.abs(z1m) < 1) why.push("price near mean");
      else if (Math.abs(z1m) >= 1.5) why.push(`stretched ${z1m > 0 ? "+" : ""}${z1m}σ`);
      if (stats.quant?.skew_25d != null && stats.quant.skew_25d > 4) why.push("put skew");

      const focus = stats.focus;

      optionScore = Math.round(Math.min(100, Math.max(0, optionScore)));

      return {
        symbol: sym,
        name: sym.replace(".NS", ""),
        spot: Math.round(spot * 100) / 100,
        option_score: optionScore,
        seller_vol_score: stats.volatility.seller_favorability,
        iv_rank: stats.volatility.iv_rank,
        iv_hv_ratio: stats.volatility.iv_hv_ratio,
        regime: stats.volatility_regime,
        confidence: stats.confidence.score,
        z_score_1m: z1m,
        trend_label: stats.health.trend_label,
        reason: why.length ? why.join(", ") : stats.volatility.seller_label,
        focus_status: focus.status,
        focus_label: focus.label,
        focus_tags: focus.tags,
        focus_note: focus.note,
        event_risk: focus.event_risk,
        earnings_date: focus.earnings?.date,
        earnings_days: focus.earnings?.days_away,
        earnings_label: focus.earnings?.label,
        quant_score: stats.quant?.quant_score,
        quant_label: stats.quant?.quant_label,
        live_iv: stats.quant?.live_iv,
        pcr_oi: stats.quant?.pcr_oi,
        skew_25d: stats.quant?.skew_25d,
        empirical_pop: stats.quant?.empirical_pop_pct,
      };
    } catch {
      return null;
    }
  });

  return results.sort((a, b) => b.option_score - a.option_score).slice(0, limit);
}
