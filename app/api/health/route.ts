import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db/supabase";
import { isPythonFetcherAvailable } from "@/lib/data/yahoo-python";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    database: isDbConfigured() ? "connected" : "not_configured",
    primary: "yfinance (yahoo-finance2)",
    storage: isDbConfigured()
      ? "supabase_incremental"
      : isPythonFetcherAvailable()
        ? "yfinance_nse_python"
        : "yfinance_nse",
    agents: [
      "yfinance (yahoo-finance2)",
      "nse_india (stock-nse-india)",
      "yahoo_http",
      "yahoo_python (yfinance/yahooquery)",
      "indian_market_api (0xramm)",
    ],
  });
}
