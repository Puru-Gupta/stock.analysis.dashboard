import { NextResponse } from "next/server";
import { fetchMarketNews } from "@/lib/engines/market-news";

export const maxDuration = 60;

export async function GET() {
  try {
    const result = await fetchMarketNews();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        items: [],
        counts: { very_important: 0, important: 0, less_important: 0 },
        analyzed_at: new Date().toISOString(),
        feeds_queried: 0,
        error: e instanceof Error ? e.message : "Market news fetch failed",
      },
      { status: 200 },
    );
  }
}
