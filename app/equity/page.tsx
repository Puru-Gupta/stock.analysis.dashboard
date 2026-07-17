"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchAPI,
  EquityAnalysis,
  MarketOverview,
  ScanResult,
} from "@/lib/api";
import CandlestickChart from "@/components/CandlestickChart";
import SignalDiagnostics from "@/components/SignalDiagnostics";
import { LabelWithInfo } from "@/components/InfoTip";
import { GlossaryButton } from "@/components/GlossaryPanel";
import { EQUITY_DEFINITIONS } from "@/lib/equity-definitions";
import {
  SignalBadge,
  ScoreBar,
  Disclaimer,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/Sidebar";
import EquityFilterPanel from "@/components/EquityFilterPanel";
import DataIntelPanel from "@/components/DataIntelPanel";
import MarketRegimeBanner from "@/components/MarketRegimeBanner";
import ScanPresets, { type ScanPreset } from "@/components/ScanPresets";
import PositionSizer from "@/components/PositionSizer";
import StockCompare from "@/components/StockCompare";
import WatchlistPanel, { useWatchlist } from "@/components/WatchlistPanel";
import { Download, BookmarkPlus } from "lucide-react";
import { useAppCache } from "@/components/AppCacheProvider";

const CACHE_KEY = "equity";

type EquityCache = {
  symbol: string;
  universe: string;
  sector: string;
  timeframe: string;
  recFilter: string;
  riskFilter: string;
  setupFilter: string;
  valuationFilter: string;
  analysis: EquityAnalysis | null;
  scanResults: ScanResult[];
  scanned: boolean;
  regimeOverview: MarketOverview | null;
  urlKey: string;
};

function EquityPageContent() {
  const searchParams = useSearchParams();
  const { add: addWatchlist } = useWatchlist();
  const cache = useAppCache();
  const cached = cache.get<EquityCache>(CACHE_KEY);
  const [symbol, setSymbol] = useState(cached?.symbol ?? "RELIANCE.NS");
  const [universe, setUniverse] = useState(cached?.universe ?? "nifty50");
  const [sector, setSector] = useState(cached?.sector ?? "IT");
  const [timeframe, setTimeframe] = useState(cached?.timeframe ?? "daily");
  const [recFilter, setRecFilter] = useState(cached?.recFilter ?? "");
  const [riskFilter, setRiskFilter] = useState(cached?.riskFilter ?? "");
  const [setupFilter, setSetupFilter] = useState(cached?.setupFilter ?? "");
  const [valuationFilter, setValuationFilter] = useState(cached?.valuationFilter ?? "");
  const [analysis, setAnalysis] = useState<EquityAnalysis | null>(cached?.analysis ?? null);
  const [scanResults, setScanResults] = useState<ScanResult[]>(cached?.scanResults ?? []);
  const [scanned, setScanned] = useState(cached?.scanned ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [regimeOverview, setRegimeOverview] = useState<MarketOverview | null>(cached?.regimeOverview ?? null);

  const persist = useCallback(
    (patch: Partial<EquityCache>) => {
      cache.set(CACHE_KEY, {
        symbol,
        universe,
        sector,
        timeframe,
        recFilter,
        riskFilter,
        setupFilter,
        valuationFilter,
        analysis,
        scanResults,
        scanned,
        regimeOverview,
        urlKey: cache.get<EquityCache>(CACHE_KEY)?.urlKey ?? "",
        ...patch,
      });
    },
    [
      cache, symbol, universe, sector, timeframe, recFilter, riskFilter,
      setupFilter, valuationFilter, analysis, scanResults, scanned, regimeOverview,
    ],
  );

  useEffect(() => {
    const saved = cache.get<EquityCache>(CACHE_KEY);
    if (!saved) return;
    setSymbol(saved.symbol);
    setUniverse(saved.universe);
    setSector(saved.sector);
    setTimeframe(saved.timeframe);
    setRecFilter(saved.recFilter);
    setRiskFilter(saved.riskFilter);
    setSetupFilter(saved.setupFilter);
    setValuationFilter(saved.valuationFilter);
    setAnalysis(saved.analysis);
    setScanResults(saved.scanResults);
    setScanned(saved.scanned);
    setRegimeOverview(saved.regimeOverview);
  }, [cache]);

  const analyze = useCallback(async (sym?: string) => {
    const target = sym || symbol;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAPI<EquityAnalysis>(
        `/api/equity/analyze?symbol=${encodeURIComponent(target)}&timeframe=${timeframe}`
      );
      setAnalysis(data);
      const nextSymbol = sym ? sym : symbol;
      if (sym) setSymbol(sym);
      persist({ analysis: data, symbol: nextSymbol });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, persist]);

  const runScan = useCallback(async (overrides?: Record<string, string>) => {
    const u = overrides?.universe ?? universe;
    const sec = overrides?.sector ?? sector;
    const rec = overrides?.recommendation ?? recFilter;
    const risk = overrides?.risk_level ?? riskFilter;
    const setup = overrides?.setup ?? setupFilter;
    const val = overrides?.valuation ?? valuationFilter;

    setLoading(true);
    setError("");
    setScanned(true);
    if (overrides?.universe) setUniverse(overrides.universe);
    if (overrides?.recommendation !== undefined) setRecFilter(overrides.recommendation);
    if (overrides?.setup !== undefined) setSetupFilter(overrides.setup);
    if (overrides?.valuation !== undefined) setValuationFilter(overrides.valuation);

    try {
      let url = `/api/equity/scan?universe=${u}&timeframe=${timeframe}&limit=40`;
      if (u === "sector") url += `&sector=${sec}`;
      if (rec) url += `&recommendation=${rec}`;
      if (risk) url += `&risk_level=${risk}`;
      if (setup) url += `&setup=${setup}`;
      if (val) url += `&valuation=${val}`;
      else if (u === "midcap" || u === "smallcap") url += `&valuation=soft`;
      const data = await fetchAPI<ScanResult[]>(url);
      setScanResults(data);
      persist({
        scanResults: data,
        scanned: true,
        universe: overrides?.universe ?? universe,
        recFilter: overrides?.recommendation ?? recFilter,
        setupFilter: overrides?.setup ?? setupFilter,
        valuationFilter: overrides?.valuation ?? valuationFilter,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setScanResults([]);
    } finally {
      setLoading(false);
    }
  }, [universe, sector, timeframe, recFilter, riskFilter, setupFilter, valuationFilter, persist]);

  const runPreset = (preset: ScanPreset) => {
    runScan(preset.params);
  };

  const urlKey = searchParams.toString();

  useEffect(() => {
    const saved = cache.get<EquityCache>(CACHE_KEY);
    if (saved?.urlKey === urlKey) return;

    const sym = searchParams.get("symbol");
    const autorun = searchParams.get("autorun");
    const uni = searchParams.get("universe");
    const rec = searchParams.get("recommendation");
    const setup = searchParams.get("setup");
    const val = searchParams.get("valuation");

    if (sym) {
      setSymbol(sym.toUpperCase());
      analyze(sym.toUpperCase());
    }
    if (uni) setUniverse(uni);
    if (rec) setRecFilter(rec);
    if (setup) setSetupFilter(setup);
    if (val) setValuationFilter(val);

    if (autorun === "1" || uni) {
      runScan({
        ...(uni ? { universe: uni } : {}),
        ...(rec ? { recommendation: rec } : {}),
        ...(setup ? { setup } : {}),
        ...(val ? { valuation: val } : {}),
      });
    }

    cache.set(CACHE_KEY, {
      ...(saved ?? {
        symbol: sym?.toUpperCase() ?? "RELIANCE.NS",
        universe: uni ?? "nifty50",
        sector: "IT",
        timeframe: "daily",
        recFilter: rec ?? "",
        riskFilter: "",
        setupFilter: setup ?? "",
        valuationFilter: val ?? "",
        analysis: null,
        scanResults: [],
        scanned: false,
        regimeOverview: null,
      }),
      urlKey,
    });
  }, [urlKey, searchParams, cache, analyze, runScan]);

  const exportCSV = () => {
    const rows = scanResults.length ? scanResults : analysis ? [analysis] : [];
    if (!rows.length) return;
    const headers = ["Symbol", "Name", "Signal", "Score", "Price", "R:R", "Risk", "Reason"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.symbol,
          "name" in r ? r.name : "",
          r.signal,
          r.final_score,
          "current_price" in r ? r.current_price : "",
          "risk_reward" in r ? r.risk_reward : "",
          "risk_level" in r ? r.risk_level : "",
          `"${("reason" in r ? r.reason : "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "equity_analysis.csv";
    a.click();
  };

  const regime = analysis?.index_regime || regimeOverview?.regime;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div className="page-header-title">
          <h1 className="page-title">Equity Analysis</h1>
          <p className="page-subtitle">
            Technical + fundamental decision engine for Indian stocks
          </p>
        </div>
        <div className="page-header-actions">
          <GlossaryButton />
          <button type="button" onClick={exportCSV} className="btn-secondary">
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
        </div>
      </div>

      <Disclaimer />

      {regime && (
        <MarketRegimeBanner
          regime={regime}
          niftyLast={regimeOverview?.nifty.last}
          compact
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="page-stack min-w-0">
          <EquityFilterPanel
            filters={{ symbol, universe, sector, timeframe, recFilter, riskFilter, setupFilter, valuationFilter }}
            onChange={(key, value) => {
              if (key === "symbol") setSymbol(value);
              else if (key === "universe") {
                setUniverse(value);
                if (value !== "midcap" && value !== "smallcap" && value !== "nifty500") {
                  setValuationFilter("");
                }
              }
              else if (key === "sector") setSector(value);
              else if (key === "timeframe") setTimeframe(value);
              else if (key === "recFilter") setRecFilter(value);
              else if (key === "riskFilter") setRiskFilter(value);
              else if (key === "setupFilter") setSetupFilter(value);
              else if (key === "valuationFilter") setValuationFilter(value);
            }}
            onAnalyze={() => analyze()}
            onScan={() => runScan()}
            loading={loading}
          />

          <ScanPresets onRun={runPreset} loading={loading} />

          {loading && <LoadingSpinner />}
          {error && <ErrorMessage message={error} />}

          {scanned && !loading && scanResults.length === 0 && !error && (
            <div className="card text-sm" style={{ color: "var(--fg-secondary)" }}>
              <p className="font-medium" style={{ color: "var(--fg-primary)" }}>No stocks matched this filter</p>
              <p className="mt-2 leading-relaxed">
                {recFilter === "Buy" &&
                  "Buy requires tech≥65, fund≥55, RS≥1.0, volume≥1.2×, R:R≥1.8, RSI≤70, and risk-on regime. Nifty 50/100 usually yield 0–2 Buys; Bank/Sector/Midcap often yield zero — that is the strict gate, not a broken scan. Try Recommendation → All or Watch."}
                {recFilter === "Sell" &&
                  "Sell needs final score under 35, or a downtrend with tech and fund both under 50. Empty usually means the market is not broadly weak — not a broken filter."}
                {recFilter === "Watch" && "No Watch names in the scanned pool — try clearing Risk/Setup filters or switch to All."}
                {recFilter === "Avoid" && "No Avoid names found. Try All to see the full distribution."}
                {!recFilter && (universe === "midcap" || universe === "smallcap") &&
                  "Mid/small-cap scans apply Cheap+Fair valuation by default (expensive names dropped). Try Valuation → Premium, or clear Risk/Setup filters."}
                {!recFilter && universe === "banknifty" &&
                  "Bank Nifty scan works — results are often Watch in neutral regimes. Switch Recommendation to All if you filtered to Buy."}
                {!recFilter && universe === "sector" &&
                  "Sector scan uses 7–8 names per sector. If empty, clear Setup/Risk filters or pick a different sector."}
                {!recFilter && universe === "nifty500" &&
                  "Nifty 500 scans up to 120 names (takes 2–4 min). If empty, clear Setup/Risk filters."}
                {!recFilter && !["midcap", "smallcap", "banknifty", "sector", "nifty500"].includes(universe) &&
                  "No results after filters. Clear Setup or Risk and scan again."}
              </p>
            </div>
          )}

          {analysis && !loading && (
            <div className="page-stack">
              <DataIntelPanel
                quality={analysis.data_quality}
                advantages={analysis.advantages}
                modeDetails={analysis.mode_details}
                agentQuotes={analysis.agent_quotes}
                agentsMs={analysis.agents_ms}
              />
              <div className="card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-normal tracking-[-0.02em]" style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}>{analysis.name}</h2>
                    <p className="text-sm font-mono tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                      {analysis.symbol} · {analysis.sector || "N/A"} · ₹{analysis.current_price}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => addWatchlist(analysis.symbol)}
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      Watchlist
                    </button>
                    <SignalBadge signal={analysis.signal} />
                    <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{analysis.recommendation}</span>
                    <span className="text-2xl font-normal font-mono tabular-nums" style={{ color: "var(--accent)" }}>{analysis.final_score}/100</span>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>{analysis.reason}</p>

                {(analysis.index_regime || analysis.trade_mode || analysis.expectancy) && (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {analysis.index_regime && (
                      <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                        <p className="field-label !mb-1 !normal-case !tracking-normal">Index regime</p>
                        <p className="text-sm font-medium" style={{ color: analysis.index_regime.allows_long ? "var(--green)" : "var(--red)" }}>
                          {analysis.index_regime.label}
                          {!analysis.index_regime.allows_long ? " · longs blocked" : ""}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-tertiary)" }}>
                          20d {analysis.index_regime.ret_20d}% · EMA50 {analysis.index_regime.ema50}
                        </p>
                      </div>
                    )}
                    {analysis.trade_mode && (
                      <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                        <p className="field-label !mb-1 !normal-case !tracking-normal">Trade mode</p>
                        <p className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>{analysis.trade_mode.label}</p>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-tertiary)" }}>{analysis.trade_mode.reason}</p>
                      </div>
                    )}
                    {analysis.expectancy && analysis.expectancy.samples > 0 && (
                      <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                        <p className="field-label !mb-1 !normal-case !tracking-normal">Expectancy proxy</p>
                        <p className="text-sm font-medium font-mono tabular-nums" style={{ color: "var(--fg-primary)" }}>
                          20d avg {analysis.expectancy.avg_ret_20d}% · hit {analysis.expectancy.hit_rate_20d}%
                        </p>
                        <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>n={analysis.expectancy.samples}</p>
                      </div>
                    )}
                  </div>
                )}

                {analysis.exit_plan && (
                  <div className="mt-4 rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <p className="field-label !mb-2 !normal-case !tracking-normal">
                      Exit plan · time stop {analysis.exit_plan.time_stop_days}d
                    </p>
                    <ul className="space-y-1 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                      {analysis.exit_plan.rules.map((r) => (
                        <li key={r}>· {r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.valuation_relative && (
                  <p className="mt-3 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                    Sector-relative ({analysis.valuation_relative.sector_key}):
                    {analysis.valuation_relative.pe_relative != null
                      ? ` PE ${analysis.valuation_relative.pe_relative}x median`
                      : ""}
                    {analysis.valuation_relative.pb_relative != null
                      ? ` · PB ${analysis.valuation_relative.pb_relative}x median`
                      : ""}
                    {analysis.valuation_relative.peg != null ? ` · PEG ${analysis.valuation_relative.peg}` : ""}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: "Entry Zone", value: `₹${analysis.entry_zone[0]} – ₹${analysis.entry_zone[1]}`, key: "entry_zone" },
                    { label: "Stop Loss", value: analysis.stop_loss, key: "stop_loss", color: "text-[var(--red)]" },
                    { label: "Target 1", value: analysis.target1, key: "target1", color: "text-[var(--green)]" },
                    { label: "Target 2", value: analysis.target2, key: "target2", color: "text-[var(--green)]" },
                    { label: "Risk/Reward", value: `1:${analysis.risk_reward}`, key: "risk_reward" },
                    { label: "Horizon", value: analysis.horizon, key: "invalidation" },
                  ].map(({ label, value, key, color }) => (
                    <div key={key} className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                      <div className="field-label !mb-1 !normal-case !tracking-normal">
                        <LabelWithInfo label={label} definition={EQUITY_DEFINITIONS[key]} />
                      </div>
                      <p className={`mt-1 text-lg font-normal font-mono tabular-nums ${color || ""}`} style={!color ? { color: "var(--fg-primary)" } : undefined}>
                        {typeof value === "number" ? `₹${value.toLocaleString("en-IN")}` : value}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-xs" style={{ color: "var(--amber)" }}>
                  Invalidation: {analysis.invalidation}
                </p>
              </div>

              <PositionSizer entry={analysis.current_price} stop={analysis.stop_loss} />
              <StockCompare primary={analysis} timeframe={timeframe} />

              {analysis.signal_diagnostics && (
                <SignalDiagnostics diagnostics={analysis.signal_diagnostics} />
              )}

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="card lg:col-span-2">
                  <h3 className="card-section-title">Price Chart</h3>
                  <CandlestickChart
                    data={analysis.chart_data || []}
                    support={analysis.support}
                    resistance={analysis.resistance}
                    entryZone={analysis.entry_zone}
                    stopLoss={analysis.stop_loss}
                    target={analysis.target1}
                    target2={analysis.target2}
                  />
                </div>

                <div className="space-y-4">
                  <div className="card">
                    <h3 className="card-section-title !normal-case !tracking-normal">
                      <LabelWithInfo label="Scores" definition={EQUITY_DEFINITIONS.final_score} />
                    </h3>
                    <div className="space-y-3">
                      <ScoreBar score={analysis.final_score} label="Final Score" />
                      <ScoreBar score={analysis.technical_score} label={`Technical (${analysis.technical_view})`} />
                      <ScoreBar score={analysis.fundamental_score} label={`Fundamental (${analysis.fundamental_view})`} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanResults.length > 0 && !loading && (
            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Universe Scan — {scanResults.length} stocks
                {recFilter ? ` · filter: ${recFilter}` : ""}
                {(universe === "midcap" || universe === "smallcap") && !valuationFilter
                  ? " · valuation: Cheap+Fair"
                  : valuationFilter
                    ? ` · valuation: ${valuationFilter}`
                    : ""}
              </h3>
              <div className="table-scroll overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Signal</th>
                      <th>Score</th>
                      <th>Tech</th>
                      <th>Fund</th>
                      <th>PE</th>
                      <th>Val</th>
                      <th>Mode</th>
                      <th>20d%</th>
                      <th>Price</th>
                      <th>R:R</th>
                      <th>Risk</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResults.map((r) => (
                      <tr key={r.symbol} onClick={() => analyze(r.symbol)}>
                        <td className="font-medium">{r.symbol.replace(".NS", "")}</td>
                        <td><SignalBadge signal={r.signal} /></td>
                        <td className="font-mono tabular-nums" style={{ color: "var(--accent)" }}>{r.final_score}</td>
                        <td className="font-mono tabular-nums">{r.technical_score}</td>
                        <td className="font-mono tabular-nums">{r.fundamental_score}</td>
                        <td className="font-mono tabular-nums">
                          {r.pe_ratio != null ? Number(r.pe_ratio).toFixed(1) : "—"}
                        </td>
                        <td className="text-xs capitalize" style={{ color: "var(--fg-secondary)" }}>
                          {r.valuation_bracket || "—"}
                        </td>
                        <td className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                          {r.trade_mode || "—"}
                        </td>
                        <td className="font-mono tabular-nums text-xs">
                          {r.exp_20d != null ? `${r.exp_20d}%` : "—"}
                        </td>
                        <td className="font-mono tabular-nums">₹{r.current_price}</td>
                        <td className="font-mono tabular-nums">1:{r.risk_reward}</td>
                        <td>{r.risk_level}</td>
                        <td className="max-w-[200px] truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <aside className="hidden xl:block">
          <WatchlistPanel onSelect={(sym) => analyze(sym)} />
        </aside>
      </div>
    </div>
  );
}

export default function EquityPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EquityPageContent />
    </Suspense>
  );
}
