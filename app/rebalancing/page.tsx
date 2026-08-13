"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAPI,
  RebalanceScanResult,
  RebalancePick,
  PortfolioEvaluateResult,
  RebalanceGoal,
  AnalysisBias,
  PortfolioSignal,
  BacktestResult,
  PortfolioSnapshotRow,
  LookbackMonths,
} from "@/lib/api";
import {
  Disclaimer,
  ErrorMessage,
  LoadingSpinner,
  ScoreBar,
} from "@/components/Sidebar";
import { useAppCache } from "@/components/AppCacheProvider";
import { useVirtualPortfolio } from "@/lib/hooks/useVirtualPortfolio";
import { ATR_STOP_MULTIPLIER, LOOKBACK_MONTH_OPTIONS } from "@/lib/rebalancing-constants";
import { RefreshCw, Plus, Trash2, Wallet, LineChart, History } from "lucide-react";

const CACHE_KEY = "rebalancing";
const SUBTAB_KEY = "rebalancing_subtab";

type RebalanceCache = {
  scan: RebalanceScanResult | null;
  evaluation: PortfolioEvaluateResult | null;
  backtest: BacktestResult | null;
  goal: RebalanceGoal;
  universe: string;
  analysisBias: AnalysisBias;
  lookbackMonths: LookbackMonths;
  monthlyCapital: number;
  customSymbols: string;
};

function SignalPill({ signal }: { signal: PortfolioSignal }) {
  const cls =
    signal === "BUY" ? "badge-buy" : signal === "SELL" ? "badge-sell" : "badge-watch";
  return <span className={cls}>{signal}</span>;
}

function PickRow({
  pick,
  onAdd,
  inPortfolio,
}: {
  pick: RebalancePick;
  onAdd: (p: RebalancePick) => void;
  inPortfolio: boolean;
}) {
  return (
    <tr>
      <td className="font-mono text-xs tabular-nums">{pick.rank}</td>
      <td className="font-medium">{pick.name}</td>
      <td><SignalPill signal={pick.signal} /></td>
      <td className="font-mono tabular-nums" style={{ color: pick.composite_score >= 75 ? "var(--green)" : "var(--accent)" }}>
        {pick.composite_score}
      </td>
      <td className="font-mono text-xs tabular-nums">{pick.technical_score}</td>
      <td className="font-mono text-xs tabular-nums">{pick.fundamental_score}</td>
      <td className="font-mono tabular-nums">₹{pick.current_price}</td>
      <td className="font-mono text-xs tabular-nums">{pick.target_weight_pct}%</td>
      <td className="font-mono text-xs tabular-nums">₹{pick.suggested_amount.toLocaleString("en-IN")}</td>
      <td className="font-mono text-xs tabular-nums">{pick.suggested_qty}</td>
      <td className="font-mono text-xs tabular-nums" style={{ color: "var(--red)" }}>₹{pick.atr_stop}</td>
      <td className="max-w-[200px] table-cell-note" title={pick.thesis}>
        {pick.thesis}
      </td>
      <td>
        <button
          type="button"
          className="btn-secondary text-xs flex items-center gap-1"
          disabled={inPortfolio}
          onClick={() => onAdd(pick)}
        >
          <Plus className="h-3 w-3" />
          {inPortfolio ? "Added" : "Add"}
        </button>
      </td>
    </tr>
  );
}

export default function RebalancingPage() {
  const cache = useAppCache();
  const portfolio = useVirtualPortfolio();
  const [subTab, setSubTab] = useState("picks");
  const [goal, setGoal] = useState<RebalanceGoal>("balanced");
  const [universe, setUniverse] = useState("nifty50");
  const [analysisBias, setAnalysisBias] = useState<AnalysisBias>("balanced");
  const [lookbackMonths, setLookbackMonths] = useState<LookbackMonths>(12);
  const [monthlyCapital, setMonthlyCapital] = useState(100_000);
  const [customSymbols, setCustomSymbols] = useState("");
  const [scan, setScan] = useState<RebalanceScanResult | null>(null);
  const [evaluation, setEvaluation] = useState<PortfolioEvaluateResult | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshotRow[]>([]);
  const [dbConfigured, setDbConfigured] = useState<boolean | null>(null);
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingEval, setLoadingEval] = useState(false);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [error, setError] = useState("");
  const restoredRef = useRef(false);
  const [cacheRestored, setCacheRestored] = useState(false);

  useEffect(() => {
    if (!cache.ready || cacheRestored) return;
    const sub = cache.get<string>(SUBTAB_KEY);
    if (sub) setSubTab(sub);
    const saved = cache.get<RebalanceCache>(CACHE_KEY);
    if (saved) {
      setGoal(saved.goal);
      setUniverse(saved.universe);
      setAnalysisBias(saved.analysisBias);
      setLookbackMonths(saved.lookbackMonths ?? 12);
      setMonthlyCapital(saved.monthlyCapital);
      setCustomSymbols(saved.customSymbols);
      setScan(saved.scan);
      setEvaluation(saved.evaluation);
      setBacktest(saved.backtest ?? null);
      if (saved.monthlyCapital) portfolio.setMonthlyCapital(saved.monthlyCapital);
    }
    restoredRef.current = true;
    setCacheRestored(true);
  }, [cache, cacheRestored, portfolio]);

  const persist = useCallback(
    (patch: Partial<RebalanceCache>) => {
      cache.set(CACHE_KEY, {
        scan,
        evaluation,
        backtest,
        goal,
        universe,
        analysisBias,
        lookbackMonths,
        monthlyCapital,
        customSymbols,
        ...patch,
      });
    },
    [cache, scan, evaluation, backtest, goal, universe, analysisBias, lookbackMonths, monthlyCapital, customSymbols],
  );

  const loadHistory = useCallback(async () => {
    if (!portfolio.clientId) return;
    try {
      const data = await fetchAPI<{ configured: boolean; history: PortfolioSnapshotRow[] }>(
        `/api/portfolio?client_id=${encodeURIComponent(portfolio.clientId)}`,
      );
      setDbConfigured(data.configured);
      setHistory(data.history || []);
    } catch {
      setDbConfigured(false);
    }
  }, [portfolio.clientId]);

  const runScan = useCallback(async () => {
    setLoadingScan(true);
    setError("");
    try {
      const q = new URLSearchParams({
        goal,
        universe,
        analysis_bias: analysisBias,
        lookback_months: String(lookbackMonths),
        monthly_capital: String(monthlyCapital),
        limit: "10",
      });
      if (universe === "custom" && customSymbols.trim()) {
        q.set("custom_symbols", customSymbols);
      }
      const data = await fetchAPI<RebalanceScanResult>(`/api/rebalancing/scan?${q}`);
      setScan(data);
      persist({ scan: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoadingScan(false);
    }
  }, [goal, universe, analysisBias, lookbackMonths, monthlyCapital, customSymbols, persist]);

  const runEvaluate = useCallback(async () => {
    setLoadingEval(true);
    setError("");
    try {
      const data = await fetchAPI<PortfolioEvaluateResult>("/api/rebalancing/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: portfolio.holdings,
          client_id: portfolio.clientId,
          scan,
          rescan: !scan,
          goal,
          universe,
          analysis_bias: analysisBias,
          lookback_months: lookbackMonths,
          monthly_capital: monthlyCapital,
          custom_symbols: customSymbols.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      setEvaluation(data);
      if (data.stop_updates?.length) portfolio.updateStops(data.stop_updates);
      if (data.scan) setScan(data.scan);
      persist({ evaluation: data, scan: data.scan ?? scan });
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portfolio evaluation failed");
    } finally {
      setLoadingEval(false);
    }
  }, [portfolio.holdings, portfolio.clientId, portfolio.updateStops, scan, goal, universe, analysisBias, lookbackMonths, monthlyCapital, customSymbols, persist, loadHistory]);

  const runBacktest = useCallback(async () => {
    setLoadingBacktest(true);
    setError("");
    try {
      const q = new URLSearchParams({
        universe,
        lookback_months: String(lookbackMonths),
        monthly_capital: String(monthlyCapital),
      });
      const data = await fetchAPI<BacktestResult>(`/api/rebalancing/backtest?${q}`);
      setBacktest(data);
      persist({ backtest: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setLoadingBacktest(false);
    }
  }, [universe, lookbackMonths, monthlyCapital, persist]);

  useEffect(() => {
    if (!cacheRestored) return;
    if (!scan && !loadingScan) runScan();
  }, [cacheRestored]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cacheRestored || !portfolio.ready) return;
    if (portfolio.holdings.length > 0) runEvaluate();
  }, [portfolio.holdings.length, cacheRestored, portfolio.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cacheRestored || !portfolio.ready || !portfolio.clientId) return;
    loadHistory();
  }, [cacheRestored, portfolio.ready, portfolio.clientId, loadHistory]);

  const addPick = (pick: RebalancePick) => {
    portfolio.addHolding({
      symbol: pick.symbol,
      name: pick.name,
      quantity: pick.suggested_qty,
      entryPrice: pick.current_price,
      entryDate: new Date().toISOString().split("T")[0],
      atrAtEntry: pick.atr,
      atrStop: pick.atr_stop,
      targetWeight: pick.target_weight_pct,
      source: "recommendation",
    });
    setSubTab("portfolio");
    cache.set(SUBTAB_KEY, "portfolio");
  };

  const heldSymbols = new Set(portfolio.holdings.map((h) => h.symbol));

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Rebalancing</h1>
          <p className="page-subtitle">
            Funda + technical picks · trailing ATR stops · risk-parity · virtual portfolio + backtest
          </p>
        </div>
      </div>

      <Disclaimer />

      <div className="card">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="field-label">Goal</p>
            <select className="input-field w-full" value={goal} onChange={(e) => setGoal(e.target.value as RebalanceGoal)}>
              <option value="growth">Growth</option>
              <option value="balanced">Balanced</option>
              <option value="income">Income / Dividend</option>
              <option value="defensive">Defensive</option>
            </select>
          </div>
          <div>
            <p className="field-label">Universe</p>
            <select className="input-field w-full" value={universe} onChange={(e) => setUniverse(e.target.value)}>
              <option value="nifty50">NIFTY 50</option>
              <option value="nifty100">NIFTY 100</option>
              <option value="nifty500">NIFTY 500</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <p className="field-label">History window</p>
            <select
              className="input-field w-full"
              value={lookbackMonths}
              onChange={(e) => setLookbackMonths(Number(e.target.value) as LookbackMonths)}
            >
              {LOOKBACK_MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} months</option>
              ))}
            </select>
          </div>
          <div>
            <p className="field-label">Analysis bias</p>
            <select className="input-field w-full" value={analysisBias} onChange={(e) => setAnalysisBias(e.target.value as AnalysisBias)}>
              <option value="balanced">Balanced</option>
              <option value="fundamental">Fundamental-heavy</option>
              <option value="technical">Technical-heavy</option>
              <option value="adaptive">Regime-adaptive</option>
            </select>
          </div>
          <div>
            <p className="field-label">Monthly deploy (₹)</p>
            <input
              type="number"
              className="input-field w-full font-mono tabular-nums"
              value={monthlyCapital}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setMonthlyCapital(v);
                portfolio.setMonthlyCapital(v);
              }}
              step={5000}
              min={10000}
            />
          </div>
        </div>
        {universe === "custom" && (
          <div className="mt-3">
            <p className="field-label">Custom symbols (comma-separated)</p>
            <input
              className="input-field w-full font-mono text-sm"
              placeholder="RELIANCE.NS, TCS.NS, INFY.NS"
              value={customSymbols}
              onChange={(e) => setCustomSymbols(e.target.value)}
            />
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary flex items-center gap-2" onClick={runScan} disabled={loadingScan}>
            <RefreshCw className={`h-4 w-4 ${loadingScan ? "animate-spin" : ""}`} />
            {loadingScan ? "Scanning…" : "Refresh monthly picks"}
          </button>
          <button type="button" className="btn-secondary flex items-center gap-2" onClick={runBacktest} disabled={loadingBacktest}>
            <LineChart className="h-4 w-4" />
            {loadingBacktest ? "Running…" : "Run backtest"}
          </button>
          {portfolio.holdings.length > 0 && (
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={runEvaluate} disabled={loadingEval}>
              <Wallet className="h-4 w-4" />
              {loadingEval ? "Updating…" : "Update portfolio"}
            </button>
          )}
        </div>
      </div>

      {scan && (
        <div className="card" style={{ borderColor: "rgba(59,130,246,0.25)" }}>
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            <strong>{scan.month_label}</strong> · {scan.lookback_months}mo history · {scan.regime.label} · scanned {scan.scanned} names ·{" "}
            {scan.picks.length} portfolio picks
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>{scan.note}</p>
        </div>
      )}

      <div className="pill-group" role="tablist">
        {(
          [
            { value: "picks", label: "Monthly picks" },
            { value: "portfolio", label: `Virtual portfolio (${portfolio.holdings.length})` },
            { value: "backtest", label: "Backtest" },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={subTab === value}
            className={`pill ${subTab === value ? "pill-active" : ""}`}
            onClick={() => {
              setSubTab(value);
              cache.set(SUBTAB_KEY, value);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <ErrorMessage message={error} />}
      {(loadingScan || loadingEval || loadingBacktest) && <LoadingSpinner />}

      {subTab === "picks" && scan && !loadingScan && (
        <>
          <div className="card">
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Top picks — risk-parity allocation
            </h3>
            <p className="mb-3 text-xs" style={{ color: "var(--fg-muted)" }}>
              Initial stop = entry − {ATR_STOP_MULTIPLIER}× ATR(14). Portfolio review ratchets trailing stops up (never down).
            </p>
            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Stock</th>
                    <th>Signal</th>
                    <th>Score</th>
                    <th>Tech</th>
                    <th>Fund</th>
                    <th>Price</th>
                    <th>Weight</th>
                    <th>₹ Deploy</th>
                    <th>Qty</th>
                    <th>ATR stop</th>
                    <th className="table-cell-note">Thesis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {scan.picks.map((p) => (
                    <PickRow key={p.symbol} pick={p} onAdd={addPick} inPortfolio={heldSymbols.has(p.symbol)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {scan.watchlist.length > 0 && (
            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Watchlist — next best
              </h3>
              <div className="overflow-x-auto">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Stock</th>
                      <th>Score</th>
                      <th>Price</th>
                      <th>ATR stop</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scan.watchlist.map((p) => (
                      <tr key={p.symbol}>
                        <td>{p.rank}</td>
                        <td>{p.name}</td>
                        <td className="font-mono tabular-nums">{p.composite_score}</td>
                        <td className="font-mono tabular-nums">₹{p.current_price}</td>
                        <td className="font-mono tabular-nums">₹{p.atr_stop}</td>
                        <td>
                          <button type="button" className="btn-secondary text-xs" onClick={() => addPick(p)} disabled={heldSymbols.has(p.symbol)}>
                            Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {subTab === "portfolio" && (
        <>
          {portfolio.holdings.length === 0 ? (
            <div className="card text-center">
              <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                No holdings yet. Add stocks from <strong>Monthly picks</strong> using the Add button.
              </p>
            </div>
          ) : (
            <>
              {evaluation && (
                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    { label: "Invested", value: `₹${evaluation.summary.invested.toLocaleString("en-IN")}` },
                    { label: "Current", value: `₹${evaluation.summary.current_value.toLocaleString("en-IN")}` },
                    {
                      label: "P&L",
                      value: `${evaluation.summary.pnl >= 0 ? "+" : ""}₹${evaluation.summary.pnl.toLocaleString("en-IN")} (${evaluation.summary.pnl_pct}%)`,
                      color: evaluation.summary.pnl >= 0 ? "var(--green)" : "var(--red)",
                    },
                    { label: "Holdings", value: String(evaluation.summary.holdings_count) },
                  ].map((s) => (
                    <div key={s.label} className="card">
                      <p className="field-label !mb-1">{s.label}</p>
                      <p className="font-mono text-lg tabular-nums" style={{ color: s.color || "var(--fg-primary)" }}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {evaluation && evaluation.benchmarks.length > 0 && (
                <div className="card">
                  <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                    vs Benchmark (since first entry)
                  </h3>
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs" style={{ color: "var(--fg-muted)" }}>Your portfolio</p>
                      <p className="font-mono text-xl tabular-nums" style={{ color: evaluation.summary.pnl_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                        {evaluation.summary.pnl_pct >= 0 ? "+" : ""}{evaluation.summary.pnl_pct}%
                      </p>
                    </div>
                    {evaluation.benchmarks.map((b) => (
                      <div key={b.label}>
                        <p className="text-xs" style={{ color: "var(--fg-muted)" }}>{b.label}</p>
                        <p className="font-mono text-xl tabular-nums">{b.return_pct >= 0 ? "+" : ""}{b.return_pct}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] !mb-0">
                    Holdings & signals
                  </h3>
                  <button type="button" className="btn-secondary text-xs text-red-400" onClick={portfolio.clearPortfolio}>
                    Clear all
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>Stock</th>
                        <th>Qty</th>
                        <th>Entry</th>
                        <th>LTP</th>
                        <th>P&L</th>
                        <th>Weight</th>
                        <th>ATR stop</th>
                        <th>Stop dist</th>
                        <th>Signal</th>
                        <th>Score</th>
                        <th>Reason</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(evaluation?.holdings || []).map((h) => (
                        <tr key={h.id}>
                          <td className="font-medium">{h.name}</td>
                          <td className="font-mono tabular-nums">{h.quantity}</td>
                          <td className="font-mono tabular-nums">₹{h.entry_price}</td>
                          <td className="font-mono tabular-nums">₹{h.current_price}</td>
                          <td className="font-mono tabular-nums" style={{ color: h.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                            {h.pnl_pct >= 0 ? "+" : ""}{h.pnl_pct}%
                          </td>
                          <td className="font-mono tabular-nums">{h.weight_pct}%</td>
                          <td className="font-mono tabular-nums" style={{ color: "var(--red)" }}>
                            ₹{h.atr_stop}
                            {h.trailing_stop && (
                              <span className="ml-1 text-[10px]" style={{ color: "var(--accent)" }} title="Trailing stop raised">▲</span>
                            )}
                          </td>
                          <td className="font-mono tabular-nums">{h.stop_distance_pct}%</td>
                          <td><SignalPill signal={h.signal} /></td>
                          <td>
                            <ScoreBar score={h.composite_score} />
                          </td>
                          <td className="table-cell-note" title={h.reasons.join(" · ")}>
                            {h.reasons.join(" · ")}
                          </td>
                          <td>
                            <button type="button" className="text-red-400" onClick={() => portfolio.removeHolding(h.id)} aria-label="Remove">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {dbConfigured && history.length > 0 && (
                <div className="card">
                  <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Portfolio history (Supabase)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="data-table text-xs">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Invested</th>
                          <th>Value</th>
                          <th>P&L</th>
                          <th>Holdings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((row) => (
                          <tr key={row.id}>
                            <td>{new Date(row.snapshot_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                            <td className="font-mono tabular-nums">₹{Number(row.invested).toLocaleString("en-IN")}</td>
                            <td className="font-mono tabular-nums">₹{Number(row.current_value).toLocaleString("en-IN")}</td>
                            <td className="font-mono tabular-nums" style={{ color: row.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                              {row.pnl_pct >= 0 ? "+" : ""}{row.pnl_pct}%
                            </td>
                            <td className="font-mono tabular-nums">{row.holdings_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {dbConfigured === false && (
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  Supabase not configured — portfolio stays in localStorage only. Add env vars and run updated schema.sql for cloud history.
                </p>
              )}

              {evaluation && evaluation.new_buy_ideas.length > 0 && (
                <div className="card">
                  <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                    New buy ideas (not in portfolio)
                  </h3>
                  <ul className="space-y-2 text-sm">
                    {evaluation.new_buy_ideas.map((p) => (
                      <li key={p.symbol} className="flex items-center justify-between gap-2">
                        <span>{p.name} · score {p.composite_score}</span>
                        <button type="button" className="btn-secondary text-xs" onClick={() => addPick(p)}>Add</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}

      {subTab === "backtest" && (
        <>
          {!backtest && !loadingBacktest && (
            <div className="card text-center">
              <p className="text-sm mb-3" style={{ color: "var(--fg-secondary)" }}>
                Walk-forward backtest using {lookbackMonths}-month history, monthly rebalances, and trailing ATR stops.
              </p>
              <button type="button" className="btn-primary" onClick={runBacktest}>Run backtest</button>
            </div>
          )}
          {backtest && !loadingBacktest && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: "Strategy return", value: `${backtest.total_return_pct >= 0 ? "+" : ""}${backtest.total_return_pct}%`, color: backtest.total_return_pct >= 0 ? "var(--green)" : "var(--red)" },
                  { label: "NIFTY 50 (proxy)", value: `${backtest.benchmark_return_pct >= 0 ? "+" : ""}${backtest.benchmark_return_pct}%` },
                  { label: "Max drawdown", value: `-${backtest.max_drawdown_pct}%`, color: "var(--red)" },
                  { label: "Win rate (closed)", value: `${backtest.win_rate_pct}%` },
                ].map((s) => (
                  <div key={s.label} className="card">
                    <p className="field-label !mb-1">{s.label}</p>
                    <p className="font-mono text-lg tabular-nums" style={{ color: s.color || "var(--fg-primary)" }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="card">
                <p className="text-xs mb-3" style={{ color: "var(--fg-muted)" }}>
                  {backtest.start_date} → {backtest.end_date} · {backtest.rebalance_count} rebalances · {backtest.stop_out_count} stop-outs
                </p>
                <p className="text-xs mb-4" style={{ color: "var(--fg-secondary)" }}>{backtest.note}</p>
                <div className="overflow-x-auto">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Portfolio</th>
                        <th>Benchmark</th>
                        <th>Drawdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtest.equity_curve.map((pt) => (
                        <tr key={pt.date}>
                          <td>{pt.date}</td>
                          <td className="font-mono tabular-nums">₹{pt.portfolio_value.toLocaleString("en-IN")}</td>
                          <td className="font-mono tabular-nums">₹{pt.benchmark_value.toLocaleString("en-IN")}</td>
                          <td className="font-mono tabular-nums" style={{ color: pt.drawdown_pct > 5 ? "var(--red)" : undefined }}>
                            -{pt.drawdown_pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
