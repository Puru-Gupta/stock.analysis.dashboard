-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)

CREATE TABLE IF NOT EXISTS price_bars (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  bar_date DATE NOT NULL,
  open NUMERIC(12, 4) NOT NULL,
  high NUMERIC(12, 4) NOT NULL,
  low NUMERIC(12, 4) NOT NULL,
  close NUMERIC(12, 4) NOT NULL,
  volume BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, bar_date)
);

CREATE TABLE IF NOT EXISTS fundamentals_cache (
  symbol TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_log (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  last_bar_date DATE,
  bars_added INTEGER DEFAULT 0,
  sync_type TEXT DEFAULT 'incremental',
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_bars_symbol_date ON price_bars(symbol, bar_date DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_symbol ON sync_log(symbol, synced_at DESC);

-- Virtual portfolio (anonymous client_id from browser localStorage)
CREATE TABLE IF NOT EXISTS virtual_portfolios (
  client_id TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  invested NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  pnl NUMERIC(14, 2) NOT NULL DEFAULT 0,
  pnl_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
  holdings_count INTEGER NOT NULL DEFAULT 0,
  holdings_json JSONB NOT NULL DEFAULT '[]',
  benchmarks_json JSONB NOT NULL DEFAULT '[]',
  lookback_months INTEGER DEFAULT 12,
  goal TEXT DEFAULT 'balanced',
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_client ON portfolio_snapshots(client_id, snapshot_at DESC);

ALTER TABLE virtual_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access virtual_portfolios" ON virtual_portfolios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access portfolio_snapshots" ON portfolio_snapshots FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE price_bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundamentals_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access price_bars" ON price_bars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access fundamentals" ON fundamentals_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_log" ON sync_log FOR ALL USING (true) WITH CHECK (true);
