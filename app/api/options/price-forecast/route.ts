import { NextRequest, NextResponse } from "next/server";
import { forecastSymbol, scanNifty50ForecastAlignment } from "@/lib/engines/ml-price-forecast";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const scan = p.get("scan") === "1" || p.get("scan") === "true";

  try {
    if (scan) {
      const limit = Number(p.get("limit") || 50);
      const picks = await scanNifty50ForecastAlignment(limit);
      return NextResponse.json({ scan: true, picks });
    }

    const symbol = p.get("symbol") || "RELIANCE.NS";
    const forecast = await forecastSymbol(symbol);
    if (!forecast) {
      return NextResponse.json({ error: "Insufficient history for forecast" }, { status: 404 });
    }
    return NextResponse.json(forecast);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forecast failed" },
      { status: 500 },
    );
  }
}
