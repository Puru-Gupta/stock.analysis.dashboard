import { NextRequest, NextResponse } from "next/server";
import { analyzeSellerBoard } from "@/lib/engines/seller";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ detail: "symbol required" }, { status: 400 });
  const result = await analyzeSellerBoard(symbol);
  return NextResponse.json(result);
}
