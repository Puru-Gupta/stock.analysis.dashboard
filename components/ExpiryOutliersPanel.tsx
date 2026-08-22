"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI, ExpiryOutliersResult, ExpiryNewsItem, ExpiryWeekRow } from "@/lib/api";
import { FNO_INDICES, stockOptions } from "@/lib/data/expiry-outliers-universe";
import { eventCategoryColor } from "@/lib/data/market-events";
import { ErrorMessage, LoadingSpinner } from "@/components/Sidebar";
import { CheckCircle2, RefreshCw, Search, TrendingDown, TrendingUp, XCircle } from "lucide-react";

const STOCKS = stockOptions();

const EVENT_KEYWORDS: Record<string, string> = {
  budget: "India Union Budget stock market",
  rbi: "RBI MPC repo rate India",
  election: "India election stock market",
  geopolitical: "global markets India crash",
  policy: "NSE SEBI India markets",
};

function OutlierScatter({
  data,
  selectedWeek,
  onSelectWeek,
}: {
  data: ExpiryOutliersResult;
  selectedWeek: string;
  onSelectWeek: (endDate: string) => void;
}) {
  const { rows, lower_boundary_pct, upper_boundary_pct } = data;
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => a.end_date.localeCompare(b.end_date));
  const w = 900;
  const h = 360;
  const pad = { l: 48, r: 16, t: 28, b: 44 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const yMin = Math.min(lower_boundary_pct - 1, ...sorted.map((r) => r.return_pct)) - 0.5;
  const yMax = Math.max(upper_boundary_pct + 1, ...sorted.map((r) => r.return_pct)) + 0.5;
  const yScale = (v: number) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const xScale = (i: number) => pad.l + (i / Math.max(sorted.length - 1, 1)) * innerW;

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => yMin + ((yMax - yMin) * i) / (yTicks - 1));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[640px]" style={{ maxHeight: 400 }}>
        {sorted.map((r, i) => {
          if (!r.events.length) return null;
          const x0 = i === 0 ? pad.l : (xScale(i - 1) + xScale(i)) / 2;
          const x1 = i === sorted.length - 1 ? w - pad.r : (xScale(i) + xScale(i + 1)) / 2;
          const cat = r.events[0].category as Parameters<typeof eventCategoryColor>[0];
          return (
            <rect
              key={`band-${r.end_date}`}
              x={x0}
              y={pad.t}
              width={Math.max(x1 - x0, 4)}
              height={innerH}
              fill={eventCategoryColor(cat)}
              opacity={0.07}
            />
          );
        })}

        {yTickVals.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={yScale(v)}
              y2={yScale(v)}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <text x={pad.l - 6} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="var(--fg-muted)">
              {v.toFixed(1)}%
            </text>
          </g>
        ))}

        <line
          x1={pad.l}
          x2={w - pad.r}
          y1={yScale(upper_boundary_pct)}
          y2={yScale(upper_boundary_pct)}
          stroke="var(--green)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <line
          x1={pad.l}
          x2={w - pad.r}
          y1={yScale(lower_boundary_pct)}
          y2={yScale(lower_boundary_pct)}
          stroke="var(--red)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />

        {sorted.map((r, i) => {
          const cx = xScale(i);
          const cy = yScale(r.return_pct);
          const fill =
            r.status === "upside_outlier"
              ? "var(--green)"
              : r.status === "downside_outlier"
                ? "var(--red)"
                : "var(--fg-muted)";
          const hasEvent = r.events.length > 0;
          return (
            <g key={r.end_date}>
              {hasEvent && (
                <polygon
                  points={`${cx},${pad.t + 4} ${cx - 4},${pad.t + 12} ${cx + 4},${pad.t + 12}`}
                  fill={eventCategoryColor(r.events[0].category as Parameters<typeof eventCategoryColor>[0])}
                  opacity={0.85}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={r.status === "within" ? 3 : 5}
                fill={fill}
                opacity={selectedWeek === r.end_date ? 1 : r.status === "within" ? 0.45 : 0.9}
                stroke={selectedWeek === r.end_date ? "var(--accent)" : "none"}
                strokeWidth={2}
                className="cursor-pointer"
                onClick={() => onSelectWeek(r.end_date)}
              >
                <title>
                  {`${r.end_date}: ${r.return_pct}% | MFE ${r.mfe_pct}% MAE ${r.mae_pct}% | ±1σ ${r.sigma_move_pct}%${r.events.length ? ` | ${r.events.map((e) => e.label).join(", ")}` : ""}`}
                </title>
              </circle>
            </g>
          );
        })}

        <text x={w - pad.r} y={yScale(upper_boundary_pct) - 6} textAnchor="end" fontSize="10" fill="var(--green)">
          Upper {upper_boundary_pct}%
        </text>
        <text x={w - pad.r} y={yScale(lower_boundary_pct) + 14} textAnchor="end" fontSize="10" fill="var(--red)">
          Lower {lower_boundary_pct}%
        </text>
      </svg>

      <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: "var(--fg-tertiary)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--fg-muted)", opacity: 0.5 }} />
          Within boundary
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--green)]" />
          Upside outlier
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--red)]" />
          Downside outlier
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-3 border-t-2 border-dashed" style={{ borderColor: "#f59e0b" }} />
          Event week (shaded)
        </span>
      </div>
    </div>
  );
}

function WeekDetail({ row }: { row: ExpiryWeekRow | undefined }) {
  if (!row) return null;
  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-xs" style={{ background: "var(--bg-secondary)" }}>
      <p className="font-medium mb-2" style={{ color: "var(--fg-primary)" }}>
        {row.start_date} → {row.end_date}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span style={{ color: "var(--fg-muted)" }}>Return (O-C)</span>
          <p className="font-mono tabular-nums" style={{ color: row.return_pct >= 0 ? "var(--green)" : "var(--red)" }}>
            {row.return_pct > 0 ? "+" : ""}
            {row.return_pct}%
          </p>
        </div>
        <div>
          <span style={{ color: "var(--fg-muted)" }}>MFE (max rally)</span>
          <p className="font-mono tabular-nums text-[var(--green)]">+{row.mfe_pct}%</p>
        </div>
        <div>
          <span style={{ color: "var(--fg-muted)" }}>MAE (max dip)</span>
          <p className="font-mono tabular-nums text-[var(--red)]">{row.mae_pct}%</p>
        </div>
        <div>
          <span style={{ color: "var(--fg-muted)" }}>±1σ strangle</span>
          <p className="flex items-center gap-1 font-mono tabular-nums">
            {row.strangle_survived ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--green)]" />
                Survived ({row.sigma_move_pct}%)
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-[var(--red)]" />
                Breached ({row.sigma_move_pct}%)
              </>
            )}
          </p>
        </div>
      </div>
      {row.events.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.events.map((e) => (
            <span
              key={e.label}
              className="rounded px-1.5 py-0.5 text-[0.625rem]"
              style={{
                background: `${eventCategoryColor(e.category as Parameters<typeof eventCategoryColor>[0])}22`,
                color: eventCategoryColor(e.category as Parameters<typeof eventCategoryColor>[0]),
              }}
            >
              {e.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExpiryOutliersPanel() {
  const today = new Date().toISOString().split("T")[0];
  const [universe, setUniverse] = useState<"index" | "stock">("index");
  const [indexId, setIndexId] = useState("nifty50");
  const [stockSym, setStockSym] = useState("RELIANCE.NS");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [returnMode, setReturnMode] = useState<"oc" | "hl">("oc");
  const [startDate, setStartDate] = useState("2021-01-01");
  const [endDate, setEndDate] = useState(today);
  const [coverage, setCoverage] = useState(90);
  const [keywords, setKeywords] = useState("India stock market RBI budget");

  const [data, setData] = useState<ExpiryOutliersResult | null>(null);
  const [news, setNews] = useState<ExpiryNewsItem[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [error, setError] = useState("");

  const indexMeta = FNO_INDICES.find((x) => x.id === indexId) || FNO_INDICES[0];
  const activeSymbol = universe === "index" ? indexMeta.symbol : stockSym;
  const activeLabel = universe === "index" ? indexMeta.label : stockSym.replace(".NS", "");

  const outlierRows = useMemo(
    () => (data?.rows.filter((r) => r.status !== "within") ?? []).slice(0, 30),
    [data],
  );

  const selectedRow = useMemo(
    () => data?.rows.find((r) => r.end_date === selectedWeek),
    [data, selectedWeek],
  );

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        symbol: activeSymbol,
        label: activeLabel,
        universe,
        cadence,
        return_mode: returnMode,
        start_date: startDate,
        end_date: endDate,
        coverage_pct: String(coverage),
      });
      const result = await fetchAPI<ExpiryOutliersResult>(`/api/options/expiry-outliers?${q}`);
      setData(result);
      const firstOutlier = result.rows.find((r) => r.status !== "within");
      setSelectedWeek(firstOutlier?.end_date || result.rows[0]?.end_date || "");
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [activeSymbol, activeLabel, universe, cadence, returnMode, startDate, endDate, coverage]);

  const loadNews = useCallback(async () => {
    if (!selectedWeek) return;
    setNewsLoading(true);
    try {
      const row = data?.rows.find((r) => r.end_date === selectedWeek);
      const from = row?.start_date || selectedWeek;
      const to = row?.end_date || selectedWeek;
      const eventKw = row?.events[0]?.category ? EVENT_KEYWORDS[row.events[0].category] : "";
      const q = new URLSearchParams({ q: eventKw || keywords, from, to });
      const res = await fetchAPI<{ items: ExpiryNewsItem[] }>(`/api/options/expiry-outliers/news?${q}`);
      setNews(res.items || []);
    } catch {
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  }, [selectedWeek, keywords, data]);

  useEffect(() => {
    setCadence(universe === "index" ? "weekly" : "monthly");
  }, [universe]);

  useEffect(() => {
    loadAnalysis();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initial load only

  useEffect(() => {
    if (selectedWeek) loadNews();
  }, [selectedWeek, loadNews]);

  const expiryDayLabel =
    data?.expiry_day === "mixed"
      ? "Thu → Tue (Sep 2024)"
      : data?.expiry_day === "tuesday"
        ? "Tuesday"
        : "Thursday";

  return (
    <div className="page-stack">
      <div className="card">
        <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-1">
          Expiry Outliers &amp; Event Context
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>
          Survivability for option sellers: expiry-window returns vs historical bands, MAE/MFE excursion,
          ±1σ strangle survival, and macro event overlays (Budget, RBI, elections).
        </p>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="product-label">Universe</p>
            <div className="pill-group" role="group">
              {(
                [
                  { value: "index", label: "Indices" },
                  { value: "stock", label: "F&O Stocks" },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`pill ${universe === value ? "pill-active" : ""}`}
                  onClick={() => setUniverse(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="product-label">{universe === "index" ? "Index" : "Stock"}</p>
            {universe === "index" ? (
              <select className="input-field w-full" value={indexId} onChange={(e) => setIndexId(e.target.value)}>
                {FNO_INDICES.map((idx) => (
                  <option key={idx.id} value={idx.id}>
                    {idx.label}
                  </option>
                ))}
              </select>
            ) : (
              <select className="input-field w-full" value={stockSym} onChange={(e) => setStockSym(e.target.value)}>
                {STOCKS.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <p className="product-label">Analysis period</p>
            <div className="pill-group" role="group">
              {(
                [
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`pill ${cadence === value ? "pill-active" : ""}`}
                  onClick={() => setCadence(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="product-label">Calculation</p>
            <div className="pill-group" role="group">
              {(
                [
                  { value: "oc", label: "O-C (Open→Close)" },
                  { value: "hl", label: "H-L (Range %)" },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`pill ${returnMode === value ? "pill-active" : ""}`}
                  onClick={() => setReturnMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="product-label">Start date</p>
            <input type="date" className="input-field w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <p className="product-label">End date</p>
            <input type="date" className="input-field w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <p className="product-label">Probability boundary coverage ({coverage}%)</p>
            <input
              type="range"
              min={80}
              max={98}
              step={1}
              value={coverage}
              onChange={(e) => setCoverage(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-[0.625rem] mt-1" style={{ color: "var(--fg-muted)" }}>
              Tail {(100 - coverage) / 2}% each side →{" "}
              {data ? `${data.lower_percentile}th / ${data.upper_percentile}th` : "—"} percentile bands
            </p>
          </div>
          <button type="button" onClick={loadAnalysis} className="btn-secondary flex items-center gap-2 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Run analysis
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {data && !loading && (
        <>
          {data.note && (
            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
              {data.note} Expiry day: <strong>{expiryDayLabel}</strong>.
            </p>
          )}

          <div className="card">
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
              Outliers distribution — {data.label} ({data.return_mode === "oc" ? "Open→Close" : "High-Low range"})
            </h3>
            <OutlierScatter data={data} selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} />
            <WeekDetail row={selectedRow} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Total expiries", value: data.total_expiries },
              { label: "Outliers", value: `${data.total_outliers} (${data.outlier_rate_pct}%)` },
              {
                label: "Downside outliers",
                value: data.downside_outliers,
                icon: <TrendingDown className="h-4 w-4 text-[var(--red)]" />,
              },
              {
                label: "Upside outliers",
                value: data.upside_outliers,
                icon: <TrendingUp className="h-4 w-4 text-[var(--green)]" />,
              },
              { label: "±1σ strangle survived", value: `${data.strangle_survival_rate_pct}%` },
              { label: "Avg MFE / MAE", value: `+${data.avg_mfe_pct}% / ${data.avg_mae_pct}%` },
            ].map((s) => (
              <div key={s.label} className="card py-3 px-4">
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  {s.label}
                </p>
                <p className="mt-1 flex items-center gap-2 text-lg font-mono tabular-nums">
                  {s.icon}
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
                Outlier expiries
              </h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="data-table text-xs">
                  <thead>
                    <tr>
                      <th>End</th>
                      <th>Return</th>
                      <th>MFE</th>
                      <th>MAE</th>
                      <th>±1σ</th>
                      <th>Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlierRows.map((r) => (
                      <tr
                        key={r.end_date}
                        className="cursor-pointer"
                        onClick={() => setSelectedWeek(r.end_date)}
                        style={{
                          background: selectedWeek === r.end_date ? "rgba(245,78,0,0.08)" : undefined,
                        }}
                      >
                        <td>{r.end_date}</td>
                        <td
                          className="font-mono tabular-nums"
                          style={{ color: r.return_pct >= 0 ? "var(--green)" : "var(--red)" }}
                        >
                          {r.return_pct > 0 ? "+" : ""}
                          {r.return_pct}%
                        </td>
                        <td className="font-mono tabular-nums text-[var(--green)]">+{r.mfe_pct}%</td>
                        <td className="font-mono tabular-nums text-[var(--red)]">{r.mae_pct}%</td>
                        <td>
                          {r.strangle_survived ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--green)]" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-[var(--red)]" />
                          )}
                        </td>
                        <td className="max-w-[120px] truncate" title={r.events.map((e) => e.label).join(", ")}>
                          {r.events[0]?.label || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
                News &amp; events (expiry week)
              </h3>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="product-label">Select expiry week</p>
                  <select
                    className="input-field w-full text-xs"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                  >
                    {[...data.rows]
                      .sort((a, b) => b.end_date.localeCompare(a.end_date))
                      .map((r) => (
                        <option key={r.end_date} value={r.end_date}>
                          {r.end_date} ({r.return_pct}%)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <p className="product-label">Search keywords</p>
                  <div className="flex gap-2">
                    <input
                      className="input-field flex-1 text-xs"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="RBI, budget, war, election…"
                    />
                    <button type="button" onClick={loadNews} className="btn-secondary px-3">
                      <Search className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(EVENT_KEYWORDS).map(([cat, kw]) => (
                      <button
                        key={cat}
                        type="button"
                        className="text-[0.625rem] rounded px-1.5 py-0.5 border border-[var(--border)]"
                        onClick={() => setKeywords(kw)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {newsLoading ? (
                <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                  Fetching headlines…
                </p>
              ) : news.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                  No headlines for this window — try broader keywords or another week.
                </p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {news.map((n, i) => (
                    <li key={`${n.link}-${i}`} className="text-xs border-b border-[var(--border)] pb-2">
                      <a
                        href={n.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                        style={{ color: "var(--fg-primary)" }}
                      >
                        {n.title}
                      </a>
                      {n.pubDate && (
                        <p className="mt-0.5 font-mono text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
                          {n.pubDate}
                          {n.source ? ` · ${n.source}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
