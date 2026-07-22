"use client";

import { useState, useCallback, useEffect } from "react";
import { fetchAPI, OptionsAnalysis, OptionStatsPick } from "@/lib/api";
import {
  SignalBadge,
  Disclaimer,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/Sidebar";
import { Search, RefreshCw } from "lucide-react";
import DataIntelPanel from "@/components/DataIntelPanel";
import SellerAssistant from "@/components/SellerAssistant";
import OptionsStatsDashboard from "@/components/OptionsStatsDashboard";
import {
  OptionsInterpretationGuideButton,
  OptionsInterpretationSummary,
} from "@/components/OptionsInterpretationGuide";
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
  statsPicks: OptionStatsPick[];
  statsPicksLoaded: boolean;
  analysisLoaded: boolean;
};

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
  const [statsPicks, setStatsPicks] = useState<OptionStatsPick[]>(cached?.statsPicks ?? []);
  const [loading, setLoading] = useState(false);
  const [statsPicksLoading, setStatsPicksLoading] = useState(false);
  const [error, setError] = useState("");
  const [statsPicksLoaded, setStatsPicksLoaded] = useState(cached?.statsPicksLoaded ?? false);

  const persist = useCallback(
    (patch: Partial<OptionsCache>) => {
      cache.set(CACHE_KEY, {
        symbol,
        optionType,
        strategyMode,
        capital,
        riskLevel,
        analysis,
        statsPicks,
        statsPicksLoaded,
        analysisLoaded: !!analysis,
        ...patch,
      });
    },
    [cache, symbol, optionType, strategyMode, capital, riskLevel, analysis, statsPicks, statsPicksLoaded],
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
    setStatsPicks(saved.statsPicks ?? []);
    setStatsPicksLoaded(saved.statsPicksLoaded ?? false);
  }, [cache]);

  const loadStatsPicks = useCallback(async () => {
    setStatsPicksLoading(true);
    try {
      const data = await fetchAPI<OptionStatsPick[]>(
        `/api/options/stats/scan?option_type=${optionType}&limit=20`,
      );
      setStatsPicks(data);
      setStatsPicksLoaded(true);
      persist({ statsPicks: data, statsPicksLoaded: true, optionType });
    } catch {
      setStatsPicks([]);
    } finally {
      setStatsPicksLoading(false);
    }
  }, [optionType, persist]);

  useEffect(() => {
    if (subTab !== "analysis") return;
    loadStatsPicks();
  }, [subTab, optionType, loadStatsPicks]);

  const analyze = useCallback(async (symOverride?: string) => {
    const sym = symOverride ?? symbol;
    setSymbol(sym);
    setLoading(true);
    setError("");
    try {
      const data = await fetchAPI<OptionsAnalysis>(
        `/api/options/analyze?symbol=${encodeURIComponent(sym)}&option_type=${optionType}&strategy_mode=${strategyMode}&capital=${capital}&risk_level=${riskLevel}`
      );
      setAnalysis(data);
      persist({ analysis: data, symbol: sym, optionType, strategyMode, capital, riskLevel, analysisLoaded: true });
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
              : "Probability-based decision support for option selling"}
          </p>
        </div>
        {subTab === "analysis" && <OptionsInterpretationGuideButton className="shrink-0" />}
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
                onClick={() => analyze()}
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

      {/* Best stocks by statistical option score */}
      <div className="card" style={{ borderColor: "rgba(245,78,0,0.2)" }}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Best Stocks for Option Selling — ranked by score
            </h3>
            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
              Scans NIFTY 50 liquid names using IV edge, vol regime, distribution confidence, and price stretch. Highest{" "}
              <strong>Option Score</strong> = best candidate today for {optionType === "call" ? "call" : "put"} selling.
            </p>
          </div>
          <button onClick={loadStatsPicks} className="btn-secondary flex items-center gap-2 text-xs shrink-0">
            <RefreshCw className={`h-3 w-3 ${statsPicksLoading ? "animate-spin" : ""}`} /> Rescan
          </button>
        </div>
        {statsPicksLoading && !statsPicksLoaded ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>Scanning 30 liquid NIFTY names…</p>
        ) : statsPicks.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>No results — click Rescan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stock</th>
                  <th>Option Score</th>
                  <th>Vol Score</th>
                  <th>IV Rank</th>
                  <th>IV/HV</th>
                  <th>Regime</th>
                  <th>Conf.</th>
                  <th>Z (1M)</th>
                  <th>Trend</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {statsPicks.map((p, i) => (
                  <tr
                    key={p.symbol}
                    className="cursor-pointer"
                    onClick={() => analyze(p.symbol)}
                  >
                    <td className="font-mono text-xs tabular-nums" style={{ color: "var(--fg-muted)" }}>{i + 1}</td>
                    <td className="font-medium">{p.name}</td>
                    <td className="font-mono tabular-nums text-base" style={{ color: p.option_score >= 60 ? "var(--green)" : p.option_score >= 45 ? "var(--accent)" : "var(--fg-primary)" }}>
                      {p.option_score}
                    </td>
                    <td className="font-mono text-xs tabular-nums">{p.seller_vol_score}</td>
                    <td className="font-mono text-xs tabular-nums">{p.iv_rank}%</td>
                    <td className="font-mono text-xs tabular-nums">{p.iv_hv_ratio}x</td>
                    <td className="text-xs">{p.regime}</td>
                    <td className="font-mono text-xs tabular-nums">{p.confidence}</td>
                    <td className="font-mono text-xs tabular-nums" style={{ color: Math.abs(p.z_score_1m) >= 1.5 ? "var(--amber)" : undefined }}>
                      {p.z_score_1m > 0 ? "+" : ""}{p.z_score_1m}
                    </td>
                    <td className="text-xs">{p.trend_label}</td>
                    <td className="max-w-[180px] truncate text-xs" style={{ color: "var(--fg-secondary)" }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
          Click a row to load full statistical analysis for that stock. Sort by <strong>Option Score</strong> — start with #1.
        </p>
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

          {analysis.stats && (
            <>
              <OptionsInterpretationSummary />
              <OptionsStatsDashboard analysis={analysis} />
            </>
          )}

          {analysis.movement_insight && (
            <div
              className={`card border ${
                analysis.movement_insight.suitability === "favorable"
                  ? "border-green-500/30"
                  : analysis.movement_insight.suitability === "avoid"
                    ? "border-red-500/30"
                    : "border-amber-500/30"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                    Strategy Fit: {optionType === "call" ? "Call" : "Put"} {strategyLabel}
                  </h3>
                  <p className="mt-2 text-sm" style={{ color: "var(--fg-secondary)" }}>
                    {analysis.movement_insight.summary}
                  </p>
                </div>
                <SuitabilityBadge s={analysis.movement_insight.suitability} />
              </div>
            </div>
          )}

          {analysis.note && (
            <p className="text-xs" style={{ color: "var(--amber)" }}>
              {analysis.note}
            </p>
          )}

          <div className="card">
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Engine Strike Picks
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
