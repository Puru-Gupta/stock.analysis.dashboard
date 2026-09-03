import { fetchGoogleNewsRss, type RssItem } from "@/lib/data/rss";

export type NewsImportance = "very_important" | "important" | "less_important";

export type NewsCategory =
  | "india_macro"
  | "india_corporate"
  | "global_macro"
  | "geopolitical"
  | "commodities_fx"
  | "sector_auto"
  | "general";

export interface MarketNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
  importance: NewsImportance;
  importance_label: string;
  score: number;
  category: NewsCategory;
  category_label: string;
  reason: string;
  region: "india" | "global";
}

export interface MarketNewsResult {
  items: MarketNewsItem[];
  counts: Record<NewsImportance, number>;
  analyzed_at: string;
  feeds_queried: number;
}

const FEEDS: { query: string; region: "IN" | "US"; defaultCategory: NewsCategory }[] = [
  { query: "India GDP growth inflation IIP PMI economic data", region: "IN", defaultCategory: "india_macro" },
  { query: "RBI repo rate MPC monetary policy India", region: "IN", defaultCategory: "india_macro" },
  { query: "Nifty Sensex FII DII India stock market", region: "IN", defaultCategory: "india_macro" },
  { query: "India earnings quarterly results profit revenue", region: "IN", defaultCategory: "india_corporate" },
  { query: "Hero MotoCorp Maruti Tata Motors auto sales dispatches units", region: "IN", defaultCategory: "sector_auto" },
  { query: "HDFC ICICI SBI banking credit India", region: "IN", defaultCategory: "india_corporate" },
  { query: "Federal Reserve US inflation jobs report recession", region: "US", defaultCategory: "global_macro" },
  { query: "US China tariffs trade war sanctions geopolitical", region: "US", defaultCategory: "geopolitical" },
  { query: "crude oil gold dollar rupee forex commodity", region: "IN", defaultCategory: "commodities_fx" },
  { query: "Middle East war oil supply shock markets", region: "US", defaultCategory: "geopolitical" },
  { query: "SEBI NSE BSE India regulation circuit", region: "IN", defaultCategory: "india_macro" },
  { query: "Union Budget India fiscal deficit", region: "IN", defaultCategory: "india_macro" },
  { query: "India business corporate general news", region: "IN", defaultCategory: "general" },
];

const VERY_IMPORTANT: { pattern: RegExp; reason: string; category?: NewsCategory }[] = [
  { pattern: /\bgdp\b.*\b(growth|data|figures|print|expanded|contracted|economy)\b|\b(growth|data|figures)\b.*\bgdp\b/i, reason: "GDP print moves index earnings assumptions", category: "india_macro" },
  { pattern: /\brbi\b.*\b(repo rate|mpc|monetary policy|rate hike|rate cut|policy rate)\b|\b(repo rate|mpc)\b.*\bindia\b/i, reason: "RBI policy shifts rates, liquidity & valuations", category: "india_macro" },
  { pattern: /\b(federal reserve|fomc)\b.*\b(rate|decision|cut|hike|hold)\b|\bfed\b.*\b(cuts|hikes|holds)\b.*\brate\b/i, reason: "US Fed drives global risk appetite & FII flows", category: "global_macro" },
  { pattern: /\b(cpi|wpi)\b.*\b(data|inflation|print|figures)\b|\binflation\b.*\b(data|surge|spike|cools|rises)\b/i, reason: "Inflation data affects rate expectations", category: "india_macro" },
  { pattern: /\bunion budget\b|\binterim budget\b|\bbudget \d{4}\b/i, reason: "Budget changes taxes, capex & sector outlook", category: "india_macro" },
  { pattern: /\belection\b.*\b(result|results|outcome|verdict)\b|\blok sabha\b.*\b(result|results)\b/i, reason: "Election outcomes reprice policy risk", category: "india_macro" },
  { pattern: /\b(war|invasion|missile strike|military escalation)\b.*\b(ukraine|gaza|iran|middle east|markets)\b/i, reason: "Geopolitical shock → risk-off & crude volatility", category: "geopolitical" },
  { pattern: /\b(circuit breaker|trading halt|market crash|flash crash)\b/i, reason: "Market structure / crash event", category: "india_macro" },
  { pattern: /\bsebi\b.*\b(ban|bars|penalty|investigation)\b/i, reason: "Regulatory action can hit stocks & sentiment", category: "india_macro" },
  { pattern: /\b(tariff|tariffs)\b.*\b(trump|us |china|india|reciprocal|trade war)\b/i, reason: "Tariffs hit exporters, INR & global risk", category: "geopolitical" },
  { pattern: /\b(nonfarm payroll|jobs report)\b.*\b(us|u\.s\.|america)\b|\bus\b.*\b(jobs report|nonfarm)\b/i, reason: "US labour data moves Fed & EM flows", category: "global_macro" },
];

const IMPORTANT: { pattern: RegExp; reason: string; category?: NewsCategory }[] = [
  { pattern: /\b(earnings|quarterly results?|q[1-4]fy\d{2}|net profit|revenue)\b/i, reason: "Corporate earnings affect sector & index weights", category: "india_corporate" },
  { pattern: /\b(sales (fall|drop|decline|down|slump)|units sold|dispatches|wholesale volumes?)\b/i, reason: "Volume trends signal demand — key for auto/consumer", category: "sector_auto" },
  { pattern: /\b(fii|dii)\b.*\b(sell|buy|inflow|outflow|net)\b|\bforeign (inflow|outflow)\b/i, reason: "Institutional flows drive near-term index direction", category: "india_macro" },
  { pattern: /\brupee\b.*\b(rupee|falls?|rises?|weakens?|strengthens?)\b|\b(forex|dollar index)\b/i, reason: "FX moves affect IT, importers & FII returns", category: "commodities_fx" },
  { pattern: /\b(crude|brent|wti)\b.*\b(price|surge|drop|rise|fall)\b|\boil prices?\b/i, reason: "Oil impacts inflation, OMCs & current account", category: "commodities_fx" },
  { pattern: /\b(downgrade|upgrade)\b.*\b(rating|stock|shares)\b|\bguidance (cut|lower|raised)\b/i, reason: "Analyst / mgmt outlook shift", category: "india_corporate" },
  { pattern: /\b(nifty|sensex|bank nifty)\b.*\b(fall|rise|rally|crash|surge|slip|gain|hit|plunge)\b/i, reason: "Index-level move affects option premiums", category: "india_macro" },
  { pattern: /\b(ipo|fpo|qip|block deal|stake sale)\b/i, reason: "Supply / liquidity event in single name", category: "india_corporate" },
  { pattern: /\b(merger|acquisition|takeover|delist)\b/i, reason: "Corporate action → gap risk in options", category: "india_corporate" },
  { pattern: /\bfiscal deficit\b|\biip\b.*\bdata\b|\bpmi\b.*\b(india|data)\b/i, reason: "Macro data release — growth & policy read-through", category: "india_macro" },
  { pattern: /\b(auto sales|two.?wheeler|passenger vehicle|ev sales|hero motocorp|maruti suzuki|tata motors)\b/i, reason: "Auto volume data — sector bellwether", category: "sector_auto" },
  { pattern: /\b(credit growth|npa|bad loan)\b/i, reason: "Banking sector health affects Bank Nifty", category: "india_corporate" },
  { pattern: /\b(trade (war|tension)|sanctions|geopolitical)\b/i, reason: "Global risk sentiment spillover", category: "geopolitical" },
];

const LESS_IMPORTANT: { pattern: RegExp; reason: string }[] = [
  { pattern: /stock to buy|multibagger|top pick|must buy|trade setup for today/i, reason: "Daily setup / promotional content" },
  { pattern: /opinion|editorial|column|podcast|interview with|explainer/i, reason: "Low signal opinion piece" },
  { pattern: /celebrity|cricket|bollywood|wedding|webinar/i, reason: "Non-market noise" },
  { pattern: /share price (today|live)|stock price today/i, reason: "Price ticker — low informational value" },
];

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  india_macro: "India Macro",
  india_corporate: "India Corporate",
  global_macro: "Global Macro",
  geopolitical: "Geopolitical",
  commodities_fx: "Commodities & FX",
  sector_auto: "Auto & Consumer",
  general: "General",
};

const IMPORTANCE_LABELS: Record<NewsImportance, string> = {
  very_important: "Very Important",
  important: "Important",
  less_important: "Less Important",
};

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function scoreItem(
  item: RssItem,
  feedRegion: "IN" | "US",
  defaultCategory: NewsCategory,
): MarketNewsItem {
  const title = item.title;
  let score = feedRegion === "IN" ? 48 : 45;
  let reason = "Market-relevant headline";
  let category = defaultCategory;
  let importance: NewsImportance = "important";
  let matchedVery = false;

  for (const rule of VERY_IMPORTANT) {
    if (rule.pattern.test(title)) {
      score = 92;
      reason = rule.reason;
      if (rule.category) category = rule.category;
      matchedVery = true;
      break;
    }
  }

  if (!matchedVery) {
    for (const rule of IMPORTANT) {
      if (rule.pattern.test(title)) {
        score = Math.max(score, 68);
        reason = rule.reason;
        if (rule.category) category = rule.category;
        break;
      }
    }
  }

  let demoted = false;
  for (const rule of LESS_IMPORTANT) {
    if (rule.pattern.test(title)) {
      score = 32;
      reason = rule.reason;
      demoted = true;
      break;
    }
  }

  if (demoted) importance = "less_important";
  else if (score >= 90) importance = "very_important";
  else if (score >= 52) importance = "important";
  else importance = "less_important";

  return {
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    source: item.source,
    importance,
    importance_label: IMPORTANCE_LABELS[importance],
    score,
    category,
    category_label: CATEGORY_LABELS[category],
    reason,
    region: feedRegion === "IN" ? "india" : "global",
  };
}

function dedupeItems(items: MarketNewsItem[]): MarketNewsItem[] {
  const seen = new Map<string, MarketNewsItem>();
  for (const item of items) {
    const key = normalizeTitle(item.title);
    const existing = seen.get(key);
    if (!existing || item.score > existing.score) seen.set(key, item);
  }
  return [...seen.values()];
}

export async function fetchMarketNews(): Promise<MarketNewsResult> {
  const batches = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const raw = await fetchGoogleNewsRss(f.query, f.region);
      return raw.map((item) => scoreItem(item, f.region, f.defaultCategory));
    }),
  );

  const merged: MarketNewsItem[] = [];
  for (const b of batches) {
    if (b.status === "fulfilled") merged.push(...b.value);
  }

  const deduped = dedupeItems(merged);
  const fullCounts: Record<NewsImportance, number> = {
    very_important: deduped.filter((i) => i.importance === "very_important").length,
    important: deduped.filter((i) => i.importance === "important").length,
    less_important: deduped.filter((i) => i.importance === "less_important").length,
  };

  const byTier = (tier: NewsImportance) =>
    deduped.filter((i) => i.importance === tier).sort((a, b) => Date.parse(b.pubDate || "0") - Date.parse(a.pubDate || "0"));

  const items = [
    ...byTier("very_important").slice(0, 25),
    ...byTier("important").slice(0, 40),
    ...byTier("less_important").slice(0, 20),
  ];

  return {
    items,
    counts: fullCounts,
    analyzed_at: new Date().toISOString(),
    feeds_queried: FEEDS.length,
  };
}
