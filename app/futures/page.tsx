"use client";

import { useState, useCallback, useEffect } from "react";
import { fetchAPI, FuturesAnalysis } from "@/lib/api";
import CandlestickChart from "@/components/CandlestickChart";
import {
  SignalBadge,
  ScoreBar,
  LevelCard,
  Disclaimer,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/Sidebar";
import { Search, ChevronDown } from "lucide-react";
import { useAppCache } from "@/components/AppCacheProvider";

const CACHE_KEY = "futures";

type FuturesCache = {
  symbol: string;
  timeframe: string;
  strategyMode: string;
  riskLevel: string;
  capital: number;
  analysis: FuturesAnalysis | null;
};

const FUTURES_SYMBOLS = [
  { value: "NIFTY", label: "NIFTY Index" },
  { value: "BANKNIFTY", label: "BANK NIFTY" },
  { value: "RELIANCE.NS", label: "RELIANCE" },
  { value: "TCS.NS", label: "TCS" },
  { value: "INFY.NS", label: "INFY" },
  { value: "HDFCBANK.NS", label: "HDFC BANK" },
];

export default function FuturesPage() {
  const cache = useAppCache();
  const cached = cache.get<FuturesCache>(CACHE_KEY);
  const [symbol, setSymbol] = useState(cached?.symbol ?? "NIFTY");
  const [timeframe, setTimeframe] = useState(cached?.timeframe ?? "daily");
  const [strategyMode, setStrategyMode] = useState(cached?.strategyMode ?? "trend_following");
  const [riskLevel, setRiskLevel] = useState(cached?.riskLevel ?? "medium");
  const [capital, setCapital] = useState(cached?.capital ?? 500000);
  const [analysis, setAnalysis] = useState<FuturesAnalysis | null>(cached?.analysis ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = cache.get<FuturesCache>(CACHE_KEY);
    if (!saved) return;
    setSymbol(saved.symbol);
    setTimeframe(saved.timeframe);
    setStrategyMode(saved.strategyMode);
    setRiskLevel(saved.riskLevel);
    setCapital(saved.capital);
    setAnalysis(saved.analysis);
  }, [cache]);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAPI<FuturesAnalysis>(
        `/api/futures/analyze?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&strategy_mode=${strategyMode}&risk_level=${riskLevel}&capital=${capital}`
      );
      setAnalysis(data);
      cache.set(CACHE_KEY, { symbol, timeframe, strategyMode, riskLevel, capital, analysis: data });
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, strategyMode, riskLevel, capital, cache]);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Futures Analysis</h1>
          <p className="page-subtitle">
            Practical futures setups — trend, breakout, pullback, volatility, mean reversion
          </p>
        </div>
      </div>

      <Disclaimer />

      <div className="product-panel">
        <div className="product-section">
          <p className="product-label">Symbol</p>
          <div className="product-query-row">
            <div className="product-select-wrap flex-1 min-w-0">
              <select
                className="product-select !text-[0.8125rem] !py-2.5"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              >
                {FUTURES_SYMBOLS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronDown className="product-select-icon" aria-hidden />
            </div>
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
            <p className="product-label">Timeframe</p>
            <div className="pill-group" role="group">
              {(["daily", "weekly", "monthly"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimeframe(t)}
                  className={`pill ${timeframe === t ? "pill-active" : ""}`}
                  aria-pressed={timeframe === t}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="product-section-half">
            <p className="product-label">Strategy</p>
            <div className="pill-group" role="group">
              {(
                [
                  { value: "trend_following", label: "Trend" },
                  { value: "breakout", label: "Breakout" },
                  { value: "pullback", label: "Pullback" },
                  { value: "volatility_expansion", label: "Volatility" },
                  { value: "mean_reversion", label: "Mean Rev" },
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

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {analysis && !loading && (
        <div className="page-stack">
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2
                  className="text-xl font-normal tracking-[-0.02em]"
                  style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}
                >
                  {analysis.symbol}
                </h2>
                <p className="font-mono text-sm tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                  Strategy: {analysis.strategy} · Price: ₹{analysis.current_price}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <SignalBadge signal={analysis.signal} />
                <span className="font-mono text-2xl tabular-nums" style={{ color: "var(--accent)" }}>{analysis.score}/100</span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>{analysis.reason}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <LevelCard label="Entry Zone" value={`₹${analysis.entry_zone[0]} – ₹${analysis.entry_zone[1]}`} />
              <LevelCard label="Stop Loss" value={analysis.stop_loss} color="var(--red)" />
              <LevelCard label="Target" value={analysis.target} color="var(--green)" />
              <LevelCard label="Target 2" value={analysis.target2} color="var(--green)" />
              <LevelCard label="Risk/Reward" value={`1:${analysis.risk_reward}`} />
              <LevelCard label="Confidence" value={analysis.confidence} />
            </div>

            <div className="mt-3 flex gap-4 font-mono text-xs" style={{ color: "var(--fg-tertiary)" }}>
              <span>Trend: {analysis.trend_condition}</span>
              <span>Volatility: {analysis.volatility_condition}</span>
              {analysis.rsi != null && <span>RSI: {analysis.rsi}</span>}
              <span>Risk: {analysis.risk_level}</span>
            </div>

            <p className="mt-2 text-xs" style={{ color: "var(--amber)" }}>
              Invalidation: {analysis.invalidation}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h3 className="card-section-title !normal-case !tracking-normal">Futures Chart</h3>
              <CandlestickChart
                data={analysis.chart_data || []}
                support={analysis.support}
                resistance={analysis.resistance}
                stopLoss={analysis.stop_loss}
                target={analysis.target}
                target2={analysis.target2}
              />
            </div>

            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal">Setup Score</h3>
              <ScoreBar score={analysis.score} label="Setup Quality" />
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: "var(--fg-tertiary)" }}>Signal</span>
                  <SignalBadge signal={analysis.signal} />
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--fg-tertiary)" }}>Strategy</span>
                  <span>{analysis.strategy}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--fg-tertiary)" }}>Support</span>
                  <span className="font-mono tabular-nums">₹{analysis.support}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--fg-tertiary)" }}>Resistance</span>
                  <span className="font-mono tabular-nums">₹{analysis.resistance}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
