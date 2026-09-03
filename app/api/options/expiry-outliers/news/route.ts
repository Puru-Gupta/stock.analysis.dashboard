import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleNewsRss } from "@/lib/data/rss";

export const maxDuration = 30;

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

  const query = `${keywords}${range}`.trim();

  try {
    const items = await fetchGoogleNewsRss(query, "IN");
    return NextResponse.json({ items, query });
  } catch (e) {
    return NextResponse.json(
      { items: [], error: e instanceof Error ? e.message : "News fetch failed" },
      { status: 200 },
    );
  }
}
