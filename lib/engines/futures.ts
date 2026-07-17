import { getPriceHistory } from "@/lib/data/sync";
import { normalizeSymbol } from "@/lib/data/universes";
import { computeTechnicalScores } from "./technical";

const STRATEGIES: Record<string, string> = {
  trend_following: "Trend-Following",
  pullback: "Pullback",
  breakout: "Breakout",
  mean_reversion: "Mean Reversion",
  volatility_expansion: "Volatility Expansion",
};

function rangeCompression(bars: { high: number; low: number }[], window = 10) {
  if (bars.length < window * 2) return false;
  const recent = bars.slice(-window);
  const prior = bars.slice(-window * 2, -window);
  const rR = Math.max(...recent.map((b) => b.high)) - Math.min(...recent.map((b) => b.low));
  const pR = Math.max(...prior.map((b) => b.high)) - Math.min(...prior.map((b) => b.low));
  return pR > 0 && rR < pR * 0.7;
}

function meanReversionSignal(
  bars: { close: number; high: number; low: number }[],
  atr: number,
  rsi: number,
) {
  if (bars.length < 25) return { signal: "Watch" as const, score: 40, reason: "Insufficient history." };
  const closes = bars.map((b) => b.close);
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const price = closes.at(-1)!;
  const z = atr > 0 ? (price - sma20) / atr : 0;
  if (z <= -1.5 && rsi < 35) {
    return {
      signal: "Long" as const,
      score: 72,
      reason: `Price ${Math.abs(z).toFixed(1)} ATR below 20-SMA with RSI ${rsi} — mean-reversion long.`,
    };
  }
  if (z >= 1.5 && rsi > 65) {
    return {
      signal: "Short" as const,
      score: 72,
      reason: `Price ${z.toFixed(1)} ATR above 20-SMA with RSI ${rsi} — mean-reversion short.`,
    };
  }
  return { signal: "Watch" as const, score: 42, reason: "No stretched mean-reversion setup." };
}

function volExpansionSignal(
  bars: { high: number; low: number; close: number; open: number; volume: number }[],
  atr: number,
  volRatio: number,
) {
  if (bars.length < 30) return { signal: "Watch" as const, score: 40, reason: "Insufficient history." };
  const compressed = rangeCompression(bars, 12);
  const last = bars.at(-1)!;
  const range = last.high - last.low;
  const expanding = atr > 0 && range > atr * 1.2 && volRatio > 1.3;
  if (compressed && expanding && last.close > last.open) {
    return {
      signal: "Long" as const,
      score: 78,
      reason: "Range compressed then expanded higher with volume — volatility breakout long.",
    };
  }
  if (compressed && expanding && last.close < last.open) {
    return {
      signal: "Short" as const,
      score: 78,
      reason: "Range compressed then expanded lower with volume — volatility breakout short.",
    };
  }
  return { signal: "Watch" as const, score: 40, reason: "No volatility expansion confirmation." };
}

export async function analyzeFutures(
  symbol: string,
  timeframe = "daily",
  strategyMode = "trend_following",
  riskLevel = "medium",
) {
  const sym = normalizeSymbol(symbol);
  const { bars, sync } = await getPriceHistory(sym, 180);
  if (!bars.length) return { error: `No data for ${sym}`, symbol: sym };

  const { resampleBars } = await import("@/lib/data/sync");
  const df = resampleBars(bars, timeframe);
  const { bars: niftyBars } = await getPriceHistory("^NSEI", 180);
  const technical = computeTechnicalScores(df, resampleBars(niftyBars, timeframe));

  const trend = technical.trend;
  const price = technical.current_price;
  const { support, resistance } = technical;
  const atr = technical.atr;
  const volRatio = technical.mvrb?.vol_ratio ?? 1;
  const rsi = technical.rsi ?? 50;
  let signal = "Watch", score = 50, reason = "";
  let entryZone = technical.entry_zone, stopLoss = technical.stop_loss, target1 = technical.target1;

  if (strategyMode === "trend_following") {
    if (trend === "uptrend" && volRatio >= 1.3 && rsi >= 50 && rsi <= 65) {
      signal = "Long";
      score = 78;
      reason = "Uptrend with volume≥1.3x and RSI 50–65 (trend-follow filter).";
      stopLoss = Math.round((support - atr * 0.3) * 100) / 100;
      target1 = Math.round((price + (price - stopLoss) * 2) * 100) / 100;
    } else if (trend === "downtrend" && volRatio >= 1.3 && rsi >= 35 && rsi <= 50) {
      signal = "Short";
      score = 78;
      reason = "Downtrend with volume≥1.3x and RSI ≤50.";
      stopLoss = Math.round((resistance + atr * 0.3) * 100) / 100;
      target1 = Math.round((price - (stopLoss - price) * 2) * 100) / 100;
    } else {
      reason = "No clear trend-follow setup (need vol≥1.3x + RSI in band).";
      score = 45;
    }
  } else if (strategyMode === "breakout") {
    const compressed = rangeCompression(df);
    if (compressed && price > resistance * 0.998 && volRatio > 1.2) {
      signal = "Long";
      score = 80;
      reason = "Upside breakout with volume.";
      stopLoss = Math.round((resistance - atr * 0.5) * 100) / 100;
      target1 = Math.round((price + (resistance - support)) * 100) / 100;
    } else if (compressed && price < support * 1.002 && volRatio > 1.2) {
      signal = "Short";
      score = 80;
      reason = "Downside breakdown with volume.";
      stopLoss = Math.round((support + atr * 0.5) * 100) / 100;
      target1 = Math.round((price - (resistance - support)) * 100) / 100;
    } else {
      reason = "No confirmed breakout.";
      score = 40;
    }
  } else if (strategyMode === "pullback") {
    const sma20 = df.slice(-20).reduce((s, b) => s + b.close, 0) / 20;
    const dist = (Math.abs(price - sma20) / sma20) * 100;
    if (trend === "uptrend" && dist < 3 && rsi >= 40 && rsi <= 60) {
      signal = "Long";
      score = 74;
      reason = "Controlled pullback in uptrend near 20-SMA.";
      stopLoss = Math.round((sma20 - atr * 0.8) * 100) / 100;
      target1 = Math.round(resistance * 100) / 100;
    } else if (trend === "downtrend" && dist < 3 && rsi >= 40 && rsi <= 60) {
      signal = "Short";
      score = 74;
      reason = "Controlled bounce in downtrend near 20-SMA.";
      stopLoss = Math.round((sma20 + atr * 0.8) * 100) / 100;
      target1 = Math.round(support * 100) / 100;
    } else {
      reason = "Pullback conditions not met.";
      score = 42;
    }
  } else if (strategyMode === "mean_reversion") {
    const mr = meanReversionSignal(df, atr, rsi);
    signal = mr.signal;
    score = mr.score;
    reason = mr.reason;
    if (signal === "Long") {
      stopLoss = Math.round((price - atr * 1.5) * 100) / 100;
      target1 = Math.round((df.slice(-20).reduce((s, b) => s + b.close, 0) / 20) * 100) / 100;
    } else if (signal === "Short") {
      stopLoss = Math.round((price + atr * 1.5) * 100) / 100;
      target1 = Math.round((df.slice(-20).reduce((s, b) => s + b.close, 0) / 20) * 100) / 100;
    }
  } else if (strategyMode === "volatility_expansion") {
    const ve = volExpansionSignal(df, atr, volRatio);
    signal = ve.signal;
    score = ve.score;
    reason = ve.reason;
    if (signal === "Long") {
      stopLoss = Math.round((support - atr * 0.3) * 100) / 100;
      target1 = Math.round((price + atr * 2.5) * 100) / 100;
    } else if (signal === "Short") {
      stopLoss = Math.round((resistance + atr * 0.3) * 100) / 100;
      target1 = Math.round((price - atr * 2.5) * 100) / 100;
    }
  } else {
    reason = `${STRATEGIES[strategyMode] || strategyMode} conditions evaluated.`;
    score = 50;
  }

  const risk = Math.abs(price - stopLoss);
  const reward = Math.abs(target1 - price);
  const rr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  // R:R floor applies to all risk profiles — never fire Long/Short under 1.5
  if (rr < 1.5 && (signal === "Long" || signal === "Short")) {
    signal = "Watch";
    reason += " R:R below 1.5 institutional floor.";
  }

  const recommendation =
    signal === "Long" && score >= 70
      ? "Long"
      : signal === "Short" && score >= 70
        ? "Short"
        : signal === "Watch" || (score >= 55 && score < 70)
          ? "Watch"
          : "Avoid";

  return {
    symbol: sym,
    timeframe,
    strategy: STRATEGIES[strategyMode] || strategyMode,
    strategy_mode: strategyMode,
    signal: recommendation,
    score: Math.min(100, Math.max(0, score)),
    trend_condition: trend,
    volatility_condition: volRatio > 1.4 ? "Elevated" : volRatio < 0.8 ? "Quiet" : "Normal",
    rsi,
    entry_zone: entryZone,
    stop_loss: stopLoss,
    target: target1,
    target2: technical.target2,
    risk_reward: rr,
    reason,
    sync,
    invalidation:
      recommendation === "Long"
        ? `Close below ₹${stopLoss}`
        : recommendation === "Short"
          ? `Close above ₹${stopLoss}`
          : "N/A",
    risk_level: riskLevel,
    confidence: score >= 75 ? "High" : score >= 60 ? "Medium" : "Low",
    current_price: price,
    support,
    resistance,
    chart_data: df.slice(-120).map((b) => ({
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
    analyzed_at: new Date().toISOString(),
  };
}
