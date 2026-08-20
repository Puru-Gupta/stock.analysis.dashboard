export type GuideTableRow = { label: string; meaning: string };

export interface InterpretationSection {
  id: string;
  title: string;
  what?: string;
  how?: string;
  bullets?: string[];
  table?: GuideTableRow[];
  interpretation?: { heading?: string; items: string[] };
  note?: string;
}

export const OPTIONS_INTERPRETATION_SECTIONS: InterpretationSection[] = [
  {
    id: "spot",
    title: "1. Spot Price",
    what: "Current stock price.",
    how: "Compare it with the expected range and option strikes.",
  },
  {
    id: "trend",
    title: "2. Trend",
    what: "Possible values: Bullish · Bearish · Sideways",
    interpretation: {
      items: [
        "Bullish — CE selling is riskier. PE selling is generally safer.",
        "Bearish — PE selling is riskier. CE selling is generally safer.",
        "Sideways — Usually favorable for premium sellers.",
      ],
    },
  },
  {
    id: "vol-regime",
    title: "3. Volatility Regime",
    table: [
      { label: "Very Quiet", meaning: "Small daily moves expected" },
      { label: "Quiet", meaning: "Stable market" },
      { label: "Normal", meaning: "Average volatility" },
      { label: "Elevated", meaning: "Bigger-than-normal moves" },
      { label: "High", meaning: "Large swings likely" },
      { label: "Extreme", meaning: "Very high uncertainty" },
    ],
    interpretation: {
      items: [
        "Very Quiet — Better for premium selling. Smaller expected moves.",
        "Extreme — Premiums are rich, but risk is much higher. Position sizing matters more.",
      ],
    },
  },
  {
    id: "confidence",
    title: "4. Distribution Confidence (Conf. on leaderboard)",
    what: "Range: 0–100. How well recent returns fit the normal model used for P(OTM) and ranges — not a win-rate.",
    table: [
      { label: "80–100", meaning: "Highly reliable model fit" },
      { label: "60–80", meaning: "Good — probabilities usable" },
      { label: "40–60", meaning: "Use caution" },
      { label: "Below 40", meaning: "Treat probabilities as rough" },
    ],
    interpretation: {
      items: [
        "Higher Conf. — historical behavior closely matches the statistical model.",
        "Lower Conf. — fat tails or skew make normal-curve probabilities less trustworthy.",
      ],
    },
  },
  {
    id: "iv-rank",
    title: "5. Vol Rank (vs HV history)",
    what: "Where today's vol sits vs a history of HV windows — a proxy on the scan board; classic IV Rank needs an IV time series.",
    table: [
      { label: "0–20", meaning: "Vol low vs its HV history" },
      { label: "20–50", meaning: "Mid-range" },
      { label: "50–80", meaning: "Elevated vs HV history" },
      { label: "Above 80", meaning: "Very elevated vs HV history" },
    ],
    interpretation: {
      items: [
        "On the stock detail view, prefer live IV/HV when the chain loads.",
        "Quiet + sideways + near-mean is the primary short-premium structure edge.",
      ],
    },
  },
  {
    id: "hv-iv",
    title: "6. HV vs IV",
    what: "Compares Historical Volatility vs Implied Volatility from the live chain when available.",
    interpretation: {
      items: [
        "IV > HV — Options price in more movement than recently occurred. Generally more favorable for option sellers.",
        "IV < HV — Options may be relatively inexpensive. Can be more attractive for option buyers.",
        "When live IV is missing, detail view shows — and does not invent a premium edge.",
      ],
    },
  },
  {
    id: "comparison",
    title: "7. Distribution Comparison",
    what: "Shows where today's price lies across different historical windows.",
    bullets: [
      "Z-Score — How far today's price is from the average (0 = near average, ±1 = normal, ±2 = unusual, ±3 = rare).",
      "Percentile — Share of historical observations below the current price (e.g. 95% = price is higher than 95% of past readings in that window).",
      "Signal — Normal (typical), Elevated (stretched), Extreme (large deviation from recent history).",
    ],
  },
  {
    id: "expected-move",
    title: "8. Expected Move",
    what: "Statistically expected price ranges from the distribution.",
    table: [
      { label: "1σ", meaning: "Approximately 68% probability" },
      { label: "2σ", meaning: "Approximately 95% probability" },
      { label: "3σ", meaning: "Approximately 99.7% probability" },
    ],
    interpretation: {
      items: [
        "Outside 2σ — historically uncommon move.",
        "Outside 3σ — very rare under a normal distribution.",
      ],
    },
  },
  {
    id: "mean-reversion",
    title: "9. Mean Reversion Meter",
    what: "Shows how far price has moved from its average.",
    interpretation: {
      items: [
        "Higher values mean the move is statistically extended — not a guaranteed reversal.",
        "Always consider the market trend before expecting mean reversion.",
      ],
    },
  },
  {
    id: "health",
    title: "10. Statistical Health",
    what: "Quick summary: trend, percentiles, distribution position, vol regime, and standard deviation.",
    how: "Use as an overview — do not decide from a single metric alone.",
  },
  {
    id: "recommended-action",
    title: "11. Recommended Action",
    what: "Follows the Strategy Mode pill (Selling / Buying / Directional / Neutral).",
    interpretation: {
      items: [
        "Selling — picks highest forward P(OTM) strike; WAIT if Focus is Avoid.",
        "Buying — picks higher P(ITM); premiums cost more when IV > HV.",
        "Dist σ (fwd) — distance from spot in forward expected-move units, not price-mean σ.",
        "Stop on sell picks — premium ceiling (≥₹), not a spot price stop.",
      ],
    },
  },
  {
    id: "focus",
    title: "12. Focus (News / Odd Activity)",
    what: "Flags abnormal price, volume, or volatility — possible news or events. Not a full news feed.",
    table: [
      { label: "Clean", meaning: "No unusual signatures — preferred for option selling" },
      { label: "Caution", meaning: "Some odd activity — verify before selling" },
      { label: "Results soon", meaning: "Earnings/results within ~3 weeks — elevated event risk" },
      { label: "Avoid", meaning: "Strong event/tape risk — fresh sells blocked in analysis" },
    ],
    bullets: [
      "News? — gap, large 1-day move, vol spike, or volume surge (inferred from tape)",
      "Results soon — Yahoo calendar (can be estimates)",
    ],
  },
];

export const OPTIONS_SELLER_ENVIRONMENT = {
  favorable: [
    "Quiet or Normal volatility regime + sideways tape",
    "Price near mean (|Z| small)",
    "Clean focus",
    "High Distribution Confidence",
    "Live IV ≥ HV on the chain (bonus)",
  ],
  higherRisk: [
    "Extreme volatility regime",
    "Low Distribution Confidence",
    "Price far beyond ±2σ",
    "Strong trending market",
    "Focus Avoid / Results soon",
  ],
};
