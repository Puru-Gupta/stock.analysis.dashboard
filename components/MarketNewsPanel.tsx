"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI, MarketNewsItem, MarketNewsResult } from "@/lib/api";
import { ErrorMessage, LoadingSpinner } from "@/components/Sidebar";
import { AlertTriangle, Globe, Newspaper, RefreshCw, TrendingUp } from "lucide-react";

type ImportanceFilter = "all" | "very_important" | "important" | "less_important";

function timeAgo(pubDate: string) {
  if (!pubDate) return "";
  const ms = Date.now() - Date.parse(pubDate);
  if (Number.isNaN(ms)) return pubDate;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ImportanceBadge({ importance }: { importance: MarketNewsItem["importance"] }) {
  if (importance === "very_important") {
    return <span className="badge-sell">Very Important</span>;
  }
  if (importance === "important") {
    return <span className="badge-watch">Important</span>;
  }
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide"
      style={{ background: "var(--bg-secondary)", color: "var(--fg-muted)" }}
    >
      Less Important
    </span>
  );
}

function SummaryCard({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: "critical" | "watch" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  const border =
    tone === "critical" ? "var(--red)" : tone === "watch" ? "var(--amber)" : "var(--border)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="card text-left transition-opacity hover:opacity-90"
      style={{
        borderColor: active ? border : undefined,
        boxShadow: active ? `0 0 0 1px ${border}` : undefined,
      }}
    >
      <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-mono tabular-nums"
        style={{
          color: tone === "critical" ? "var(--red)" : tone === "watch" ? "var(--amber)" : "var(--fg-primary)",
        }}
      >
        {count}
      </p>
    </button>
  );
}

export default function MarketNewsPanel() {
  const [data, setData] = useState<MarketNewsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ImportanceFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAPI<MarketNewsResult>("/api/options/market-news");
      setData(result);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load market news");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map((i) => i.category_label))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item) => {
      if (filter !== "all" && item.importance !== filter) return false;
      if (categoryFilter !== "all" && item.category_label !== categoryFilter) return false;
      return true;
    });
  }, [data, filter, categoryFilter]);

  const grouped = useMemo(() => {
    const order: MarketNewsItem["importance"][] = ["very_important", "important", "less_important"];
    if (filter !== "all") return [{ tier: filter, items: filtered }];
    return order
      .map((tier) => ({
        tier,
        items: filtered.filter((i) => i.importance === tier),
      }))
      .filter((g) => g.items.length > 0);
  }, [filtered, filter]);

  const tierLabel = (tier: MarketNewsItem["importance"]) => {
    if (tier === "very_important") return "Very Important — act on these first";
    if (tier === "important") return "Important — monitor for premium & strike risk";
    return "Less Important — background noise";
  };

  return (
    <div className="page-stack">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-1">
              Market News Radar
            </h3>
            <p className="text-xs max-w-2xl" style={{ color: "var(--fg-tertiary)" }}>
              India &amp; global headlines deduplicated by story — one entry per event (GDP, RBI, auto sales, etc.)
              with expert read on market impact and what it means for option sellers.
            </p>
          </div>
          <button type="button" onClick={load} className="btn-secondary flex items-center gap-2 text-xs shrink-0">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {data && (
          <p className="text-[0.625rem] font-mono mb-4" style={{ color: "var(--fg-muted)" }}>
            Updated {new Date(data.analyzed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST ·{" "}
            {data.unique_stories ?? data.items.length} unique stories
            {data.headlines_fetched != null ? ` from ${data.headlines_fetched} headlines` : ""}
          </p>
        )}

        {data && (
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <SummaryCard
              label="Very Important"
              count={data.counts.very_important}
              tone="critical"
              active={filter === "very_important"}
              onClick={() => setFilter(filter === "very_important" ? "all" : "very_important")}
            />
            <SummaryCard
              label="Important"
              count={data.counts.important}
              tone="watch"
              active={filter === "important"}
              onClick={() => setFilter(filter === "important" ? "all" : "important")}
            />
            <SummaryCard
              label="Less Important"
              count={data.counts.less_important}
              tone="muted"
              active={filter === "less_important"}
              onClick={() => setFilter(filter === "less_important" ? "all" : "less_important")}
            />
          </div>
        )}

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`pill text-[0.625rem] ${categoryFilter === "all" ? "pill-active" : ""}`}
              onClick={() => setCategoryFilter("all")}
            >
              All topics
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`pill text-[0.625rem] ${categoryFilter === c ? "pill-active" : ""}`}
                onClick={() => setCategoryFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && !data && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {data && !loading && filtered.length === 0 && (
        <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          No headlines match this filter — try &quot;All topics&quot; or refresh.
        </p>
      )}

      {grouped.map(({ tier, items }) => (
        <div key={tier} className="card">
          <div className="flex items-center gap-2 mb-3">
            {tier === "very_important" ? (
              <AlertTriangle className="h-4 w-4 text-[var(--red)]" />
            ) : tier === "important" ? (
              <TrendingUp className="h-4 w-4 text-[var(--amber)]" />
            ) : (
              <Newspaper className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
            )}
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              {tierLabel(tier)}
            </h3>
            <span className="text-xs font-mono" style={{ color: "var(--fg-muted)" }}>
              ({items.length})
            </span>
          </div>

          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.story_key}
                className="rounded-lg border border-[var(--border)] p-3"
                style={{ background: tier === "very_important" ? "rgba(239,68,68,0.04)" : undefined }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <ImportanceBadge importance={item.importance} />
                  <span
                    className="text-[0.625rem] rounded px-1.5 py-0.5"
                    style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)" }}
                  >
                    {item.category_label}
                  </span>
                  {item.related_count > 1 && (
                    <span
                      className="text-[0.625rem] rounded px-1.5 py-0.5"
                      style={{ background: "rgba(245,78,0,0.1)", color: "var(--accent)" }}
                    >
                      {item.related_count} outlets reporting
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
                    {item.region === "global" ? <Globe className="h-3 w-3" /> : null}
                    {item.region === "india" ? "India" : "Global"}
                  </span>
                  {item.pubDate && (
                    <span className="text-[0.625rem] font-mono ml-auto" style={{ color: "var(--fg-muted)" }}>
                      {timeAgo(item.pubDate)}
                    </span>
                  )}
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline leading-snug block"
                  style={{ color: "var(--fg-primary)" }}
                >
                  {item.title}
                </a>
                <p className="mt-1.5 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                  <strong style={{ color: "var(--fg-secondary)" }}>Why it matters:</strong> {item.reason}
                </p>
                {item.market_impact && (
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                    <strong style={{ color: "var(--fg-primary)" }}>Market impact:</strong> {item.market_impact}
                  </p>
                )}
                {item.seller_action && (
                  <p
                    className="mt-1.5 text-xs leading-relaxed rounded px-2 py-1.5"
                    style={{ color: "var(--fg-secondary)", background: "var(--bg-secondary)" }}
                  >
                    <strong style={{ color: "var(--amber)" }}>For option sellers:</strong> {item.seller_action}
                  </p>
                )}
                {item.related_sources.length > 1 && (
                  <p className="mt-1.5 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
                    Also reported by: {item.related_sources.slice(1).join(" · ")}
                  </p>
                )}
                {(item.source || item.pubDate) && (
                  <p className="mt-1 text-[0.625rem] font-mono" style={{ color: "var(--fg-muted)" }}>
                    {item.source}
                    {item.source && item.pubDate ? " · " : ""}
                    {item.pubDate ? new Date(item.pubDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
        Stories are clustered so the same event (e.g. RBI MPC, GDP print) appears once. Market impact commentary is
        rule-based expert guidance for Indian F&amp;O — verify headlines and price action before trading. Not investment
        advice.
      </p>
    </div>
  );
}
