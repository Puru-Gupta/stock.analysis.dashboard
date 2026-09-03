export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
}

export function parseRss(xml: string, limit = 30): RssItem[] {
  const items: RssItem[] = [];
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
  return items.filter((i) => i.title).slice(0, limit);
}

export async function fetchGoogleNewsRss(query: string, region: "IN" | "US" = "IN"): Promise<RssItem[]> {
  const gl = region;
  const ceid = region === "IN" ? "IN:en" : "US:en";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-${region}&gl=${gl}&ceid=${ceid}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "moneydashboard/1.0" },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`News feed ${res.status}`);
  const xml = await res.text();
  return parseRss(xml, 20);
}
