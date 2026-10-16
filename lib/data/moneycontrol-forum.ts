/**
 * Moneycontrol Message Board (MMB) — public forum APIs used by mmb.moneycontrol.com.
 * Auth token is the same JWT the public website embeds in its JS (not a user secret).
 */

const MMB_BASE = "https://api.moneycontrol.com/mcapi/v2/mmb";
const SEARCH_URL = "https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MMB_JWT =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiWWxjeGFRPT0ifQ.3OQmVFc8Tho3BPlmE2t-uYvPvVSkuJ1_lF_QaAINeb4";

export interface McSuggestion {
  name: string;
  stock_name: string;
  sc_id: string;
  forum_topics_url?: string;
  pdt_dis_nm?: string;
}

export interface McForumMessage {
  msg_id?: string;
  message?: string;
  heading?: string;
  user_nick_name?: string;
  uidNickname?: string;
  user_id?: string;
  ent_date?: string;
  date_str?: string;
}

export interface McTopicDetails {
  topicid?: string;
  topicID?: string;
  topic?: string;
  topicName?: string;
  sc_id?: string;
  SC_ID?: string;
  sc_fullname?: string;
  SC_FULLNAME?: string;
  msg_count?: string | number;
  folowr_count?: string | number;
}

async function getJson<T>(url: string, auth = false): Promise<T | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Accept: "application/json",
    };
    if (auth) headers.Authorization = MMB_JWT;
    const res = await fetch(url, { headers, next: { revalidate: 600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function tickerFromSymbol(symbol: string) {
  return symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "").trim().toUpperCase();
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function topicIdFromForumUrl(url?: string) {
  if (!url) return null;
  const m = url.match(/-(\d+)\.html/i);
  return m ? m[1] : null;
}

export async function searchMoneycontrolStock(symbol: string): Promise<McSuggestion | null> {
  const ticker = tickerFromSymbol(symbol);
  if (!ticker) return null;
  const url = `${SEARCH_URL}?query=${encodeURIComponent(ticker)}&type=1&format=json`;
  const data = await getJson<McSuggestion[]>(url, false);
  if (!Array.isArray(data) || !data.length) return null;

  const scored = data.map((item) => {
    const dis = decodeEntities(item.pdt_dis_nm || "").toUpperCase();
    const name = (item.stock_name || item.name || "").toUpperCase();
    let score = 0;
    // NSE ticker sits in the suggestion span, e.g. "INE…, BAJAJ-AUTO, 532977"
    if (dis.includes(`, ${ticker},`)) score += 20;
    else if (dis.includes(ticker)) score += 6;
    if (name === ticker) score += 6;
    if (item.forum_topics_url) score += 2;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 8) return null;
  return best.item;
}

export async function fetchForumMessages(topicId: string, limit = 30) {
  const url = `${MMB_BASE}/get-messages/?section=topic&sectionId=${encodeURIComponent(topicId)}&limitStart=0&limitCount=${limit}`;
  const json = await getJson<{
    success: number;
    data?: { topicDetails?: McTopicDetails; list?: McForumMessage[] };
  }>(url, true);
  if (!json?.success || !json.data) return { topic: null as McTopicDetails | null, messages: [] as McForumMessage[] };
  return {
    topic: json.data.topicDetails ?? null,
    messages: Array.isArray(json.data.list) ? json.data.list : [],
  };
}

export async function fetchForumCrowd(scId: string) {
  const json = await getJson<{
    success: number;
    data?: { sentimeter?: { buy_perc?: number; sell_per?: number; hold_per?: number } };
  }>(`${MMB_BASE}/get-market-sentiments?scId=${encodeURIComponent(scId)}`, true);
  const s = json?.data?.sentimeter;
  return {
    buy_pct: Number(s?.buy_perc ?? 0),
    sell_pct: Number(s?.sell_per ?? 0),
    hold_pct: Number(s?.hold_per ?? 0),
  };
}

export async function fetchForumAiSummary(topicId: string, scId: string) {
  const json = await getJson<{
    success: number;
    data?: { status?: string; result?: string };
  }>(
    `${MMB_BASE}/get-ai-summary?topicId=${encodeURIComponent(topicId)}&scId=${encodeURIComponent(scId)}`,
    true,
  );
  return json?.data?.result || "";
}

export function stripHtml(s: string) {
  return decodeEntities(s)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|div|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
