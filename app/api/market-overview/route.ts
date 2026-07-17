import { NextResponse } from "next/server";
import { getMarketOverview } from "@/lib/engines/market-overview";

export const maxDuration = 120;

export async function GET() {
  try {
    const data = await getMarketOverview();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Market overview failed" },
      { status: 500 },
    );
  }
}
