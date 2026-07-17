"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAPI,
  MarketOverview,
  RiskDashboard,
} from "@/lib/api";
import MarketRegimeBanner from "@/components/MarketRegimeBanner";
import ScanPresets, { type ScanPreset } from "@/components/ScanPresets";
import WatchlistPanel from "@/components/WatchlistPanel";
import {
  SignalBadge,
  Disclaimer,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/Sidebar";
import {
  TrendingUp,
  Layers,
  LineChart,
  BarChart3,
  ArrowRight,
  Activity,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppCache } from "@/components/AppCacheProvider";

const CACHE_KEY = "home";

type HomeCache = {
  overview: MarketOverview;
  risk: RiskDashboard;
};

const MODULES = [
  {
    href: "/equity",
    label: "Equity",
    desc: "Multi-factor analysis, scans, compare",
    icon: TrendingUp,
    color: "var(--green)",
  },
  {
    href: "/options",
    label: "Options",
    desc: "NSE chain, premium selling & directional",
    icon: Layers,
    color: "var(--accent-blue)",
  },
  {
    href: "/futures",
    label: "Futures",
    desc: "Trend + volatility strategies",
    icon: LineChart,
    color: "var(--amber)",
  },
  {
    href: "/dashboard",
    label: "Risk Dashboard",
    desc: "Universe scan summary & opportunities",
    icon: BarChart3,
    color: "var(--accent)",
  },
];

export default function HomePage() {
  const router = useRouter();
  const cache = useAppCache();
  const cached = cache.get<HomeCache>(CACHE_KEY);
  const [overview, setOverview] = useState<MarketOverview | null>(cached?.overview ?? null);
  const [risk, setRisk] = useState<RiskDashboard | null>(cached?.risk ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(!!cached);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ov, rd] = await Promise.all([
        fetchAPI<MarketOverview>("/api/market-overview"),
        fetchAPI<RiskDashboard>("/api/risk-dashboard"),
      ]);
      setOverview(ov);
      setRisk(rd);
      setHasLoaded(true);
      cache.set(CACHE_KEY, { overview: ov, risk: rd });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [cache]);

  useEffect(() => {
    const saved = cache.get<HomeCache>(CACHE_KEY);
    if (saved) {
      setOverview(saved.overview);
      setRisk(saved.risk);
      setHasLoaded(true);
    }
  }, [cache]);

  const runPreset = (preset: ScanPreset) => {
    const q = new URLSearchParams(preset.params);
    q.set("autorun", "1");
    router.push(`/equity?${q.toString()}`);
  };

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Command Center</h1>
          <p className="page-subtitle">
            India market regime, sector pulse, and one-click screeners
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {hasLoaded ? "Refresh" : "Load market data"}
        </button>
      </div>

      <Disclaimer />

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !hasLoaded && !error && (
        <div className="card text-center py-10">
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            Click <strong>Load market data</strong> to fetch regime, sector pulse, and Nifty scan summary.
          </p>
          <button type="button" onClick={load} className="product-action-primary mt-4">
            Load market data
          </button>
        </div>
      )}

      {!loading && hasLoaded && overview && (
        <>
          <MarketRegimeBanner regime={overview.regime} niftyLast={overview.nifty.last} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Nifty", value: overview.nifty.last.toLocaleString("en-IN"), sub: "spot" },
              { label: "Sector avg", value: overview.sector_avg_score, sub: "score / 100" },
              { label: "Nifty Buys", value: risk?.market_summary.buy_signals ?? "—", sub: "Nifty 50 scan" },
              { label: "Watch", value: risk?.market_summary.watch_signals ?? "—", sub: "Nifty 50 scan" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="stat-tile">
                <Activity className="h-5 w-5 shrink-0" style={{ color: "var(--accent-blue)" }} />
                <div>
                  <p className="stat-label">{label}</p>
                  <p className="stat-value font-mono tabular-nums">{value}</p>
                  <p className="text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ href, label, desc, icon: Icon, color }) => (
              <Link key={href} href={href} className="module-tile group">
                <Icon className="h-5 w-5" style={{ color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm" style={{ color: "var(--fg-primary)" }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{desc}</p>
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: "var(--fg-muted)" }}
                />
              </Link>
            ))}
          </div>

          <ScanPresets onRun={runPreset} loading={loading} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Sector pulse
              </h3>
              <div className="table-scroll overflow-x-auto mt-3">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sector</th>
                      <th>Leader</th>
                      <th>Signal</th>
                      <th>Score</th>
                      <th>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.sector_pulse.map((s) => (
                      <tr
                        key={s.sector}
                        className="cursor-pointer"
                        onClick={() => router.push(`/equity?symbol=${encodeURIComponent(s.symbol)}`)}
                      >
                        <td>{s.sector}</td>
                        <td className="font-mono text-xs">{s.symbol.replace(".NS", "")}</td>
                        <td><SignalBadge signal={s.signal} /></td>
                        <td className="font-mono tabular-nums" style={{ color: "var(--accent)" }}>{s.score}</td>
                        <td className="capitalize text-xs" style={{ color: "var(--fg-secondary)" }}>{s.trend}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <WatchlistPanel onSelect={(sym) => router.push(`/equity?symbol=${encodeURIComponent(sym)}`)} />
          </div>

          {risk && risk.top_opportunities.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] !mb-0">
                  Top Nifty opportunities
                </h3>
                <Link href="/dashboard" className="text-xs" style={{ color: "var(--accent-blue)" }}>
                  Full dashboard →
                </Link>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {risk.top_opportunities.slice(0, 6).map((o) => (
                  <Link
                    key={o.symbol}
                    href={`/equity?symbol=${encodeURIComponent(o.symbol)}`}
                    className="preset-tile block"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{o.symbol.replace(".NS", "")}</span>
                      <SignalBadge signal={o.signal} />
                    </div>
                    <p className="mt-1 font-mono text-sm tabular-nums" style={{ color: "var(--accent)" }}>
                      {o.final_score}/100
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
