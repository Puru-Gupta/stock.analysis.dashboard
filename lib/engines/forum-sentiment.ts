import {
  fetchForumAiSummary,
  fetchForumCrowd,
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
  { re: /\b(strong buy|add more|holding strong|go long|dip buy|buy on dips)\b/i, w: 2.5 },
  { re: /\b(beat|upgrade|blockbuster|record|growth|outperform)\b/i, w: 1.5 },
];

const BEAR: { re: RegExp; w: number }[] = [
  { re: /\b(sell|selling|exit|dump|short|bearish|crash|collapse|overvalued|avoid|trap|dead)\b/i, w: 2 },
  { re: /\b(book profit|cut loss|get out|no earnings|pathetic|worthless|downgrade)\b/i, w: 2.5 },
  { re: /\b(fall|falls|weak|weakness|correction|breakdown|miss)\b/i, w: 1.5 },
];

function scoreText(text: string): { bias: "bullish" | "bearish" | "neutral"; bull: number; bear: number } {
  let bull = 0;
  let bear = 0;
  for (const p of BULL) if (p.re.test(text)) bull += p.w;
  for (const p of BEAR) if (p.re.test(text)) bear += p.w;
  if (bull > bear + 0.4) return { bias: "bullish", bull, bear };
  if (bear > bull + 0.4) return { bias: "bearish", bull, bear };
  return { bias: "neutral", bull, bear };
}

function languageScore(posts: { bias: string }[]) {
  if (!posts.length) return 50;
  let bull = 0;
  let bear = 0;
  for (const p of posts) {
    if (p.bias === "bullish") bull++;
    else if (p.bias === "bearish") bear++;
  }
  const total = posts.length;
  return Math.round(50 + ((bull - bear) / total) * 50);
}

function biasFromScore(score: number): ForumBias {
  if (score >= 62) return "bullish";
  if (score <= 38) return "bearish";
  if (score >= 45 && score <= 55) return "neutral";
  return "mixed";
}

function labelFor(bias: ForumBias, crowd: { buy_pct: number; sell_pct: number; hold_pct: number }) {
  if (bias === "bullish") {
    return crowd.buy_pct >= 60
      ? `Retail forum is net bullish — ${crowd.buy_pct}% crowd Buy`
      : "Recent Moneycontrol posts lean bullish";
  }
  if (bias === "bearish") {
    return crowd.sell_pct >= 60
      ? `Retail forum is net bearish — ${crowd.sell_pct}% crowd Sell`
      : "Recent Moneycontrol posts lean bearish";
  }
  if (bias === "mixed") return "Public opinion is split — bullish and bearish posts both active";
  return "No strong crowd view — posts are mixed or quiet";
}

function sampleFromMessages(msgs: McForumMessage[]): ForumPostSample[] {
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
    if (out.length >= 8) break;
  }
  return out;
}

export async function analyzeForumSentiment(symbol: string): Promise<ForumSentiment | null> {
  const ticker = tickerFromSymbol(symbol);
  if (!ticker || /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|\^)/i.test(ticker)) return null;

  const hit = await searchMoneycontrolStock(symbol);
  if (!hit?.sc_id) return null;

  const topicId =
    hit.forum_topics_url?.match(/-(\d+)\.html/i)?.[1] ||
    null;
  if (!topicId) return null;

  const scId = hit.sc_id;
  const [board, crowd, rawSummary] = await Promise.all([
    fetchForumMessages(topicId, 30),
    fetchForumCrowd(scId),
    fetchForumAiSummary(topicId, scId),
  ]);

  const samples = sampleFromMessages(board.messages);
  const lang = languageScore(samples);
  const crowdWeight = crowd.buy_pct + crowd.sell_pct + crowd.hold_pct > 0 ? 0.55 : 0;
  const crowdScore = crowd.buy_pct; // 0–100 buy share of sentimeter
  const blended = Math.round(crowdWeight * crowdScore + (1 - crowdWeight) * lang);
  const overall = biasFromScore(blended);
  const company = board.topic?.SC_FULLNAME || board.topic?.topicName || hit.stock_name || tickerFromSymbol(symbol);
  const followers = board.topic?.folowr_count != null ? Number(board.topic.folowr_count) : null;
  const postCount = board.topic?.msg_count != null ? Number(board.topic.msg_count) : samples.length;
  const summary = stripHtml(rawSummary).slice(0, 420);

  return {
    source: "Moneycontrol forum",
    company,
    sc_id: scId,
    forum_url: hit.forum_topics_url || `https://mmb.moneycontrol.com/forum-topics/stocks/${topicId}.html`,
    crowd,
    language_score: lang,
    language_bias: biasFromScore(lang),
    overall,
    overall_label: labelFor(overall, crowd),
    summary: summary || "No AI digest available — scored from recent board posts.",
    post_count: Number.isFinite(postCount) ? postCount : samples.length,
    follower_count: Number.isFinite(followers as number) ? followers : null,
    sample_posts: samples,
    note: "Retail message-board chatter, not advice. Crowd votes can be thin or one-sided; read posts before acting.",
  };
}
