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

-- Allow service role full access (API uses service role key server-side)
ALTER TABLE price_bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundamentals_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access price_bars" ON price_bars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access fundamentals" ON fundamentals_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access sync_log" ON sync_log FOR ALL USING (true) WITH CHECK (true);
