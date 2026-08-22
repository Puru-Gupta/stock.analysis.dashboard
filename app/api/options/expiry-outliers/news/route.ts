import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

function parseRss(xml: string) {
  const items: { title: string; link: string; pubDate: string; source?: string }[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>([^<]*)<\/title>/i);
    const link = block.match(/<link>([^<]*)<\/link>/i);
    const pub = block.match(/<pubDate>([^<]*)<\/pubDate>/i);
    const source = block.match(/<source[^>]*>([^<]*)<\/source>/i);
    items.push({
      title: (title?.[1] || title?.[2] || "").trim(),
      link: (link?.[1] || "").trim(),
      pubDate: (pub?.[1] || "").trim(),
      source: source?.[1]?.trim(),
    });
  }
  return items.filter((i) => i.title).slice(0, 25);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const keywords = p.get("q") || "India stock market";
  const from = p.get("from");
  const to = p.get("to");
  const range =
    from && to
      ? ` after:${from} before:${to}`
      : from
        ? ` after:${from}`
        : "";

  const query = encodeURIComponent(`${keywords}${range}`.trim());
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "moneydashboard/1.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`News feed ${res.status}`);
    const xml = await res.text();
    return NextResponse.json({ items: parseRss(xml), query: `${keywords}${range}`.trim() });
  } catch (e) {
    return NextResponse.json(
      { items: [], error: e instanceof Error ? e.message : "News fetch failed" },
      { status: 200 },
    );
  }
}
