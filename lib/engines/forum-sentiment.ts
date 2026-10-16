import {
  fetchForumAiSummary,
  fetchForumMessages,
  searchMoneycontrolStock,
  stripHtml,
  tickerFromSymbol,
  type McForumMessage,
} from "@/lib/data/moneycontrol-forum";

export type ForumBias = "bullish" | "bearish" | "mixed" | "neutral";

export interface ForumPostSample {
  text: string;
  user: string;
  posted_at: string;
  bias: "bullish" | "bearish" | "neutral";
}

export interface ForumSentiment {
  source: string;
  company: string;
  sc_id: string;
  forum_url: string;
  crowd: { buy_pct: number; sell_pct: number; hold_pct: number };
  crowd_source: "posts";
  scored_n: number;
  language_score: number;
  language_bias: ForumBias;
  overall: ForumBias;
  overall_label: string;
  summary: string;
  post_count: number;
  follower_count: number | null;
  sample_posts: ForumPostSample[];
  note: string;
}

const BULL: { re: RegExp; w: number }[] = [
  { re: /\b(buy|buying|accumulate|accumulating|long|bullish|breakout|target|upside|undervalued|multibagger|moon|ath|all.?time high)\b/i, w: 2 },
  { re: /\b(strong buy|add more|holding strong|go long|dip buy|buy on dips|buy immediately)\b/i, w: 2.5 },
  { re: /\b(beat|upgrade|blockbuster|record|outperform)\b/i, w: 1.5 },
];

const BEAR: { re: RegExp; w: number }[] = [
  { re: /\b(sell|selling|exit|dump|short|bearish|crash|collapse|overvalued|avoid|trap|dead)\b/i, w: 2 },
  { re: /\b(book profit|cut loss|get out|no earnings|pathetic|worthless|downgrade)\b/i, w: 2.5 },
  { re: /\b(fall|falls|weak|weakness|correction|breakdown|miss|hurdle)\b/i, w: 1.5 },
];

function scoreText(text: string): { bias: "bullish" | "bearish" | "neutral" } {
  let bull = 0;
  let bear = 0;
  for (const p of BULL) if (p.re.test(text)) bull += p.w;
  for (const p of BEAR) if (p.re.test(text)) bear += p.w;
  if (bull > bear + 0.4) return { bias: "bullish" };
  if (bear > bull + 0.4) return { bias: "bearish" };
  return { bias: "neutral" };
}

function classifyMessages(msgs: McForumMessage[]): ForumPostSample[] {
  const out: ForumPostSample[] = [];
  for (const m of msgs) {
    const text = stripHtml(m.message || m.heading || "");
    if (text.length < 8) continue;
    const { bias } = scoreText(text);
    out.push({
      text: text.slice(0, 220),
      user: m.user_nick_name || m.uidNickname || m.user_id || "boarder",
      posted_at: m.ent_date || m.date_str || "",
      bias,
    });
  }
  return out;
}

function pickSamples(all: ForumPostSample[], n = 8): ForumPostSample[] {
  const bulls = all.filter((p) => p.bias === "bullish");
  const bears = all.filter((p) => p.bias === "bearish");
  const rest = all.filter((p) => p.bias === "neutral");
  const picked: ForumPostSample[] = [];
  if (bulls[0]) picked.push(bulls[0]);
  if (bears[0]) picked.push(bears[0]);
  if (bulls[1]) picked.push(bulls[1]);
  if (bears[1]) picked.push(bears[1]);
  for (const p of [...rest, ...bulls.slice(2), ...bears.slice(2)]) {
    if (picked.length >= n) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked.slice(0, n);
}

function languageScore(posts: ForumPostSample[]) {
  if (!posts.length) return 50;
  let bull = 0;
  let bear = 0;
  for (const p of posts) {
    if (p.bias === "bullish") bull++;
    else if (p.bias === "bearish") bear++;
  }
  return Math.round(50 + ((bull - bear) / posts.length) * 50);
}

function crowdFromPosts(posts: ForumPostSample[]) {
  const n = posts.length || 1;
  const buy = posts.filter((p) => p.bias === "bullish").length;
  const sell = posts.filter((p) => p.bias === "bearish").length;
  const hold = posts.filter((p) => p.bias === "neutral").length;
  return {
    buy_pct: Math.round((buy / n) * 100),
    sell_pct: Math.round((sell / n) * 100),
    hold_pct: Math.round((hold / n) * 100),
  };
}

function biasFromScore(score: number, n: number): ForumBias {
  if (n < 5) return "neutral";
  if (score >= 62) return "bullish";
  if (score <= 38) return "bearish";
  if (score >= 45 && score <= 55) return "neutral";
  return "mixed";
}

function labelFor(bias: ForumBias, crowd: { buy_pct: number; sell_pct: number; hold_pct: number }, n: number) {
  if (n < 5) return `Too few recent posts to call a crowd (${n} scored) — treat as no view`;
  if (bias === "bullish") return `Recent board posts lean bullish (${crowd.buy_pct}% buy-ish vs ${crowd.sell_pct}% sell-ish of ${n} posts)`;
  if (bias === "bearish") return `Recent board posts lean bearish (${crowd.sell_pct}% sell-ish vs ${crowd.buy_pct}% buy-ish of ${n} posts)`;
  if (bias === "mixed") return `Public posts are split — ${crowd.buy_pct}% buy-ish, ${crowd.sell_pct}% sell-ish, ${crowd.hold_pct}% unclear`;
  return `No strong lean in recent posts (${crowd.hold_pct}% unclear of ${n})`;
}

export async function analyzeForumSentiment(symbol: string): Promise<ForumSentiment | null> {
  const ticker = tickerFromSymbol(symbol);
  if (!ticker || /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|\^)/i.test(ticker)) return null;

  const hit = await searchMoneycontrolStock(symbol);
  if (!hit?.sc_id) return null;

  const topicId = hit.forum_topics_url?.match(/-(\d+)\.html/i)?.[1] || null;
  if (!topicId) return null;

  const scId = hit.sc_id;
  const [board, rawSummary] = await Promise.all([
    fetchForumMessages(topicId, 40),
    fetchForumAiSummary(topicId, scId),
  ]);

  const classified = classifyMessages(board.messages);
  const crowd = crowdFromPosts(classified);
  const lang = languageScore(classified);
  const overall = biasFromScore(lang, classified.length);
  const company = board.topic?.SC_FULLNAME || board.topic?.topicName || hit.stock_name || ticker;
  const followers = board.topic?.folowr_count != null ? Number(board.topic.folowr_count) : null;
  const postCount = board.topic?.msg_count != null ? Number(board.topic.msg_count) : classified.length;
  const summary = stripHtml(rawSummary).slice(0, 420);

  return {
    source: "Moneycontrol forum",
    company,
    sc_id: scId,
    forum_url: hit.forum_topics_url || `https://mmb.moneycontrol.com/forum-topics/stocks/${topicId}.html`,
    crowd,
    crowd_source: "posts",
    scored_n: classified.length,
    language_score: lang,
    language_bias: overall,
    overall,
    overall_label: labelFor(overall, crowd, classified.length),
    summary: summary || "No AI digest available — scored from recent board posts.",
    post_count: Number.isFinite(postCount) ? postCount : classified.length,
    follower_count: Number.isFinite(followers as number) ? followers : null,
    sample_posts: pickSamples(classified),
    note: "Scored from recent Moneycontrol board posts, not their 100% Buy sentimeter widget (that feed is unreliable). Retail chatter, not advice.",
  };
}
