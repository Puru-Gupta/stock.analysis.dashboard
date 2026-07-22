const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function fetchAPI<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || "API request failed");
  }
  return res.json();
}

export interface EquityAnalysis {
  symbol: string;
  name: string;
  signal: string;
  recommendation: string;
  final_score: number;
  technical_score: number;
  fundamental_score: number;
  technical_view: string;
  fundamental_view: string;
  entry_zone: [number, number];
  stop_loss: number;
  target1: number;
  target2: number;
  risk_reward: number;
  reason: string;
  horizon: string;
  confidence: string;
  risk_level: string;
  invalidation: string;
  technical_signals: string[];
  fundamental_signals: string[];
  risks: string[];
  current_price: number;
  support: number;
  resistance: number;
  trend: string;
  sector?: string;
  fundamentals?: Record<string, unknown>;
  score_breakdown?: Record<string, number>;
  signal_diagnostics?: {
    mvrb?: Record<string, unknown> | null;
    accumulation?: Record<string, unknown>;
    vol_accum_breakout?: Record<string, unknown>;
    obv?: Record<string, unknown>;
    active_setups?: string[];
  };
  chart_data?: ChartBar[];
  error?: string;
  data_quality?: DataQuality;
  advantages?: TradeAdvantage[];
  mode_details?: ModeDetails;
  agent_quotes?: { source: string; last: number; latency_ms: number; change_pct?: number }[];
  agents_ms?: number;
  index_regime?: {
    state: string;
    allows_long: boolean;
    label: string;
    detail: string;
    ret_20d: number;
    ema50: number;
    ema200: number;
  };
  trade_mode?: {
    mode: string;
    label: string;
    reason: string;
    conflicting: boolean;
  };
  exit_plan?: {
    rules: string[];
    time_stop_days: number;
    trail_stop_hint: string;
    reduce_if: string[];
    invalidation: string;
  };
  expectancy?: {
    samples: number;
    hit_rate_20d: number;
    hit_rate_60d: number;
    avg_ret_20d: number;
    avg_ret_60d: number;
    expectancy_20d: number;
    mode: string;
    note: string;
  };
  valuation_relative?: {
    sector_key: string;
    pe_relative: number | null;
    pb_relative: number | null;
    peg: number | null;
    pe_median: number;
    pb_median: number;
  };
}

export interface DataQuality {
  accuracy_score: number;
  sources_used: string[];
  sources_failed: { source: string; error: string }[];
  price_consensus: {
    value: number;
    spread_pct: number;
    samples: { source: string; last: number }[];
    method: string;
  };
  bar_count: number;
  fundamentals_complete: boolean;
  live_chain: boolean;
  notes: string[];
}

export interface TradeAdvantage {
  title: string;
  detail: string;
  weight: "high" | "medium" | "edge";
}

export interface ModeDetails {
  mode: string;
  label: string;
  objective: string;
  when_to_use: string[];
  advantages: string[];
  risks: string[];
  invalidation: string;
  best_for: string;
}

export interface ChartBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ScanResult {
  symbol: string;
  name: string;
  signal: string;
  recommendation: string;
  final_score: number;
  technical_score: number;
  fundamental_score: number;
  current_price: number;
  risk_reward: number;
  risk_level: string;
  reason: string;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  market_cap?: number | null;
  valuation_bracket?: string;
  trade_mode?: string;
  regime?: string;
  exp_20d?: number;
  hit_20d?: number;
  pe_rel?: number | null;
  obv_divergence?: boolean;
  volume_accumulation?: boolean;
  pre_breakout?: boolean;
  vol_accum_breakout?: boolean;
  price_chg_15d?: number;
}

export interface VolatilityMetrics {
  current_iv: number;
  current_hv: number;
  iv_hv_ratio: number;
  change_7d: number;
  change_15d: number;
  change_30d: number;
  hv_7d_ago: number;
  hv_15d_ago: number;
  hv_30d_ago: number;
}

export interface OptionsAnalysis {
  symbol: string;
  spot: number;
  expiry: string;
  days_to_expiry: number;
  historical_volatility: number;
  expected_move: number;
  expected_range: [number, number];
  trend: string;
  recommendations: OptionRec[];
  strategy?: StrategyRec;
  chain_available: boolean;
  note?: string;
  error?: string;
  data_quality?: DataQuality;
  advantages?: TradeAdvantage[];
  mode_details?: ModeDetails;
  agent_quotes?: { source: string; last: number; latency_ms: number }[];
  agents_ms?: number;
  option_type?: string;
  strategy_mode?: string;
  volatility?: VolatilityMetrics;
  price_movement?: {
    days_7: number;
    days_15: number;
    days_30: number;
    change_7d: number;
    change_15d: number;
    change_30d: number;
    direction: string;
  };
  movement_insight?: {
    suitability: "favorable" | "caution" | "avoid";
    summary: string;
    points: string[];
  };
  stats?: import("@/lib/engines/option-stats").OptionStatsBundle;
}

export interface SellerContract {
  type: "CE" | "PE";
  strike: number;
  expiry: string;
  premium: number;
  fair_premium: number;
  premium_edge: number;
  premium_edge_ok: boolean;
  pop: number;
  seller_score: number;
  rating: "strong_sell" | "good_sell" | "watch" | "avoid";
  rating_label: string;
  premium_quality: "overpriced" | "fair" | "cheap";
  dist_em: number;
  outside_em: boolean;
  risk: { level: "low" | "medium" | "high"; reasons: string[] };
  decision: "sell" | "avoid";
  recommendation: string;
  advanced: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
    oi: number;
    oi_change: number;
    volume: number;
    bid_ask_spread_pct: number | null;
  };
  live: boolean;
}

export interface SellerBoard {
  symbol: string;
  spot: number;
  expiry: string;
  days_to_expiry: number;
  trend_word: "Sideways" | "Bullish" | "Bearish" | "Highly Volatile";
  hv: number;
  atm_iv: number;
  iv_rank: number;
  iv_percentile: number;
  iv_hv_ratio: number;
  expected_move: number;
  expected_range: [number, number];
  event_risk: "low" | "elevated";
  event_note: string;
  pcr: number | null;
  max_pain: number | null;
  chain_available: boolean;
  note?: string;
  error?: string;
  contracts: SellerContract[];
  smile: { strike: number; ce_iv: number | null; pe_iv: number | null }[];
  data_quality?: DataQuality;
  analyzed_at: string;
}

export interface SellerPick {
  symbol: string;
  name: string;
  spot: number;
  score: number;
  trend_word: "Sideways" | "Bullish" | "Bearish" | "Highly Volatile";
  days_15: number;
  hv: number;
  event_risk: "low" | "elevated";
  reason: string;
}

export interface OptionsStockPick {
  symbol: string;
  name: string;
  spot: number;
  score: number;
  trend: string;
  days_7: number;
  days_15: number;
  days_30: number;
  hv: number;
  suitability: string;
  reason: string;
  recommended_strategy: string;
}

export interface OptionStatsPick {
  symbol: string;
  name: string;
  spot: number;
  option_score: number;
  seller_vol_score: number;
  iv_rank: number;
  iv_hv_ratio: number;
  regime: string;
  confidence: number;
  z_score_1m: number;
  trend_label: string;
  reason: string;
}

export interface OptionRec {
  strike: number;
  premium: number;
  moneyness: string;
  action: string;
  score?: number;
  prob_itm: number;
  prob_otm: number;
  iv?: number;
  theta?: number;
  delta?: number;
  vega?: number;
  theta_decay_7d?: number;
  reason?: string;
  entry_premium?: [number, number];
  stop_loss?: number;
  target?: number;
  invalidation?: string;
  breakeven?: number;
  premium_received?: number;
  max_risk?: string;
}

export interface StrategyRec {
  name: string;
  reason: string;
  legs: string[];
  max_loss: string;
  max_profit?: string;
  risk: string;
}

export interface FuturesAnalysis {
  symbol: string;
  timeframe: string;
  strategy: string;
  strategy_mode: string;
  signal: string;
  score: number;
  trend_condition: string;
  volatility_condition: string;
  rsi?: number;
  entry_zone: [number, number];
  stop_loss: number;
  target: number;
  target2: number;
  risk_reward: number;
  reason: string;
  invalidation: string;
  risk_level: string;
  confidence: string;
  current_price: number;
  support: number;
  resistance: number;
  chart_data?: ChartBar[];
  error?: string;
  analyzed_at?: string;
}

export interface RiskDashboard {
  market_summary: {
    stocks_analyzed: number;
    buy_signals: number;
    watch_signals: number;
    avoid_signals: number;
    high_risk_count: number;
    average_score: number;
  };
  top_opportunities: ScanResult[];
  index_regime?: {
    state: string;
    label: string;
    detail: string;
    allows_long: boolean;
    ret_20d: number;
  };
  disclaimer?: string;
}

export interface MarketOverview {
  nifty: { symbol: string; last: number; change_pct?: number };
  regime: {
    state: string;
    label: string;
    detail: string;
    allows_long: boolean;
    ret_20d: number;
    ema50: number;
    ema200: number;
  };
  sector_pulse: {
    sector: string;
    symbol: string;
    signal: string;
    score: number;
    trend: string;
  }[];
  sector_avg_score: number;
  updated_at: string;
}
