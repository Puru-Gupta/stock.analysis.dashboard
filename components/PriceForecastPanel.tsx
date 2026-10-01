"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAPI, type PriceForecastResult } from "@/lib/api";
import { LoadingSpinner, ErrorMessage } from "@/components/Sidebar";
import { useAppCache } from "@/components/AppCacheProvider";
import ForecastChart from "@/components/ForecastChart";
import { RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";

const CACHE_KEY = "options_price_forecast";

type ForecastDirection = "up" | "down" | "stagnation";

type ScanRow = {
  symbol: string;
  name: string;
  spot: number;
  alignment_score: number;
  holdout_mape_pct: number;
  direction_accuracy_pct: number;
  forecast_2d_pct: number;
  forecast_5d_pct: number;
  forecast_weekly_pct: number;
  forecast_monthly_pct: number;
  direction_2d: ForecastDirection;
  direction_5d: ForecastDirection;
  direction_weekly: ForecastDirection;
  direction_monthly: ForecastDirection;
  primary_direction: ForecastDirection;
};

type PriceForecastCache = {
  scan: ScanRow[];
  detail: PriceForecastResult | null;
  selected: string | null;
};

function directionLabel(d: ForecastDirection) {
  if (d === "up") return "Up";
  if (d === "down") return "Down";
  return "Stagnation";
}

function DirectionBadge({ direction, pct }: { direction: ForecastDirection; pct?: number }) {
  const cls =
    direction === "up" ? "badge-buy" : direction === "down" ? "badge-sell" : "badge-watch";
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  return (
    <span className={`badge inline-flex items-center gap-1 text-[0.625rem] ${cls}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {directionLabel(direction)}
      {pct != null && (
        <span className="font-mono opacity-90">
          ({pct > 0 ? "+" : ""}
          {pct}%)
        </span>
      )}
    </span>
  );
}

export default function PriceForecastPanel({
  onPickSymbol,
}: {
  onPickSymbol?: (symbol: string) => void;
}) {
  const cache = useAppCache();
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [detail, setDetail] = useState<PriceForecastResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [cacheRestored, setCacheRestored] = useState(false);

  const persist = useCallback(
    (patch: Partial<PriceForecastCache>) => {
      const prev = cache.get<PriceForecastCache>(CACHE_KEY) ?? { scan: [], detail: null, selected: null };
      cache.set(CACHE_KEY, { ...prev, ...patch });
    },
    [cache],
  );

  useEffect(() => {
    if (!cache.ready || cacheRestored) return;
    const saved = cache.get<PriceForecastCache>(CACHE_KEY);
    if (saved) {
      if (saved.scan?.length) setScan(saved.scan);
      if (saved.detail) setDetail(saved.detail);
      if (saved.selected) setSelected(saved.selected);
    }
    setCacheRestored(true);
  }, [cache, cacheRestored]);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAPI<{ scan: boolean; picks: ScanRow[] }>("/api/options/price-forecast?scan=1&limit=50");
      setScan(res.picks);
      setDetail(null);
      setSelected(null);
      persist({ scan: res.picks, detail: null, selected: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [persist]);

  const loadDetail = useCallback(async (symbol: string) => {
    setSelected(symbol);
    setLoadingDetail(true);
    setError("");
    try {
      const f = await fetchAPI<PriceForecastResult>(
        `/api/options/price-forecast?symbol=${encodeURIComponent(symbol)}`,
      );
      setDetail(f);
      persist({ detail: f, selected: symbol });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detail failed");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [persist]);

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium" style={{ color: "var(--fg-primary)" }}>
            ML Price Forecast (Nifty 50)
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
            <strong>Models used:</strong> Drift (momentum), EMA trend, Mean reversion, Linear log-trend, Exp.
            smoothing — blended by inverse holdout MAPE after <strong>70% train / 30% holdout</strong>. Each horizon
            shows <strong>Up</strong>, <strong>Down</strong>, or <strong>Stagnation</strong> (±0.35% band).
          </p>
        </div>
        <button type="button" className="btn-secondary flex items-center gap-2 text-xs" onClick={runScan} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Run forecast scan
        </button>
      </div>

      <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
        Not FM-3 / Moirai / iTransformer (those need a GPU Python worker). This tab is a cross-checked statistical
        ensemble with the same 70/30 discipline.
      </p>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && scan.length === 0 && !error && (
        <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          Click <strong>Run forecast scan</strong> to rank Nifty 50 by model alignment (~2–3 min).
        </p>
      )}

      {scan.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Stock</th>
                <th>Alignment</th>
                <th>5d view</th>
                <th>Holdout MAPE</th>
                <th>Dir. acc.</th>
                <th>2d</th>
                <th>5d</th>
                <th>Week</th>
                <th>Month</th>
              </tr>
            </thead>
            <tbody>
              {scan.map((r, i) => (
                <tr
                  key={r.symbol}
                  className="cursor-pointer"
                  onClick={() => loadDetail(r.symbol)}
                  style={{ background: selected === r.symbol ? "var(--bg-secondary)" : undefined }}
                >
                  <td className="font-mono text-xs">{i + 1}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="font-mono" style={{ color: r.alignment_score >= 65 ? "var(--green)" : undefined }}>
                    {r.alignment_score}
                  </td>
                  <td>
                    <DirectionBadge direction={r.primary_direction} pct={r.forecast_5d_pct} />
                  </td>
                  <td className="font-mono text-xs">{r.holdout_mape_pct}%</td>
                  <td className="font-mono text-xs">{r.direction_accuracy_pct}%</td>
                  <td>
                    <DirectionBadge direction={r.direction_2d} pct={r.forecast_2d_pct} />
                  </td>
                  <td>
                    <DirectionBadge direction={r.direction_5d} pct={r.forecast_5d_pct} />
                  </td>
                  <td>
                    <DirectionBadge direction={r.direction_weekly} pct={r.forecast_weekly_pct} />
                  </td>
                  <td>
                    <DirectionBadge direction={r.direction_monthly} pct={r.forecast_monthly_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
            Higher <strong>Alignment</strong> = ensemble tracked holdout better (trust signal, not a profit guarantee).
            Click a row for chart + per-model breakdown.
          </p>
        </div>
      )}

      {loadingDetail && <LoadingSpinner />}

      {detail && !loadingDetail && (
        <div className="card">
          <div className="flex flex-wrap justify-between gap-2 mb-3">
            <h3 className="font-medium">{detail.name} · ₹{detail.spot}</h3>
            <span className="font-mono text-sm">Alignment {detail.alignment_score}/100</span>
          </div>
          <ForecastChart history={detail.history} forecast={detail.forecast_path} />
          <div className="grid gap-2 sm:grid-cols-4 mt-4 text-xs">
            {detail.horizons.map((h) => (
              <div key={h.days} className="rounded p-2" style={{ background: "var(--bg-secondary)" }}>
                <p style={{ color: "var(--fg-muted)" }}>{h.label}</p>
                <p className="text-base font-mono">₹{h.predicted_close}</p>
                <div className="mt-1">
                  <DirectionBadge direction={h.direction} pct={h.change_pct} />
                </div>
                <p className="mt-1 font-mono" style={{ color: "var(--fg-muted)" }}>
                  band ₹{h.band_low}–{h.band_high}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium mb-2">Model cross-check (30% holdout)</p>
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>MAPE</th>
                  <th>Direction</th>
                  <th>Blend weight</th>
                </tr>
              </thead>
              <tbody>
                {detail.models.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="font-mono">{m.holdout_mape_pct}%</td>
                    <td className="font-mono">{m.direction_accuracy_pct}%</td>
                    <td className="font-mono">{m.blend_weight_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[0.625rem] mt-3" style={{ color: "var(--fg-muted)" }}>
            {detail.ensemble_method}. Models: {detail.models_used?.join(" · ") ?? "—"}
          </p>
          <p className="text-[0.625rem] mt-1" style={{ color: "var(--fg-muted)" }}>{detail.method_note}</p>
          {onPickSymbol && (
            <button type="button" className="btn-secondary text-xs mt-3" onClick={() => onPickSymbol(detail.symbol)}>
              Open options analysis
            </button>
          )}
        </div>
      )}
    </div>
  );
}
