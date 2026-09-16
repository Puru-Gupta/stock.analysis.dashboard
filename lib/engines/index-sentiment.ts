import { fetchGoogleNewsRss } from "@/lib/data/rss";
import type { IndianIndexDef } from "@/lib/data/indian-indices";
import { fetchMarketNews } from "./market-news";

export type SentimentBias = "bullish" | "bearish" | "neutral";

export interface SentimentHeadline {
  title: string;
  source?: string;
  bias: SentimentBias;
  weight: number;
  channel: "news" | "reddit" | "portal";
}

export interface IndexSentimentSnapshot {
  score: number;
  bias: SentimentBias;
  label: string;
  bull_count: number;
  bear_count: number;
  neutral_count: number;
  headlines: SentimentHeadline[];
  channels: { news: number; reddit: number; portal: number };
}

const BULL_PATTERNS: { re: RegExp; w: number }[] = [
  { re: /\b(rally|rallies|surge|soar|jump|gain|gains|rebound|recovery|bullish|breakout|record high|all.?time high)\b/i, w: 2 },
  { re: /\b(rate cut|repo cut|dovish|stimulus|fiscal boost|upgrade|beats? estimate|strong earnings)\b/i, w: 2.5 },
  { re: /\b(fii|foreign investor).*\b(buy|inflow|net buyer)\b/i, w: 2 },
  { re: /\b(dii).*\b(buy|inflow|support)\b/i, w: 1.5 },
  { re: /\b(cooling inflation|disinflation|soft landing)\b/i, w: 1.5 },
];

const BEAR_PATTERNS: { re: RegExp; w: number }[] = [
  { re: /\b(fall|falls|drop|drops|slip|slips|plunge|crash|selloff|sell.?off|bearish|tumble|weakness)\b/i, w: 2 },
  { re: /\b(rate hike|tightening|hawkish|recession|slowdown|contraction|miss(es)? estimate|downgrade)\b/i, w: 2.5 },
  { re: /\b(fii|foreign investor).*\b(sell|outflow|net seller)\b/i, w: 2 },
  { re: /\b(war|escalation|sanctions|geopolitical|tariff|trade war)\b/i, w: 2 },
  { re: /\b(crude surge|oil spike|rupee fall|rupee weakens)\b/i, w: 1.5 },
  { re: /\b(circuit|halt|volatility shock|flash crash)\b/i, w: 3 },
];

function scoreHeadline(title: string): { bias: SentimentBias; weight: number } {
  let bull = 0;
  let bear = 0;
  for (const p of BULL_PATTERNS) {
    if (p.re.test(title)) bull += p.w;
  }
  for (const p of BEAR_PATTERNS) {
    if (p.re.test(title)) bear += p.w;
  }
  if (bull > bear + 0.5) return { bias: "bullish", weight: bull };
  if (bear > bull + 0.5) return { bias: "bearish", weight: bear };
  return { bias: "neutral", weight: 1 };
}

function matchesIndex(title: string, index: IndianIndexDef, global = false) {
  const t = title.toLowerCase();
  if (global) return true;
  if (index.id === "nifty") {
    return index.news_terms.some((term) => t.includes(term)) || /\b(india|indian)\b.*\b(market|stocks|equity)\b/i.test(t);
  }
  return index.news_terms.some((term) => t.includes(term));
}

async function fetchChannelHeadlines(
  query: string,
  channel: SentimentHeadline["channel"],
  index: IndianIndexDef,
  global = false,
): Promise<SentimentHeadline[]> {
  try {
    const items = await fetchGoogleNewsRss(query, "IN");
    const out: SentimentHeadline[] = [];
    for (const item of items) {
      if (!matchesIndex(item.title, index, global)) continue;
      const { bias, weight } = scoreHeadline(item.title);
      out.push({
        title: item.title,
        source: item.source,
        bias,
        weight,
        channel,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function analyzeIndexSentiment(index: IndianIndexDef): Promise<IndexSentimentSnapshot> {
  const [marketNews, reddit, portals] = await Promise.all([
    fetchMarketNews().catch(() => null),
    fetchChannelHeadlines(`site:reddit.com ${index.label} OR ${index.nse_chain} India`, "reddit", index, index.id === "nifty"),
    fetchChannelHeadlines(`${index.label} ${index.nse_chain} forecast outlook today`, "portal", index, index.id === "nifty"),
  ]);

  const headlines: SentimentHeadline[] = [...reddit, ...portals];

  if (marketNews?.items) {
    for (const item of marketNews.items.slice(0, 40)) {
      if (!matchesIndex(item.title, index, index.id === "nifty")) continue;
      const { bias, weight } = scoreHeadline(item.title);
      const newsWeight = item.importance === "very_important" ? weight * 2 : item.importance === "important" ? weight * 1.4 : weight;
      headlines.push({
        title: item.title,
        source: item.source,
        bias,
        weight: newsWeight,
        channel: "news",
      });
    }
  }

  const deduped = new Map<string, SentimentHeadline>();
  for (const h of headlines) {
    const key = h.title.toLowerCase().slice(0, 60);
    const prev = deduped.get(key);
    if (!prev || h.weight > prev.weight) deduped.set(key, h);
  }
  const unique = [...deduped.values()].sort((a, b) => b.weight - a.weight).slice(0, 12);

  let bullW = 0;
  let bearW = 0;
  let neutW = 0;
  for (const h of unique) {
    if (h.bias === "bullish") bullW += h.weight;
    else if (h.bias === "bearish") bearW += h.weight;
    else neutW += h.weight;
  }

  const total = bullW + bearW + neutW || 1;
  const score = Math.round(50 + ((bullW - bearW) / total) * 50);
  const clamped = Math.min(100, Math.max(0, score));

  let bias: SentimentBias = "neutral";
  if (clamped >= 58) bias = "bullish";
  else if (clamped <= 42) bias = "bearish";

  const label =
    bias === "bullish"
      ? `News/social tilt bullish (${clamped}/100)`
      : bias === "bearish"
        ? `News/social tilt bearish (${clamped}/100)`
        : `Mixed headlines (${clamped}/100)`;

  return {
    score: clamped,
    bias,
    label,
    bull_count: unique.filter((h) => h.bias === "bullish").length,
    bear_count: unique.filter((h) => h.bias === "bearish").length,
    neutral_count: unique.filter((h) => h.bias === "neutral").length,
    headlines: unique,
    channels: {
      news: unique.filter((h) => h.channel === "news").length,
      reddit: unique.filter((h) => h.channel === "reddit").length,
      portal: unique.filter((h) => h.channel === "portal").length,
    },
  };
}
