"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAPI, type ForumSentiment } from "@/lib/api";
import { useAppCache } from "@/components/AppCacheProvider";
import { ExternalLink, RefreshCw, MessagesSquare } from "lucide-react";

const CACHE_PREFIX = "forum_sentiment_v2_";

function BiasBadge({ bias }: { bias: string }) {
  const cls =
    bias === "bullish" ? "badge-buy" : bias === "bearish" ? "badge-sell" : "badge-watch";
  const label = bias.charAt(0).toUpperCase() + bias.slice(1);
  return <span className={cls}>{label}</span>;
}

function CrowdBar({
  buy,
  sell,
  hold,
}: {
  buy: number;
  sell: number;
  hold: number;
}) {
  const total = Math.max(1, buy + sell + hold);
  const b = (buy / total) * 100;
  const s = (sell / total) * 100;
  const h = (hold / total) * 100;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded" style={{ background: "var(--bg-secondary)" }}>
        <div style={{ width: `${b}%`, background: "var(--green)" }} />
        <div style={{ width: `${h}%`, background: "var(--amber)" }} />
        <div style={{ width: `${s}%`, background: "var(--red)" }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-muted)" }}>
        <span style={{ color: "var(--green)" }}>Bullish {buy}%</span>
        <span style={{ color: "var(--amber)" }}>Unclear {hold}%</span>
        <span style={{ color: "var(--red)" }}>Bearish {sell}%</span>
      </div>
    </div>
  );
}

export default function ForumSentimentPanel({ symbol }: { symbol: string }) {
  const cache = useAppCache();
  const cacheKey = `${CACHE_PREFIX}${symbol}`;
  const [data, setData] = useState<ForumSentiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAPI<ForumSentiment>(
        `/api/forum-sentiment?symbol=${encodeURIComponent(symbol)}`,
      );
      setData(res);
      cache.set(cacheKey, res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forum sentiment unavailable");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, cache, cacheKey]);

  useEffect(() => {
    if (!cache.ready || !symbol) return;
    const saved = cache.get<ForumSentiment>(`${CACHE_PREFIX}${symbol}`);
    if (saved?.company) {
      setData(saved);
      setError("");
      return;
    }
    setData(null);
    void load();
    // load is recreated with cache; we only refetch when the symbol is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache.ready, symbol]);

  const ticker = symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, "");
  if (!symbol || /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|\^)/i.test(ticker)) return null;

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
            Moneycontrol forum
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            <MessagesSquare className="h-4 w-4" />
            What the public thinks
            {data && <span className="ml-1">{data.company}</span>}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {data && <BiasBadge bias={data.overall} />}
          <button
            type="button"
            className="btn-secondary flex items-center gap-1.5 text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          Reading Moneycontrol message board…
        </p>
      )}
      {error && !data && (
        <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          {error}
        </p>
      )}

      {data && (
        <>
          <p className="text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
            {data.overall_label}
          </p>
          <div className="mt-3">
            <p className="field-label !mb-1">
              Recent posts ({data.scored_n} scored) — not Moneycontrol&apos;s sentimeter
            </p>
            <CrowdBar buy={data.crowd.buy_pct} sell={data.crowd.sell_pct} hold={data.crowd.hold_pct} />
          </div>
          <div className="mt-3 grid gap-2 text-xs font-mono sm:grid-cols-3" style={{ color: "var(--fg-muted)" }}>
            <div>Lean {data.language_score}/100 · {data.overall}</div>
            <div>{data.post_count.toLocaleString("en-IN")} lifetime posts</div>
            <div>{data.follower_count != null ? `${data.follower_count.toLocaleString("en-IN")} followers` : "—"}</div>
          </div>
          {data.summary && (
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
              {data.summary}
            </p>
          )}
          {data.sample_posts.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {data.sample_posts.map((p, i) => (
                <li
                  key={`${p.posted_at}-${i}`}
                  className="border-t pt-2 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}
                >
                  <span
                    className="mr-2 font-mono text-[0.625rem] uppercase"
                    style={{
                      color:
                        p.bias === "bullish" ? "var(--green)" : p.bias === "bearish" ? "var(--red)" : "var(--fg-muted)",
                    }}
                  >
                    {p.bias}
                  </span>
                  <span>{p.text}</span>
                  <p className="mt-0.5 font-mono text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
                    {p.user}
                    {p.posted_at ? ` · ${p.posted_at}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
              {data.note}
            </p>
            <a
              href={data.forum_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[0.625rem]"
              style={{ color: "var(--accent)" }}
            >
              Open forum <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
