import { NextRequest, NextResponse } from "next/server";
import { scanSellerUniverse } from "@/lib/engines/seller";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") || 12);
  const results = await scanSellerUniverse(limit);
  return NextResponse.json(results);
}
