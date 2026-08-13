import { getSupabase, isDbConfigured } from "@/lib/db/supabase";

export interface PortfolioSnapshotInput {
  client_id: string;
  invested: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
  holdings_count: number;
  holdings_json: unknown;
  benchmarks_json: unknown;
  lookback_months?: number;
  goal?: string;
}

export interface PortfolioSnapshotRow extends PortfolioSnapshotInput {
  id: number;
  snapshot_at: string;
}

export interface VirtualPortfolioStateRow {
  client_id: string;
  state: unknown;
  updated_at: string;
}

export async function syncVirtualPortfolioState(clientId: string, state: unknown): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { error } = await db.from("virtual_portfolios").upsert(
    { client_id: clientId, state, updated_at: new Date().toISOString() },
    { onConflict: "client_id" },
  );
  return !error;
}

export async function loadVirtualPortfolioState(clientId: string): Promise<unknown | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("virtual_portfolios").select("state").eq("client_id", clientId).maybeSingle();
  return data?.state ?? null;
}

export async function savePortfolioSnapshot(input: PortfolioSnapshotInput): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { error } = await db.from("portfolio_snapshots").insert({
    client_id: input.client_id,
    invested: input.invested,
    current_value: input.current_value,
    pnl: input.pnl,
    pnl_pct: input.pnl_pct,
    holdings_count: input.holdings_count,
    holdings_json: input.holdings_json,
    benchmarks_json: input.benchmarks_json,
    lookback_months: input.lookback_months ?? 12,
    goal: input.goal ?? "balanced",
  });
  return !error;
}

export async function getPortfolioHistory(clientId: string, limit = 30): Promise<PortfolioSnapshotRow[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("portfolio_snapshots")
    .select("*")
    .eq("client_id", clientId)
    .order("snapshot_at", { ascending: false })
    .limit(limit);
  return (data || []) as PortfolioSnapshotRow[];
}

export { isDbConfigured as isPortfolioDbConfigured };
