"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { fetchAPI, OptionsAnalysis, OptionStatsPick, OptionRec } from "@/lib/api";
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
import PremiumDecayTimelinePanel from "@/components/PremiumDecayTimeline";
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

function FocusBadge({
  status,
  label,
  tags,
  earningsLabel,
  earningsDays,
}: {
  status: "clean" | "caution" | "avoid";
  label: string;
  tags?: string[];
  earningsLabel?: string;
  earningsDays?: number;
}) {
  const cls =
    status === "clean" ? "badge-buy" : status === "caution" ? "badge-watch" : "badge-sell";
  const title = [
    tags?.join(" · "),
    earningsLabel && earningsDays != null ? `Results ${earningsLabel} (${earningsDays}d)` : "",
  ]
    .filter(Boolean)
    .join(" · ") || label;
  return (
    <div>
      <span className={cls} title={title}>
        {label}
      </span>
      {earningsLabel && earningsDays != null && earningsDays <= 45 && (
        <p className="mt-0.5 font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-muted)" }}>
          {earningsLabel} · {earningsDays}d
        </p>
      )}
    </div>
  );
}

function StrikePicksTable({ picks, emptyHint }: { picks: OptionRec[]; emptyHint?: string }) {
  if (picks.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
        {emptyHint ?? "No qualifying strikes for this expiry and strategy."}
      </p>
    );
  }
  return (
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
            <th className="table-cell-note">Reason</th>
          </tr>
        </thead>
        <tbody>
          {picks.map((r, i) => {
            const isSell = r.action.includes("Sell");
            const thetaDisplay = r.theta != null ? (isSell ? Math.abs(r.theta) : r.theta) : null;
            return (
              <tr key={`${r.action}-${r.strike}-${i}`}>
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
                  {r.theta_decay_7d != null ? `${isSell ? "+" : ""}₹${Math.abs(r.theta_decay_7d).toFixed(2)}` : "—"}
                </td>
                <td className="font-mono text-xs tabular-nums">{r.delta != null ? r.delta.toFixed(2) : "—"}</td>
                <td>{r.moneyness}</td>
                <td className="font-mono tabular-nums">{r.prob_itm}%</td>
                <td className="font-mono tabular-nums">{r.prob_otm}%</td>
                <td className="font-mono tabular-nums">
                  {"breakeven" in r && r.breakeven ? `₹${r.breakeven}` : r.entry_premium ? `₹${r.entry_premium[0]}–${r.entry_premium[1]}` : "—"}
                </td>
                <td className="font-mono tabular-nums">
                  {isSell && (r as { stop_label?: string }).stop_label
                    ? (r as { stop_label?: string }).stop_label
                    : r.stop_loss
                      ? `₹${r.stop_loss}`
                      : "—"}
                </td>
                <td className="table-cell-note">{r.reason || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function OptionsPage() {
  const cache = useAppCache();
  const cacheSet = cache.set;
  // Defaults only — restore from sessionStorage after cache.ready to avoid hydration mismatch.
  const [subTab, setSubTab] = useState("analysis");
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [optionType, setOptionType] = useState("call");
  const [strategyMode, setStrategyMode] = useState("selling");
  const [capital, setCapital] = useState(100000);
  const [riskLevel, setRiskLevel] = useState("medium");
  const [analysis, setAnalysis] = useState<OptionsAnalysis | null>(null);
  const [statsPicks, setStatsPicks] = useState<OptionStatsPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsPicksLoading, setStatsPicksLoading] = useState(false);
  const [error, setError] = useState("");
  const [statsPicksLoaded, setStatsPicksLoaded] = useState(false);
  const [cleanOnly, setCleanOnly] = useState(false);

  const snapshotRef = useRef({
    symbol,
    optionType,
    strategyMode,
    capital,
    riskLevel,
    analysis,
    statsPicks,
    statsPicksLoaded,
  });
  snapshotRef.current = {
    symbol,
    optionType,
    strategyMode,
    capital,
    riskLevel,
    analysis,
    statsPicks,
    statsPicksLoaded,
  };

  const persist = useCallback(
    (patch: Partial<OptionsCache>) => {
      cacheSet(CACHE_KEY, {
        ...snapshotRef.current,
        analysisLoaded: !!snapshotRef.current.analysis,
        ...patch,
      });
    },
    [cacheSet],
  );

  const statsScanningRef = useRef(false);
  const scannedOptionTypeRef = useRef<string | null>(null);
  const [cacheRestored, setCacheRestored] = useState(false);

  useEffect(() => {
    if (!cache.ready || cacheRestored) return;
    const sub = cache.get<string>(SUBTAB_CACHE_KEY);
    if (sub) setSubTab(sub);
    const saved = cache.get<OptionsCache>(CACHE_KEY);
    if (saved) {
      setSymbol(saved.symbol ?? "RELIANCE.NS");
      setOptionType(saved.optionType ?? "call");
      setStrategyMode(saved.strategyMode ?? "selling");
      setCapital(saved.capital ?? 100000);
      setRiskLevel(saved.riskLevel ?? "medium");
      setAnalysis(saved.analysis ?? null);
      setStatsPicks(saved.statsPicks ?? []);
      setStatsPicksLoaded(saved.statsPicksLoaded ?? false);
      if (saved.statsPicksLoaded && (saved.statsPicks?.length ?? 0) > 0) {
        scannedOptionTypeRef.current = saved.optionType ?? null;
      }
    }
    setCacheRestored(true);
  }, [cache, cacheRestored]);

  const loadStatsPicks = useCallback(async () => {
    if (statsScanningRef.current) return;
    statsScanningRef.current = true;
    setStatsPicksLoading(true);
    try {
      const data = await fetchAPI<OptionStatsPick[]>(
        `/api/options/stats/scan?option_type=${optionType}&limit=50`,
      );
      setStatsPicks(data);
      setStatsPicksLoaded(true);
      scannedOptionTypeRef.current = optionType;
      persist({ statsPicks: data, statsPicksLoaded: true, optionType });
    } catch {
      setStatsPicks([]);
    } finally {
      setStatsPicksLoading(false);
      statsScanningRef.current = false;
    }
  }, [optionType, persist]);

  useEffect(() => {
    if (!cacheRestored) return;
    if (subTab !== "analysis") return;
    if (scannedOptionTypeRef.current === optionType) return;
    scannedOptionTypeRef.current = optionType;
    loadStatsPicks();
  }, [cacheRestored, subTab, optionType, loadStatsPicks]);

  const analyze = useCallback(async (symOverride?: string, modeOverride?: string) => {
    const sym = symOverride ?? symbol;
    const mode = modeOverride ?? strategyMode;
    if (modeOverride) setStrategyMode(modeOverride);
    setSymbol(sym);
    setLoading(true);
    setError("");
    try {
      const data = await fetchAPI<OptionsAnalysis>(
        `/api/options/analyze?symbol=${encodeURIComponent(sym)}&option_type=${optionType}&strategy_mode=${mode}&capital=${capital}&risk_level=${riskLevel}`
      );
      setAnalysis(data);
      persist({ analysis: data, symbol: sym, optionType, strategyMode: mode, capital, riskLevel, analysisLoaded: true });
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

  const visibleStatsPicks = cleanOnly
    ? statsPicks.filter((p) => p.focus_status === "clean")
    : statsPicks;

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
              Scans all 50 NIFTY names for IV edge, regime, and confidence.{" "}
              <strong>Focus</strong> flags news/odd activity (gaps, vol spikes, large moves). Pick{" "}
              <strong>Clean</strong> names with the highest Option Score.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="pill-group" role="group">
              <button
                type="button"
                className={`pill ${!cleanOnly ? "pill-active" : ""}`}
                onClick={() => setCleanOnly(false)}
              >
                All
              </button>
              <button
                type="button"
                className={`pill ${cleanOnly ? "pill-active" : ""}`}
                onClick={() => setCleanOnly(true)}
              >
                Clean only
              </button>
            </div>
            <button
            onClick={() => {
              scannedOptionTypeRef.current = null;
              loadStatsPicks();
            }}
            className="btn-secondary flex items-center gap-2 text-xs shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${statsPicksLoading ? "animate-spin" : ""}`} /> Rescan
          </button>
          </div>
        </div>
        {statsPicksLoading && !statsPicksLoaded ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>Scanning all 50 NIFTY names…</p>
        ) : statsPicks.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>No results — click Rescan.</p>
        ) : visibleStatsPicks.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            No clean names right now — switch to <strong>All</strong> or try the other side (Call/Put).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stock</th>
                  <th>Focus</th>
                  <th>Option Score</th>
                  <th>Vol Score</th>
                  <th>IV Rank</th>
                  <th>IV/HV</th>
                  <th>Regime</th>
                  <th>Conf.</th>
                  <th>Z (1M)</th>
                  <th>Trend</th>
                  <th className="table-cell-note">Why</th>
                </tr>
              </thead>
              <tbody>
                {visibleStatsPicks.map((p, i) => (
                  <tr
                    key={p.symbol}
                    className="cursor-pointer"
                    onClick={() => analyze(p.symbol, "selling")}
                    style={{
                      opacity: p.focus_status === "avoid" ? 0.72 : 1,
                    }}
                  >
                    <td className="font-mono text-xs tabular-nums" style={{ color: "var(--fg-muted)" }}>{i + 1}</td>
                    <td className="font-medium">{p.name}</td>
                    <td>
                      <FocusBadge
                        status={p.focus_status}
                        label={p.focus_label}
                        tags={p.focus_tags}
                        earningsLabel={p.earnings_label}
                        earningsDays={p.earnings_days}
                      />
                    </td>
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
                    <td className="table-cell-note">{p.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
          Click a row for full analysis. Prefer <strong>Clean</strong> focus — skip <strong>Results soon</strong> / <strong>News / odd</strong> unless using very wide strikes.
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
              {analysis.premium_decay && (
                <PremiumDecayTimelinePanel
                  timeline={analysis.premium_decay}
                  comparison={analysis.expiry_comparison}
                  title="Premium Decay Timeline — top strike pick"
                />
              )}
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
              {analysis.next_expiry_chain
                ? `Engine Strike Picks — ${analysis.expiry} (${analysis.days_to_expiry} DTE)`
                : "Engine Strike Picks"}
            </h3>
            <StrikePicksTable
              picks={analysis.recommendations}
              emptyHint={
                analysis.next_expiry_chain && (analysis.strategy_mode === "selling" || analysis.strategy_mode === "neutral")
                  ? "Nearest expiry ≤10 DTE — sell picks suppressed here. Use the next-expiry table below."
                  : analysis.stats?.focus?.status === "avoid"
                    ? "Strategy Fit is Avoid — no strike sells emitted."
                    : undefined
              }
            />
          </div>

          {analysis.next_expiry_chain && (
            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Next expiry — {analysis.next_expiry_chain.expiry} ({analysis.next_expiry_chain.days_to_expiry} DTE)
              </h3>
              <p className="mb-3 text-xs" style={{ color: "var(--fg-secondary)" }}>
                Current series has ≤10 DTE — strikes below use the next expiry chain (preferred for new premium selling).
              </p>
              <StrikePicksTable picks={analysis.next_expiry_chain.recommendations} />
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
