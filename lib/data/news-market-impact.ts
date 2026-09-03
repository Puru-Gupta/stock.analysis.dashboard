const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "will", "says", "said", "after", "into", "over",
  "india", "indian", "stock", "market", "markets", "news", "live", "today", "latest",
]);

export type StoryDirection = "positive" | "negative" | "neutral";

export function inferStoryKey(title: string): string {
  const t = title.toLowerCase();
  if (/\b(rbi|mpc)\b/.test(t) || /repo rate/.test(t)) return "rbi_mpc";
  if (/\bgdp\b/.test(t)) return "gdp";
  if (/\b(cpi|wpi)\b/.test(t) || /\binflation\b/.test(t)) return "inflation";
  if (/\bfiscal deficit\b/.test(t)) return "fiscal_deficit";
  if (/\b(fed|fomc|federal reserve)\b/.test(t)) return "fed";
  if (/\b(fii|dii)\b/.test(t) || /foreign (inflow|outflow)/.test(t)) return "institutional_flows";
  if (/hero motocorp|maruti|auto sales|two.?wheeler|dispatches|units sold|wholesale/.test(t)) return "auto_sales";
  if (/\bearnings\b|quarterly result|net profit|q[1-4]fy/.test(t)) return "earnings";
  if (/\b(crude|brent|oil price)/.test(t)) return "oil";
  if (/\brupee\b/.test(t)) return "rupee";
  if (/\btariff|trade war/.test(t)) return "tariffs";
  if (/\bbudget\b/.test(t)) return "budget";
  if (/\b(war|geopolitical|sanctions|missile)\b/.test(t)) return "geopolitical";
  if (/\b(nifty|sensex|bank nifty)\b/.test(t)) return "index_move";
  if (/\b(npa|credit growth|banking)\b/.test(t)) return "banking";
  if (/\b(iip|pmi)\b/.test(t)) return "activity_data";
  if (/\b(jobs report|nonfarm)\b/.test(t)) return "us_jobs";

  const words = t
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .slice(0, 5)
    .sort()
    .join("_");
  return words || "general";
}

export function inferDirection(title: string): StoryDirection {
  const t = title.toLowerCase();
  if (
    /\b(fall|falls|fell|drop|drops|decline|declines|down|slump|weak|cuts?|cutting|sell|selling|outflow|crash|plunge|miss|disappoint)\b/.test(
      t,
    )
  ) {
    return "negative";
  }
  if (
    /\b(rise|rises|rose|surge|gain|gains|up|strong|beats?|hike|hikes|inflow|rally|record high|expands?)\b/.test(
      t,
    )
  ) {
    return "positive";
  }
  if (/\b(unchanged|holds?|held|steady|flat|neutral|in line)\b/.test(t)) return "neutral";
  return "neutral";
}

type ImpactCopy = { market_impact: string; seller_action: string };

const STORY_IMPACT: Record<string, Record<StoryDirection, ImpactCopy>> = {
  rbi_mpc: {
    positive: {
      market_impact:
        "Rate cut / dovish RBI boosts liquidity → lower discount rates, higher P/E tolerance. Banks may compress NIM short-term but rate-sensitive stocks (realty, autos, NBFCs) rally. FII flows into EM often improve.",
      seller_action:
        "IV can crush after dovish surprise — good for existing short premium, risky to initiate strangles before MPC. Widen wings if selling into meeting week.",
    },
    negative: {
      market_impact:
        "Hawkish hold or hike tightens financial conditions → pressure on leveraged sectors, midcaps, and long-duration equities. Rupee may firm but growth stocks de-rate.",
      seller_action:
        "Gap-down risk on Bank Nifty & rate-sensitive names. Avoid fresh naked strangles 2–3 sessions before MPC; post-event IV spike can help sellers only if spot stabilizes.",
    },
    neutral: {
      market_impact:
        "Status-quo RBI keeps focus on inflation/growth balance — market reads statement tone & GDP/inflation forecasts. No immediate re-rating unless guidance shifts.",
      seller_action:
        "MPC week = elevated event vol. Prefer defined-risk spreads; if repo held, fade IV only after first 30–60 min show direction.",
    },
  },
  gdp: {
    positive: {
      market_impact:
        "Strong GDP print supports earnings upgrades for cyclicals (banks, capital goods, autos, infra). Nifty bias risk-on; rupee stable. Weak GDP sectors (defensives) may lag.",
      seller_action:
        "Gap-up risk on release morning — do not sell tight calls on index before data. Post-print, if move < 1σ, short strangles become viable again.",
    },
    negative: {
      market_impact:
        "Soft GDP signals demand slowdown → FII may trim India weight, INR weakens, mid/smallcaps underperform. Consumption & rural-linked names hit first.",
      seller_action:
        "Downside tail risk rises for 1–2 sessions. Widen put wings or skip fresh sells until VIX mean-reverts after spike.",
    },
    neutral: {
      market_impact:
        "In-line GDP rarely moves index alone — market cares more vs consensus and composition (consumption vs govt spend). Sector rotation matters more than headline.",
      seller_action:
        "Treat as low gap risk if in-line; standard weekly strangle rules apply if VIX normal.",
    },
  },
  inflation: {
    positive: {
      market_impact:
        "Cooling CPI/WPI eases rate-cut hopes timeline → bonds rally, growth stocks breathe. OMCs & consumption benefit if driven by food/fuel easing.",
      seller_action:
        "IV may drop post-data — existing shorts benefit. New sells OK if spot range-bound after first hour.",
    },
    negative: {
      market_impact:
        "Hot inflation print pushes back RBI cut expectations → financials & long-duration equities sell off. INR pressure if imported inflation (crude-linked).",
      seller_action:
        "Expect vol expansion — avoid selling ATM strangles into print. Use wider strikes or wait 1 session.",
    },
    neutral: {
      market_impact:
        "Inflation in line → focus on core vs headline. Market looks at RBI reaction function for next MPC.",
      seller_action:
        "Moderate event risk; check India VIX level before sizing weekly premium sells.",
    },
  },
  auto_sales: {
    positive: {
      market_impact:
        "Strong dispatches (Hero, Maruti, etc.) confirm demand recovery → auto index outperforms, positive read-through for rural economy & NBFCs.",
      seller_action:
        "Single-name gap-up risk on sales day — avoid short calls on reporting stock. Index auto weight limits Nifty impact unless multiple OEMs weak.",
    },
    negative: {
      market_impact:
        "Falling units sold (e.g. Hero two-wheeler decline) signals demand stress → auto stocks gap down, drags consumer discretionary basket. Rural sentiment negative.",
      seller_action:
        "Do not sell strangles on affected OEM before/ on sales release. For index sellers, widen range if holding through auto-heavy week.",
    },
    neutral: {
      market_impact:
        "Mixed auto volumes → stock-specific moves; sector index may chop. Watch market share shifts between OEMs.",
      seller_action:
        "Stock-specific risk only — check Focus flag on name before selling.",
    },
  },
  institutional_flows: {
    positive: {
      market_impact:
        "FII net buying supports Nifty/Bank Nifty near-term — reduces downside follow-through. DII buying offsets global risk-off.",
      seller_action:
        "Tail risk on puts reduces slightly — but do not oversize; one day flow ≠ trend. FII buying + falling VIX = friendlier sell environment.",
    },
    negative: {
      market_impact:
        "FII selling often accelerates INR weakness & large-cap pressure — Nifty puts gain, midcaps suffer. Global cue alignment critical.",
      seller_action:
        "Put-side tail risk elevated — widen put strikes or reduce size on weekly strangles until flows stabilize 2–3 sessions.",
    },
    neutral: {
      market_impact:
        "Balanced FII/DII flows → index drift driven by global cues & stock-specific news.",
      seller_action:
        "Standard sizing; focus on VIX & expiry-week technicals.",
    },
  },
  fed: {
    positive: {
      market_impact:
        "Dovish Fed (cut/pause) → EM inflows, USD softens, Nifty opens gap-up risk. IT may lag on USD; exporters benefit.",
      seller_action:
        "Global event — Indian open gap risk. No fresh index strangles before US decision; sell after opening range established.",
    },
    negative: {
      market_impact:
        "Hawkish Fed → risk-off globally, FII outflows from India, INR weak. High-beta & midcaps underperform.",
      seller_action:
        "Overnight gap risk on Nifty — avoid naked short puts. Post-gap, IV rich → consider defined-risk only.",
    },
    neutral: {
      market_impact:
        "Fed hold with neutral tone → markets parse dot plot & Powell commentary. India follows US futures direction at open.",
      seller_action:
        "Trade after 9:30–10:00 IST once global reaction digested.",
    },
  },
  oil: {
    positive: {
      market_impact:
        "Crude spike → INR pressure, OMC & airline pain, inflation fears. Defensives & IT relatively better; RBI hawkish risk rises.",
      seller_action:
        "Geopolitical oil shock = fat-tail week — skip tight strangles on Nifty & OMC names.",
    },
    negative: {
      market_impact:
        "Crude drop eases CAD/inflation worries → OMCs rally, RBI has more room to ease. Risk-on for domestic cyclicals.",
      seller_action:
        "Mild tailwind for range-bound selling if drop is gradual; gap risk lower than spike scenario.",
    },
    neutral: {
      market_impact:
        "Stable oil → macro backdrop neutral; sector impact limited unless INR moves sharply.",
      seller_action:
        "Normal vol regime if VIX < 15 on India.",
    },
  },
  geopolitical: {
    positive: {
      market_impact:
        "De-escalation headlines → risk-on, crude softens, VIX contracts. Short covering rally possible.",
      seller_action:
        "IV crush opportunity for existing shorts; new sells after vol normalizes.",
    },
    negative: {
      market_impact:
        "War / escalation → global risk-off, crude up, gold up, Nifty gaps down. Correlation goes to 1 — diversification fails.",
      seller_action:
        "Event week — no naked strangles. Cash or very wide wings only; expect breach of normal ±1σ bands.",
    },
    neutral: {
      market_impact:
        "Geopolitical noise without escalation → elevated VIX but range may hold until next headline.",
      seller_action:
        "Size down 30–50% vs normal weekly sell.",
    },
  },
  earnings: {
    positive: {
      market_impact:
        "Beat & raise → stock gaps up, may lift sector if heavy weight (Reliance, HDFC Bank). Index impact proportional to weight.",
      seller_action:
        "Never sell strangles on reporting stock into results. For index, gap risk modest unless mega-cap reports.",
    },
    negative: {
      market_impact:
        "Miss / guidance cut → sharp gap down, sector contagion if bellwether. Put skew steepens.",
      seller_action:
        "Avoid short puts on name & peers pre-results. Post-gap, wait for IV peak before considering fade.",
    },
    neutral: {
      market_impact:
        "In-line results → often sell-the-news unless guidance surprises. Stock-specific chop.",
      seller_action:
        "Results day = stock vol >> index vol — trade index, not the reporting name.",
    },
  },
  fiscal_deficit: {
    positive: {
      market_impact:
        "Narrower deficit → fiscal discipline positive for bonds & rupee; govt capex names supported if spend quality high.",
      seller_action:
        "Low gap risk unless combined with Budget day — treat as macro background.",
    },
    negative: {
      market_impact:
        "Wider deficit → borrowing concerns, bond yields up, pressure on long-duration equities. INR may weaken.",
      seller_action:
        "Bank Nifty sensitive to yield move — check 10Y G-sec reaction before selling weekly options.",
    },
    neutral: {
      market_impact:
        "In-line fiscal data — market cares more about revenue vs expenditure mix and FY target path.",
      seller_action:
        "Standard rules unless released with Budget.",
    },
  },
  budget: {
    positive: {
      market_impact:
        "Market-friendly Budget (tax cuts, capex push) → infra, defence, railways rally; consumption if disposable income rises.",
      seller_action:
        "Budget day = max gap risk — no naked index strangles. Sell only after 11:00–12:00 IST once range forms.",
    },
    negative: {
      market_impact:
        "Tax hikes / LTCG changes / fiscal slippage → broad risk-off, sector-specific hits per fine print.",
      seller_action:
        "Avoid all fresh premium sells on Budget day; IV underprices tail risk until speech ends.",
    },
    neutral: {
      market_impact:
        "Budget in line → sector winners/losers from fine print; index may chop in wide range.",
      seller_action:
        "Use wider wings; reduce size 50% on Budget session.",
    },
  },
  tariffs: {
    positive: {
      market_impact:
        "Tariff relief / trade deal → exporters (IT, pharma, textiles) rally, INR firms, risk-on.",
      seller_action:
        "Gap-up risk on export-heavy names — index impact if large FII re-risk.",
    },
    negative: {
      market_impact:
        "New tariffs (US-China-India) → supply chain disruption fears, auto/steel/aluminium hit, global risk-off spills to Nifty.",
      seller_action:
        "Fat-tail week — skip tight strangles; geopolitical + trade headlines cluster.",
    },
    neutral: {
      market_impact:
        "Tariff rhetoric without action → headline volatility, range may hold.",
      seller_action:
        "Elevated VIX — size down.",
    },
  },
  rupee: {
    positive: {
      market_impact:
        "Stronger rupee → IT underperforms (USD revenue), importers benefit. FII USD returns improve on margin.",
      seller_action:
        "Sector rotation > index move — Nifty impact usually <0.5% unless sharp.",
    },
    negative: {
      market_impact:
        "INR weakness → FII selling accelerates, import costs up, RBI intervention risk. IT outperforms relatively.",
      seller_action:
        "Put tail risk on index rises with sustained INR fall — widen put wing.",
    },
    neutral: {
      market_impact:
        "Rupee range-bound → limited index impact.",
      seller_action:
        "Normal sell environment if other macros calm.",
    },
  },
  banking: {
    positive: {
      market_impact:
        "Strong credit growth, falling NPAs → Bank Nifty leads rally, supports broader index.",
      seller_action:
        "Bank Nifty weekly strangles need wider wings on results cluster weeks.",
    },
    negative: {
      market_impact:
        "Rising NPAs / weak credit → Bank Nifty drags Nifty; financials are ~35%+ of index.",
      seller_action:
        "Avoid heavy Bank Nifty short put exposure until sector stabilizes.",
    },
    neutral: {
      market_impact:
        "Mixed banking data → stock-specific within Bank Nifty.",
      seller_action:
        "Check largest weight (HDFC, ICICI) news before selling Bank Nifty.",
    },
  },
  index_move: {
    positive: {
      market_impact:
        "Sharp Nifty rally → call writers hurt, FOMO inflows possible. VIX may fall (vol crush) if move is orderly.",
      seller_action:
        "After large up day, avoid chasing short calls — mean reversion risk next session.",
    },
    negative: {
      market_impact:
        "Sharp fall → put writers tested, VIX spikes, margin calls cascade. Often overshoots before bounce.",
      seller_action:
        "Do not sell puts into falling knife; wait for VIX peak & stabilizing close.",
    },
    neutral: {
      market_impact:
        "Index headline without clear direction — often recap of session.",
      seller_action:
        "Low incremental information.",
    },
  },
  activity_data: {
    positive: {
      market_impact:
        "Strong IIP/PMI → cyclicals bid, growth optimism, supports RBI growth forecast.",
      seller_action:
        "Minor gap risk — macro data tier below GDP/RBI.",
    },
    negative: {
      market_impact:
        "Weak PMI/IIP → growth worry, cyclicals sold, defensives hold up.",
      seller_action:
        "Modest tail risk — size normally unless combined with other negatives.",
    },
    neutral: {
      market_impact:
        "In-line activity data — background macro.",
      seller_action:
        "Standard weekly sell rules.",
    },
  },
  us_jobs: {
    positive: {
      market_impact:
        "Weak US jobs → Fed cut odds rise → EM rally at Indian open. Risk-on for Nifty.",
      seller_action:
        "Overnight gap risk — wait for open before new index sells.",
    },
    negative: {
      market_impact:
        "Hot jobs print → yields up, Fed hawkish, FII risk-off from EM including India.",
      seller_action:
        "Friday US jobs = Monday India gap risk. No weekend-held naked strangles.",
    },
    neutral: {
      market_impact:
        "Jobs in line → follow US equity close direction.",
      seller_action:
        "Trade after opening range.",
    },
  },
};

const DEFAULT_IMPACT: Record<StoryDirection, ImpactCopy> = {
  positive: {
    market_impact:
      "Headline skews risk-on for Indian equities — watch if FII flows confirm. Sector impact depends on story detail.",
    seller_action:
      "Check if move is stock-specific or index-wide before selling; widen wings if VIX elevated.",
  },
  negative: {
    market_impact:
      "Headline adds downside risk or vol — correlations rise, gaps more likely than normal session.",
    seller_action:
      "Reduce position size; prefer defined-risk spreads over naked strangles until clarity.",
  },
  neutral: {
    market_impact:
      "Moderate market relevance — may affect sentiment but unlikely alone to shift Nifty trend without follow-through.",
    seller_action:
      "Use standard VIX-based sizing; verify with price action before fresh premium sells.",
  },
};

export function marketImpactForStory(storyKey: string, title: string): ImpactCopy {
  const direction = inferDirection(title);
  const table = STORY_IMPACT[storyKey];
  if (table) return table[direction];
  return DEFAULT_IMPACT[direction];
}
