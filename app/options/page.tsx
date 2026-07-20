"use client";

import { useState, useCallback, useEffect } from "react";
import { fetchAPI, OptionsAnalysis, OptionsStockPick } from "@/lib/api";
import { LabelWithInfo } from "@/components/InfoTip";
import {
  SignalBadge,
  Disclaimer,
  LoadingSpinner,
  ErrorMessage,
  LevelCard,
} from "@/components/Sidebar";
import { Search, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import DataIntelPanel from "@/components/DataIntelPanel";
import SellerAssistant from "@/components/SellerAssistant";
import { useAppCache } from "@/components/AppCacheProvider";

const CACHE_KEY = "options";
const SUBTAB_CACHE_KEY = "options_subtab";

type OptionsCache = {
  symbol: string;
  optionType: string;
  strategyMode: string;
  capital: number;
  riskLevel: string;
  analysis: OptionsAnalysis | null;
  stockPicks: OptionsStockPick[];
  picksLoaded: boolean;
  analysisLoaded: boolean;
};

const MOVEMENT_DEFS = {
  week: "Price change over the last ~7 trading days (1 week). Helps gauge very recent momentum.",
  days15: "Price change over 15 trading days. Key window for option expiry cycles and swing moves.",
  month: "Price change over ~22 trading days (1 month). Shows medium-term trend for strike selection.",
};

const VOL_DEFS = {
  currentIv: "At-the-money implied volatility from live NSE chain (or HV estimate if chain unavailable).",
  ivHv: "IV divided by 20-day historical vol. Above 1.0 means options are pricing more uncertainty than recent realized moves.",
  volChg7: "Change in 20-day historical volatility vs ~7 trading days ago (percentage points). Proxy for vol expansion/contraction.",
  volChg15: "HV change over 15 trading days — key window aligned with monthly expiry cycles.",
  volChg30: "HV change over ~30 trading days — medium-term vol trend for strike width.",
  theta: "Daily time decay (Black-Scholes). Negative for long options; sellers collect the opposite.",
  theta7d: "Estimated premium erosion over 7 calendar days from theta alone (ignores delta/gamma).",
};

function VolChangeCard({
  label,
  change,
  pastHv,
  defKey,
}: {
  label: string;
  change: number;
  pastHv: number;
  defKey: keyof typeof VOL_DEFS;
}) {
  const isUp = change > 0;
  const isDown = change < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? "var(--red)" : isDown ? "var(--green)" : "var(--fg-tertiary)";
  const bg = isUp ? "var(--red-muted)" : isDown ? "var(--green-muted)" : "var(--bg-secondary)";

  return (
    <div className="rounded-md p-4" style={{ background: bg, border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="field-label !mb-0">
          <LabelWithInfo label={label} definition={VOL_DEFS[defKey]} />
        </div>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <p className="mt-2 text-2xl font-normal font-mono tabular-nums" style={{ color }}>
        {change > 0 ? "+" : ""}{change} pp
      </p>
      <p className="mt-1 font-mono text-xs tabular-nums" style={{ color: "var(--fg-muted)" }}>
        was {pastHv}% HV
      </p>
    </div>
  );
}
function MoveCard({
  label,
  pct,
  absChange,
  defKey,
}: {
  label: string;
  pct: number;
  absChange: number;
  defKey: keyof typeof MOVEMENT_DEFS;
}) {
  const isUp = pct > 0;
  const isDown = pct < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? "var(--green)" : isDown ? "var(--red)" : "var(--fg-tertiary)";
  const bg = isUp
    ? "var(--green-muted)"
    : isDown
      ? "var(--red-muted)"
      : "var(--bg-secondary)";

  return (
    <div className="rounded-md p-4" style={{ background: bg, border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="field-label !mb-0">
          <LabelWithInfo label={label} definition={MOVEMENT_DEFS[defKey]} />
        </div>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <p className="mt-2 text-2xl font-normal font-mono tabular-nums" style={{ color }}>
        {pct > 0 ? "+" : ""}{pct}%
      </p>
      <p className="mt-1 font-mono text-xs tabular-nums" style={{ color: "var(--fg-muted)" }}>
        {absChange > 0 ? "+" : ""}₹{absChange} absolute
      </p>
    </div>
  );
}

function SuitabilityBadge({ s }: { s: string }) {
  if (s === "favorable") return <span className="badge-buy">Favorable</span>;
  if (s === "avoid") return <span className="badge-sell">Avoid</span>;
  return <span className="badge-watch">Caution</span>;
}

export default function OptionsPage() {
  const cache = useAppCache();
  const cached = cache.get<OptionsCache>(CACHE_KEY);
  const [subTab, setSubTab] = useState(cache.get<string>(SUBTAB_CACHE_KEY) ?? "analysis");
  const [symbol, setSymbol] = useState(cached?.symbol ?? "RELIANCE.NS");
  const [optionType, setOptionType] = useState(cached?.optionType ?? "call");
  const [strategyMode, setStrategyMode] = useState(cached?.strategyMode ?? "selling");
  const [capital, setCapital] = useState(cached?.capital ?? 100000);
  const [riskLevel, setRiskLevel] = useState(cached?.riskLevel ?? "medium");
  const [analysis, setAnalysis] = useState<OptionsAnalysis | null>(cached?.analysis ?? null);
  const [stockPicks, setStockPicks] = useState<OptionsStockPick[]>(cached?.stockPicks ?? []);
  const [loading, setLoading] = useState(false);
  const [picksLoading, setPicksLoading] = useState(false);
  const [error, setError] = useState("");
  const [picksLoaded, setPicksLoaded] = useState(cached?.picksLoaded ?? false);

  const persist = useCallback(
    (patch: Partial<OptionsCache>) => {
      cache.set(CACHE_KEY, {
        symbol,
        optionType,
        strategyMode,
        capital,
        riskLevel,
        analysis,
        stockPicks,
        picksLoaded,
        analysisLoaded: !!analysis,
        ...patch,
      });
    },
    [cache, symbol, optionType, strategyMode, capital, riskLevel, analysis, stockPicks, picksLoaded],
  );

  useEffect(() => {
    const saved = cache.get<OptionsCache>(CACHE_KEY);
    if (!saved) return;
    setSymbol(saved.symbol);
    setOptionType(saved.optionType);
    setStrategyMode(saved.strategyMode);
    setCapital(saved.capital);
    setRiskLevel(saved.riskLevel);
    setAnalysis(saved.analysis);
    setStockPicks(saved.stockPicks);
    setPicksLoaded(saved.picksLoaded);
  }, [cache]);

  const loadPicks = useCallback(async () => {
    setPicksLoading(true);
    try {
      const data = await fetchAPI<OptionsStockPick[]>(
        `/api/options/scan?strategy_mode=${strategyMode}&option_type=${optionType}&limit=12`
      );
      setStockPicks(data);
      setPicksLoaded(true);
      persist({ stockPicks: data, picksLoaded: true, strategyMode, optionType });
    } catch {
      setStockPicks([]);
    } finally {
      setPicksLoading(false);
    }
  }, [strategyMode, optionType, persist]);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAPI<OptionsAnalysis>(
        `/api/options/analyze?symbol=${encodeURIComponent(symbol)}&option_type=${optionType}&strategy_mode=${strategyMode}&capital=${capital}&risk_level=${riskLevel}`
      );
      setAnalysis(data);
      persist({ analysis: data, symbol, optionType, strategyMode, capital, riskLevel, analysisLoaded: true });
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, optionType, strategyMode, capital, riskLevel, persist]);

  const strategyLabel =
    strategyMode === "selling" ? "Option Selling" :
    strategyMode === "neutral" ? "Neutral" :
    strategyMode === "buying" ? "Option Buying" : "Directional";

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Options Analysis</h1>
          <p className="page-subtitle">
            {subTab === "seller"
              ? "Should I sell this option right now? One score, one answer."
              : "Price movement context + probability-based strike selection"}
          </p>
        </div>
      </div>

      <div className="pill-group" role="tablist" aria-label="Options view">
        {(
          [
            { value: "analysis", label: "Analysis" },
            { value: "seller", label: "Selling Assistant" },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={subTab === value}
            onClick={() => {
              setSubTab(value);
              cache.set(SUBTAB_CACHE_KEY, value);
            }}
            className={`pill ${subTab === value ? "pill-active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      <Disclaimer />

      {subTab === "seller" && <SellerAssistant />}

      {subTab === "analysis" && (
      <>
      <div className="product-panel">
        <div className="product-section">
          <p className="product-label">Underlying</p>
          <div className="product-query-row">
            <input
              className="product-query-input"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              placeholder="RELIANCE.NS"
              spellCheck={false}
              autoCapitalize="characters"
            />
            <div className="product-query-actions">
              <button
                type="button"
                onClick={analyze}
                disabled={loading}
                className="product-action-primary"
              >
                <Search className="h-3.5 w-3.5" />
                Analyze
              </button>
            </div>
          </div>
        </div>

        <div className="product-divider" />

        <div className="product-section product-section-row">
          <div className="product-section-half">
            <p className="product-label">Call / Put</p>
            <div className="pill-group" role="group">
              {(["call", "put"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOptionType(t)}
                  className={`pill ${optionType === t ? "pill-active" : ""}`}
                  aria-pressed={optionType === t}
                >
                  {t === "call" ? "Call" : "Put"}
                </button>
              ))}
            </div>
          </div>
          <div className="product-section-half">
            <p className="product-label">Strategy Mode</p>
            <div className="pill-group" role="group">
              {(
                [
                  { value: "directional", label: "Directional" },
                  { value: "buying", label: "Buying" },
                  { value: "selling", label: "Selling" },
                  { value: "neutral", label: "Neutral" },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStrategyMode(value)}
                  className={`pill ${strategyMode === value ? "pill-active" : ""}`}
                  aria-pressed={strategyMode === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="product-divider" />

        <div className="product-section product-section-row product-section-row-end">
          <div className="product-section-half">
            <p className="product-label">Capital (₹)</p>
            <input
              className="input-field"
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
            />
          </div>
          <div className="product-section-half">
            <p className="product-label">Risk Level</p>
            <div className="pill-group" role="group">
              {(["low", "medium", "high"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskLevel(r)}
                  className={`pill ${riskLevel === r ? "pill-active" : ""}`}
                  aria-pressed={riskLevel === r}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stock Recommendations by Strategy */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Best Stocks for {strategyLabel} — {optionType === "call" ? "Calls" : "Puts"}
            </h3>
            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
              Ranked by price movement, trend, and volatility fit for your selected strategy
            </p>
          </div>
          <button onClick={loadPicks} className="btn-secondary flex items-center gap-2 text-xs shrink-0">
            <RefreshCw className={`h-3 w-3 ${picksLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {picksLoading ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>Scanning NIFTY 50 liquid names...</p>
        ) : !picksLoaded ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            Click <strong>Refresh</strong> to scan stocks for this strategy.
          </p>
        ) : stockPicks.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>No matching stocks found for this strategy.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Score</th>
                  <th>7d</th>
                  <th>15d</th>
                  <th>30d</th>
                  <th>HV</th>
                  <th>Trend</th>
                  <th>Fit</th>
                  <th>Strategy</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {stockPicks.map((p) => (
                  <tr key={p.symbol} onClick={() => { setSymbol(p.symbol); }}>
                    <td className="font-medium">{p.name}</td>
                    <td className="font-mono tabular-nums" style={{ color: "var(--accent)" }}>{p.score}</td>
                    <td className="font-mono text-xs tabular-nums" style={{ color: p.days_7 > 0 ? "var(--green)" : p.days_7 < 0 ? "var(--red)" : "var(--fg-tertiary)" }}>
                      {p.days_7 > 0 ? "+" : ""}{p.days_7}%
                    </td>
                    <td className="font-mono text-xs tabular-nums" style={{ color: p.days_15 > 0 ? "var(--green)" : p.days_15 < 0 ? "var(--red)" : "var(--fg-tertiary)" }}>
                      {p.days_15 > 0 ? "+" : ""}{p.days_15}%
                    </td>
                    <td className="font-mono text-xs tabular-nums" style={{ color: p.days_30 > 0 ? "var(--green)" : p.days_30 < 0 ? "var(--red)" : "var(--fg-tertiary)" }}>
                      {p.days_30 > 0 ? "+" : ""}{p.days_30}%
                    </td>
                    <td className="font-mono text-xs tabular-nums">{p.hv}%</td>
                    <td className="text-xs capitalize">{p.trend}</td>
                    <td><SuitabilityBadge s={p.suitability} /></td>
                    <td className="text-xs" style={{ color: "var(--accent)" }}>{p.recommended_strategy}</td>
                    <td className="max-w-[200px] truncate text-xs" style={{ color: "var(--fg-secondary)" }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>Click a row to analyze that stock</p>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {analysis && !loading && (
        <div className="page-stack">
          <DataIntelPanel
            quality={analysis.data_quality}
            advantages={analysis.advantages}
            modeDetails={analysis.mode_details}
            agentQuotes={analysis.agent_quotes}
            agentsMs={analysis.agents_ms}
          />
          {/* Price Movement Panel */}
          {analysis.price_movement && (
            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Underlying Price Movement
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <MoveCard
                  label="1 Week (7d)"
                  pct={analysis.price_movement.days_7}
                  absChange={analysis.price_movement.change_7d}
                  defKey="week"
                />
                <MoveCard
                  label="15 Days"
                  pct={analysis.price_movement.days_15}
                  absChange={analysis.price_movement.change_15d}
                  defKey="days15"
                />
                <MoveCard
                  label="1 Month (~30d)"
                  pct={analysis.price_movement.days_30}
                  absChange={analysis.price_movement.change_30d}
                  defKey="month"
                />
              </div>
            </div>
          )}

          {/* Volatility & Time Decay Panel */}
          {analysis.volatility && (
            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Volatility & Time Decay Context
              </h3>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <div className="field-label !mb-1">
                    <LabelWithInfo label="ATM IV (Current)" definition={VOL_DEFS.currentIv} />
                  </div>
                  <p className="font-mono text-xl tabular-nums" style={{ color: "var(--accent)" }}>
                    {analysis.volatility.current_iv}%
                  </p>
                </div>
                <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <div className="field-label !mb-1">
                    <LabelWithInfo label="IV / HV Ratio" definition={VOL_DEFS.ivHv} />
                  </div>
                  <p className="font-mono text-xl tabular-nums" style={{ color: analysis.volatility.iv_hv_ratio > 1.1 ? "var(--green)" : "var(--fg-primary)" }}>
                    {analysis.volatility.iv_hv_ratio}x
                  </p>
                </div>
                <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <p className="field-label !mb-1">Historical Vol (20d)</p>
                  <p className="font-mono text-xl tabular-nums">{analysis.volatility.current_hv}%</p>
                </div>
                <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <p className="field-label !mb-1">Days to Expiry</p>
                  <p className="font-mono text-xl tabular-nums">{analysis.days_to_expiry} DTE</p>
                </div>
              </div>
              <p className="mb-3 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                Volatility change (percentage points) over relevant trading windows — rising vol expands expected move; falling vol favors premium sellers.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <VolChangeCard
                  label="7-Day Vol Change"
                  change={analysis.volatility.change_7d}
                  pastHv={analysis.volatility.hv_7d_ago}
                  defKey="volChg7"
                />
                <VolChangeCard
                  label="15-Day Vol Change"
                  change={analysis.volatility.change_15d}
                  pastHv={analysis.volatility.hv_15d_ago}
                  defKey="volChg15"
                />
                <VolChangeCard
                  label="30-Day Vol Change"
                  change={analysis.volatility.change_30d}
                  pastHv={analysis.volatility.hv_30d_ago}
                  defKey="volChg30"
                />
              </div>
            </div>
          )}

          {/* Movement Insight for selected strategy */}
          {analysis.movement_insight && (
            <div className={`card border ${
              analysis.movement_insight.suitability === "favorable" ? "border-green-500/30" :
              analysis.movement_insight.suitability === "avoid" ? "border-red-500/30" : "border-amber-500/30"
            }`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                    Strategy Fit: {optionType === "call" ? "Call" : "Put"} {strategyLabel}
                  </h3>
                  <p className="mt-2 text-sm" style={{ color: "var(--fg-secondary)" }}>{analysis.movement_insight.summary}</p>
                </div>
                <SuitabilityBadge s={analysis.movement_insight.suitability} />
              </div>
              <ul className="mt-3 space-y-1">
                {analysis.movement_insight.points.map((pt, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--fg-secondary)" }}>• {pt}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2
                  className="text-xl font-normal tracking-[-0.02em]"
                  style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}
                >
                  {analysis.symbol}
                </h2>
                <p className="text-sm font-mono tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                  Spot: ₹{analysis.spot} · {analysis.days_to_expiry} DTE · Trend: {analysis.trend}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <LevelCard label="Expected Move" value={analysis.expected_move} />
              <LevelCard label="Expected Range" value={`₹${analysis.expected_range[0]} – ₹${analysis.expected_range[1]}`} />
              <LevelCard label="Historical Vol" value={`${analysis.historical_volatility}%`} />
              {analysis.volatility && (
                <LevelCard label="ATM IV" value={`${analysis.volatility.current_iv}%`} />
              )}
              {analysis.recommendations[0]?.theta != null && (
                <LevelCard
                  label="Top Strike Theta"
                  value={`₹${Math.abs(analysis.recommendations[0].theta!).toFixed(2)}/day`}
                />
              )}
              <LevelCard label="Data Source" value={analysis.chain_available ? "Live Chain" : "Estimated"} />
            </div>

            {analysis.note && (
              <p className="mt-3 text-xs" style={{ color: "var(--amber)" }}>{analysis.note}</p>
            )}
          </div>

          <div className="card">
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Expected Price Range by Expiry
            </h3>
            <div className="relative h-32 rounded-lg bg-[var(--bg-secondary)] overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <svg viewBox="0 0 400 120" className="w-full h-full">
                  <defs>
                    <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  <path d="M 0 100 Q 100 100 200 20 Q 300 100 400 100 Z" fill="url(#bellGrad)" stroke="#3b82f6" strokeWidth="1" />
                  <line x1="120" y1="10" x2="120" y2="100" stroke="#22c55e" strokeDasharray="4" strokeWidth="1" />
                  <line x1="280" y1="10" x2="280" y2="100" stroke="#22c55e" strokeDasharray="4" strokeWidth="1" />
                  <line x1="200" y1="10" x2="200" y2="100" stroke="#f59e0b" strokeWidth="1" />
                  <text x="115" y="115" fill="#94a3b8" fontSize="10">{analysis.expected_range[0]}</text>
                  <text x="190" y="115" fill="#f59e0b" fontSize="10">{analysis.spot}</text>
                  <text x="265" y="115" fill="#94a3b8" fontSize="10">{analysis.expected_range[1]}</text>
                </svg>
              </div>
            </div>
            <p className="mt-2 text-center text-xs" style={{ color: "var(--fg-secondary)" }}>
              1σ expected move: ±₹{analysis.expected_move} from spot ₹{analysis.spot}
            </p>
          </div>

          {analysis.strategy && (
            <div className="card" style={{ borderColor: "rgba(245,78,0,0.25)" }}>
              <h3 className="text-sm font-normal" style={{ color: "var(--accent)", fontFamily: "var(--font-sans)" }}>
                Recommended Strategy: {analysis.strategy.name}
              </h3>
              <p className="mt-2 text-sm" style={{ color: "var(--fg-secondary)" }}>{analysis.strategy.reason}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {analysis.strategy.legs.map((leg, i) => (
                  <div key={i} className="rounded-lg bg-[var(--bg-secondary)] p-2 text-xs">
                    Leg {i + 1}: {leg}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs" style={{ color: "var(--fg-secondary)" }}>
                <span>Max Loss: {analysis.strategy.max_loss}</span>
                {analysis.strategy.max_profit && <span>Max Profit: {analysis.strategy.max_profit}</span>}
                <span>Risk: {analysis.strategy.risk}</span>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Strike Recommendations
            </h3>
            {analysis.recommendations.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                No qualifying strikes for this strategy given current price movement. Try adjusting strategy mode or pick a stock from the recommendations table above.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Strike</th>
                      <th>Action</th>
                      <th>Premium</th>
                      <th>IV</th>
                      <th>Theta/day</th>
                      <th>7d Decay</th>
                      <th>Delta</th>
                      <th>Moneyness</th>
                      <th>P(ITM)</th>
                      <th>P(OTM)</th>
                      <th>Breakeven</th>
                      <th>Stop</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.recommendations.map((r) => {
                      const isSell = r.action.includes("Sell");
                      const thetaDisplay = r.theta != null
                        ? (isSell ? Math.abs(r.theta) : r.theta)
                        : null;
                      return (
                      <tr key={r.strike}>
                        <td className="font-medium">₹{r.strike}</td>
                        <td>
                          <SignalBadge signal={r.action.includes("Buy") ? "Buy" : r.action.includes("Sell") ? "Sell" : "Avoid"} />
                        </td>
                        <td className="font-mono tabular-nums">₹{r.premium}</td>
                        <td className="font-mono text-xs tabular-nums">{r.iv != null ? `${r.iv}%` : "—"}</td>
                        <td className="font-mono text-xs tabular-nums" style={{ color: isSell ? "var(--green)" : "var(--red)" }}>
                          {thetaDisplay != null ? `${isSell ? "+" : ""}₹${thetaDisplay.toFixed(2)}` : "—"}
                        </td>
                        <td className="font-mono text-xs tabular-nums" style={{ color: isSell ? "var(--green)" : "var(--red)" }}>
                          {r.theta_decay_7d != null
                            ? `${isSell ? "+" : ""}₹${Math.abs(r.theta_decay_7d).toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="font-mono text-xs tabular-nums">{r.delta != null ? r.delta.toFixed(2) : "—"}</td>
                        <td>{r.moneyness}</td>
                        <td className="font-mono tabular-nums">{r.prob_itm}%</td>
                        <td className="font-mono tabular-nums">{r.prob_otm}%</td>
                        <td className="font-mono tabular-nums">
                          {"breakeven" in r && r.breakeven ? `₹${r.breakeven}` : r.entry_premium ? `₹${r.entry_premium[0]}–${r.entry_premium[1]}` : "—"}
                        </td>
                        <td className="font-mono tabular-nums">{r.stop_loss ? `₹${r.stop_loss}` : "—"}</td>
                        <td className="max-w-xs truncate text-xs" style={{ color: "var(--fg-secondary)" }}>{r.reason || "—"}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
