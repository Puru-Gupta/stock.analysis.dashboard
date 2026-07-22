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
    title: "4. Distribution Confidence",
    what: "Range: 0–100. Measures how well historical prices match the normal-distribution model.",
    table: [
      { label: "80–100", meaning: "Highly reliable" },
      { label: "60–80", meaning: "Good" },
      { label: "40–60", meaning: "Use caution" },
      { label: "Below 40", meaning: "Normal-distribution assumptions are weak" },
    ],
    interpretation: {
      items: [
        "Higher confidence — historical behavior closely matches the statistical model.",
        "Lower confidence — treat probabilities as rough estimates, not precise forecasts.",
      ],
    },
  },
  {
    id: "iv-rank",
    title: "5. IV Rank",
    what: "Shows where today's implied volatility sits relative to the past year.",
    table: [
      { label: "0–20", meaning: "Low IV" },
      { label: "20–50", meaning: "Normal" },
      { label: "50–80", meaning: "High" },
      { label: "Above 80", meaning: "Very High" },
    ],
    interpretation: {
      items: [
        "Higher IV generally means richer option premiums.",
        "Lower IV usually means cheaper premiums.",
      ],
    },
  },
  {
    id: "hv-iv",
    title: "6. HV vs IV",
    what: "Compares Historical Volatility vs Implied Volatility.",
    interpretation: {
      items: [
        "IV > HV — Options price in more movement than recently occurred. Generally more favorable for option sellers.",
        "IV < HV — Options may be relatively inexpensive. Can be more attractive for option buyers.",
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
    id: "focus",
    title: "11. Focus (News / Odd Activity)",
    what: "Flags stocks with abnormal price, volume, or volatility — possible news or events.",
    table: [
      { label: "Clean", meaning: "No unusual signatures — preferred for option selling" },
      { label: "Caution", meaning: "Some odd activity — verify before selling" },
      { label: "News / odd", meaning: "Likely event/news — avoid or use very wide strikes" },
    ],
    bullets: [
      "News? — gap, large 1-day move, vol spike, or volume surge together",
      "Tags like Gap open, Vol spike, Volume surge explain what triggered the flag",
    ],
  },
];

export const OPTIONS_SELLER_ENVIRONMENT = {
  favorable: [
    "IV higher than Historical Volatility",
    "Quiet or Normal volatility regime",
    "High Distribution Confidence",
    "Price within or only moderately outside expected ranges",
    "Stable trend",
  ],
  higherRisk: [
    "Extreme volatility regime",
    "Low Distribution Confidence",
    "Price far beyond ±2σ",
    "Strong trending market",
    "Major news or earnings events",
  ],
};
