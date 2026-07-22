import { NextRequest, NextResponse } from "next/server";
import { scanOptionStatsUniverse } from "@/lib/engines/options";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const results = await scanOptionStatsUniverse(
    p.get("option_type") || "call",
    Number(p.get("limit") || 20),
  );
  return NextResponse.json(results);
}
