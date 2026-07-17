"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAPI, RiskDashboard, MarketOverview } from "@/lib/api";
import MarketRegimeBanner from "@/components/MarketRegimeBanner";
import WatchlistPanel from "@/components/WatchlistPanel";
import {
  SignalBadge,
  ScoreBar,
  Disclaimer,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/Sidebar";
import { TrendingUp, Eye, ShieldAlert, BarChart3, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppCache } from "@/components/AppCacheProvider";

const CACHE_KEY = "dashboard";

type DashboardCache = {
  data: RiskDashboard;
  overview: MarketOverview;
};

export default function DashboardPage() {
  const router = useRouter();
  const cache = useAppCache();
  const cached = cache.get<DashboardCache>(CACHE_KEY);
  const [data, setData] = useState<RiskDashboard | null>(cached?.data ?? null);
  const [overview, setOverview] = useState<MarketOverview | null>(cached?.overview ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(!!cached);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [risk, ov] = await Promise.all([
        fetchAPI<RiskDashboard>("/api/risk-dashboard"),
        fetchAPI<MarketOverview>("/api/market-overview"),
      ]);
      setData(risk);
      setOverview(ov);
      setHasLoaded(true);
      cache.set(CACHE_KEY, { data: risk, overview: ov });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [cache]);

  useEffect(() => {
    const saved = cache.get<DashboardCache>(CACHE_KEY);
    if (saved) {
      setData(saved.data);
      setOverview(saved.overview);
      setHasLoaded(true);
    }
  }, [cache]);

  const s = data?.market_summary;
  const regime = data?.index_regime || overview?.regime;
  const regimeBanner = regime
    ? { ...regime, ema50: overview?.regime.ema50, ema200: overview?.regime.ema200 }
    : null;

  const stats = s
    ? [
        { icon: BarChart3, label: "Analyzed", value: s.stocks_analyzed, color: "var(--fg-primary)" },
        { icon: TrendingUp, label: "Buy Signals", value: s.buy_signals, color: "var(--green)" },
        { icon: Eye, label: "Watch", value: s.watch_signals, color: "var(--amber)" },
        { icon: ShieldAlert, label: "Avoid", value: s.avoid_signals, color: "var(--red)" },
        { icon: null, label: "High Risk", value: s.high_risk_count, color: "var(--red)" },
        { icon: null, label: "Avg Score", value: s.average_score, color: "var(--accent)" },
      ]
    : [];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Risk Dashboard</h1>
          <p className="page-subtitle">Market overview and top opportunities</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {hasLoaded ? "Refresh" : "Load dashboard"}
          </button>
          <Link href="/equity?autorun=1&universe=nifty50&recommendation=Buy" className="btn-secondary text-sm">
            Run Buy scan
          </Link>
        </div>
      </div>

      <Disclaimer />

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !hasLoaded && !error && (
        <div className="card text-center py-10">
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            Click <strong>Load dashboard</strong> to run the Nifty 50 risk scan.
          </p>
          <button type="button" onClick={load} className="product-action-primary mt-4">
            Load dashboard
          </button>
        </div>
      )}

      {!loading && hasLoaded && !error && data && s && (
        <>
          {regimeBanner && (
            <MarketRegimeBanner regime={regimeBanner} niftyLast={overview?.nifty.last} compact />
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="stat-tile">
                {Icon && <Icon className="h-5 w-5 shrink-0" style={{ color }} />}
                <div className="min-w-0">
                  <p className="stat-label">{label}</p>
                  <p className="stat-value" style={{ color }}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Top Opportunities
              </h3>
              <div className="space-y-2">
                {data.top_opportunities.map((o) => (
                  <button
                    key={o.symbol}
                    type="button"
                    onClick={() => router.push(`/equity?symbol=${encodeURIComponent(o.symbol)}`)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md p-3 text-left preset-tile"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium" style={{ fontFamily: "var(--font-sans)" }}>
                        {o.symbol.replace(".NS", "")}
                      </p>
                      <p className="max-w-full truncate text-xs" style={{ color: "var(--fg-tertiary)" }}>
                        {o.reason}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <SignalBadge signal={o.signal} />
                      <span className="font-mono tabular-nums text-sm" style={{ color: "var(--accent)" }}>
                        {o.final_score}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <WatchlistPanel
              compact
              onSelect={(sym) => router.push(`/equity?symbol=${encodeURIComponent(sym)}`)}
            />
          </div>

          {overview && (
            <div className="card">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Sector pulse · avg {overview.sector_avg_score}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {overview.sector_pulse.map((sec) => (
                  <button
                    key={sec.sector}
                    type="button"
                    className="preset-tile !inline-flex items-center gap-2 !py-2"
                    onClick={() => router.push(`/equity?symbol=${encodeURIComponent(sec.symbol)}`)}
                  >
                    <span className="text-xs font-medium">{sec.sector}</span>
                    <SignalBadge signal={sec.signal} />
                    <span className="font-mono text-xs tabular-nums" style={{ color: "var(--accent)" }}>
                      {sec.score}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
