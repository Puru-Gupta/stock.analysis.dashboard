import { NextRequest, NextResponse } from "next/server";
import { scanOptionsUniverse } from "@/lib/engines/options";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const results = await scanOptionsUniverse(
    p.get("strategy_mode") || "selling",
    p.get("option_type") || "call",
    Number(p.get("limit") || 15),
  );
  return NextResponse.json(results);
}
