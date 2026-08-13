import { NextRequest, NextResponse } from "next/server";
import {
  getPortfolioHistory,
  isPortfolioDbConfigured,
  loadVirtualPortfolioState,
  syncVirtualPortfolioState,
} from "@/lib/db/portfolio";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id");
  if (!clientId) {
    return NextResponse.json({ error: "client_id required" }, { status: 400 });
  }
  if (!isPortfolioDbConfigured()) {
    return NextResponse.json({ configured: false, history: [], state: null });
  }
  const [history, state] = await Promise.all([
    getPortfolioHistory(clientId, 30),
    loadVirtualPortfolioState(clientId),
  ]);
  return NextResponse.json({ configured: true, history, state });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const clientId = body.client_id as string | undefined;
  if (!clientId) {
    return NextResponse.json({ error: "client_id required" }, { status: 400 });
  }
  if (!isPortfolioDbConfigured()) {
    return NextResponse.json({ configured: false, saved: false });
  }
  const saved = await syncVirtualPortfolioState(clientId, body.state);
  return NextResponse.json({ configured: true, saved });
}
