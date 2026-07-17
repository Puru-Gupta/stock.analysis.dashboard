export const EQUITY_DEFINITIONS: Record<string, string> = {
  final_score:
    "Combined score (0–100) from technical (55%) and fundamental (45%). Buy typically ≥58, Watch mid-band, Sell/Avoid below ~40 or in weak downtrends.",
  technical_score:
    "Price-action score from trend, momentum (incl. RSI), volume, support/resistance, and relative strength vs Nifty.",
  fundamental_score:
    "Financial quality from P/E, ROE, debt, revenue/earnings growth, and profit margins.",
  signal_buy:
    "Buy = actionable long bias. Needs strong tech (≥58) with decent funds, final score ≥58, or an active bullish setup (MVRB / volume / OBV).",
  signal_sell:
    "Sell = exit/reduce bias. Final score below ~40, or weak tech in a downtrend. Rare in strong bull markets — empty Sell filter often means few weak names, not a bug.",
  signal_watch:
    "Watch = mid-zone / wait. Default when signals are mixed. Most stocks land here in sideways markets. Not the same as your personal watchlist.",
  signal_avoid:
    "Avoid = skip. Weak technicals and fundamentals, or downtrend with soft funds.",
  recommendation:
    "Human-readable label (Strong Buy, Buy, Watchlist, Sell/Avoid, Avoid). The Recommendation filter uses the shorter Signal field (Buy/Sell/Watch/Avoid).",
  entry_zone:
    "Price range where entering a trade is reasonable. Wait for price to reach this zone rather than chasing.",
  stop_loss:
    "Price level where the trade idea is wrong. Exit if price closes beyond this level.",
  target1:
    "First profit target based on nearby resistance or measured move.",
  target2:
    "Extended target if momentum continues beyond Target 1.",
  risk_reward:
    "Reward divided by risk. 1:2 means you risk ₹1 to make ₹2. Prefer setups above 1:1.5.",
  invalidation:
    "The exact condition that cancels this trade idea — usually a close below stop-loss.",
  ret_1m:
    "1-month price return (%). Shows recent short-term momentum.",
  ret_3m:
    "3-month price return (%). Core momentum filter from MVRB strategy.",
  vol_ratio:
    "Today's volume vs 20-day average. Above 1.2x = above-average interest. Above 1.5x = strong spike.",
  rs_vs_nifty:
    "Stock 3M return divided by Nifty 3M return. Above 1.0 = outperforming the index.",
  near_52w_high:
    "Price within 5% of 52-week high. Often signals strength or breakout potential.",
  volume_accumulation:
    "Today's volume is 1.3x above 20-day average while price is consolidating near 20-SMA. Suggests buyers absorbing supply.",
  obv_divergence:
    "On-Balance Volume (OBV) is rising over 15 days but price is flat or slightly down. Classic sign of quiet accumulation — institutions buying while price looks weak.",
  volume_spike:
    "Average volume in last 20 days is 1.5x higher than the 60-day average. Sustained higher activity often precedes a move.",
  price_consolidation:
    "Bollinger Band width is narrowing (below 75% of its 20-day average). Price is compressing before a potential breakout.",
  pre_breakout:
    "Price is consolidating with volume building but has NOT yet hit 52-week high. Early accumulation phase.",
  vol_accum_breakout:
    "Volume base built (20d avg ≥ 1.2× 60d avg or prior consolidation) and price closed above the 20-day range high on ≥1.2× average volume — confirmed accumulation breakout.",
  pe_ratio:
    "Price-to-Earnings. Lower can mean cheaper; compare with sector and growth rate.",
  roe:
    "Return on Equity — how efficiently the company uses shareholder capital. Above 15% is generally healthy.",
  debt_to_equity:
    "Total debt vs equity. Lower is safer. Above 100 is elevated for most sectors.",
  market_cap:
    "Total market value of the company (share price × shares). Shown in ₹ Cr for Indian stocks.",
  rsi:
    "Relative Strength Index (14). 30 = oversold, 70 = overbought. 55–70 often confirms constructive momentum without extreme risk.",
  trend:
    "Uptrend = higher highs/lows above rising SMAs. Downtrend = lower highs/lows. Neutral = mixed structure.",
  confidence:
    "How strongly the engine trusts the call (High/Medium/Low) based on score alignment and setup clarity.",
  risk_level:
    "Trade risk band (Low/Medium/High) from fundamentals, R:R, and whether the idea is tech-only.",
  universe:
    "Stock pool to scan: Nifty 50/100/500, Midcap, Smallcap, Bank Nifty, or a sector basket.",
  valuation_filter:
    "Mid/small-cap PE–PB brackets (sector-relative when mapped): Cheap / Fair / Premium. Mid/small scans default to Cheap+Fair.",
  setup_filter:
    "Narrow results to specific patterns: OBV accumulation, volume accumulation, pre-breakout, or volume accumulation with confirmed breakout.",
  index_regime:
    "Nifty risk-on / neutral / risk-off from EMA50/200 stack and 20d return. Fresh cash Buys are blocked in risk-off.",
  trade_mode:
    "Primary edge: Trend follow vs Accumulate on dip. Conflicting setups resolve to one mode so momentum and mean-reversion do not fight.",
  expectancy:
    "Same-symbol historical proxy: average 20d/60d returns after similar mode conditions. Hint, not a guarantee.",
};

/** Ordered glossary for the Info / Glossary panel */
export const GLOSSARY_SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: "Signals (Buy / Sell / Watch / Avoid)",
    items: [
      ["Buy", "signal_buy"],
      ["Sell", "signal_sell"],
      ["Watch", "signal_watch"],
      ["Avoid", "signal_avoid"],
      ["Recommendation vs Signal", "recommendation"],
    ],
  },
  {
    title: "Scores",
    items: [
      ["Final Score", "final_score"],
      ["Technical Score", "technical_score"],
      ["Fundamental Score", "fundamental_score"],
      ["RSI", "rsi"],
      ["Confidence", "confidence"],
      ["Risk Level", "risk_level"],
    ],
  },
  {
    title: "Trade Levels",
    items: [
      ["Entry Zone", "entry_zone"],
      ["Stop Loss", "stop_loss"],
      ["Target 1 / 2", "target1"],
      ["Risk/Reward", "risk_reward"],
      ["Invalidation", "invalidation"],
      ["Trend", "trend"],
    ],
  },
  {
    title: "Filters & Metrics",
    items: [
      ["Universe", "universe"],
      ["Valuation Filter", "valuation_filter"],
      ["Setup Filter", "setup_filter"],
      ["Volume Ratio", "vol_ratio"],
      ["RS vs Nifty", "rs_vs_nifty"],
      ["OBV Divergence", "obv_divergence"],
      ["Volume Accumulation", "volume_accumulation"],
      ["Vol Accum + Breakout", "vol_accum_breakout"],
      ["P/E Ratio", "pe_ratio"],
      ["ROE", "roe"],
      ["Debt/Equity", "debt_to_equity"],
    ],
  },
];

export const SIGNAL_SETUPS = {
  obv_accumulation: {
    title: "OBV Accumulation (Price Down, Volume Up)",
    description:
      "Price is flat or slightly down over 15 days, but OBV is rising. This means volume on up-days exceeds volume on down-days — smart money may be accumulating quietly before a move up.",
    action: "Watchlist / early entry on reversal confirmation",
  },
  volume_breakout_setup: {
    title: "Volume Accumulation + Consolidation",
    description:
      "Price is consolidating near 20-SMA with narrowing range and today's volume spike. Classic pre-breakout pattern from the mvsp.py strategy.",
    action: "Watch for breakout above resistance with volume",
  },
  vol_accum_breakout: {
    title: "Volume Accumulation + Breakout",
    description:
      "Volume built during a base (20d avg above 60d avg or prior consolidation) and price broke above the 20-day range high on rising volume — post-accumulation breakout.",
    action: "Trend follow entry; stop below breakout level or recent swing low",
  },
  mvrb_momentum: {
    title: "MVRB Momentum",
    description:
      "Strong 3M/1M returns with volume above average and relative strength vs Nifty. Momentum leaders tend to continue until trend breaks.",
    action: "Buy on pullback to support if fundamentals agree",
  },
};
