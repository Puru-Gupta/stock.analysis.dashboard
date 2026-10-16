import { NextRequest, NextResponse } from "next/server";
import { analyzeForumSentiment } from "@/lib/engines/forum-sentiment";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "";
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  try {
    const data = await analyzeForumSentiment(symbol);
    if (!data) {
      return NextResponse.json({ error: "No Moneycontrol forum topic found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forum sentiment failed" },
      { status: 500 },
    );
  }
}
