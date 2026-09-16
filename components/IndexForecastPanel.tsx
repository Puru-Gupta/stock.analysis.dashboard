"use client";

import { useCallback, useState } from "react";
import { fetchAPI, type IndexForecastBundle, type IndexForecastRow } from "@/lib/api";
import { LoadingSpinner, ErrorMessage } from "@/components/Sidebar";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

function BiasBadge({ bias }: { bias: string }) {
  const cls =
    bias === "bullish" ? "badge-buy" : bias === "bearish" ? "badge-sell" : "badge-watch";
  const Icon = bias === "bullish" ? TrendingUp : bias === "bearish" ? TrendingDown : Minus;
  return (
    <span className={`${cls} inline-flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {bias.charAt(0).toUpperCase() + bias.slice(1)}
    </span>
  );
}

function IndexCard({
  row,
  onAnalyze,
}: {
  row: IndexForecastRow;
  onAnalyze?: (symbol: string) => void;
}) {
  return (
    <div className="card" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-medium" style={{ color: "var(--fg-primary)" }}>{row.label}</h3>
          <p className="font-mono text-sm tabular-nums mt-0.5" style={{ color: "var(--fg-secondary)" }}>
            {row.spot.toLocaleString("en-IN")}
            {row.change_pct != null && (
              <span style={{ color: row.change_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                {" "}
                {row.change_pct >= 0 ? "+" : ""}
                {row.change_pct}%
              </span>
            )}
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="field-label !mb-1">Daily forecast</p>
          <BiasBadge bias={row.daily_forecast} />
          <p className="mt-2 font-mono tabular-nums" style={{ color: "var(--fg-muted)" }}>
            {row.confidence}% conf · score {row.composite_score}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs font-mono mb-3">
        <div>
          <span style={{ color: "var(--fg-muted)" }}>Weekly</span>
          <div className="mt-0.5 capitalize">{row.weekly_forecast}</div>
        </div>
        <div>
          <span style={{ color: "var(--fg-muted)" }}>Technical</span>
          <div className="mt-0.5">{row.technical_score} · {row.technical_trend} · RSI {row.rsi}</div>
        </div>
        <div>
          <span style={{ color: "var(--fg-muted)" }}>Sentiment</span>
          <div className="mt-0.5">{row.sentiment_score} · {row.sentiment_bias}</div>
        </div>
        <div>
          <span style={{ color: "var(--fg-muted)" }}>Chain</span>
          <div className="mt-0.5">
            PCR {row.pcr_oi ?? "—"}
            {row.max_pain != null && ` · MP ${row.max_pain}`}
          </div>
        </div>
      </div>

      <div
        className="rounded-md p-3 mb-3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--fg-muted)" }}>
          Option strategy
        </p>
        <p className="text-sm font-medium" style={{ color: "var(--green)" }}>
          {row.recommended_strategy}
          {row.strategy_side !== "na" && (
            <span className="ml-2 text-xs font-mono uppercase" style={{ color: "var(--fg-muted)" }}>
              {row.strategy_side === "both" ? "CE + PE" : `${row.strategy_side} side`}
            </span>
          )}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--fg-secondary)" }}>{row.option_play}</p>
        <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{row.strategy_note}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        <div>
          <p className="font-medium mb-1" style={{ color: "var(--fg-primary)" }}>Drivers</p>
          <ul className="space-y-1" style={{ color: "var(--fg-secondary)" }}>
            {row.drivers.slice(0, 4).map((d) => (
              <li key={d}>· {d}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium mb-1" style={{ color: "var(--amber)" }}>Risks</p>
          <ul className="space-y-1" style={{ color: "var(--fg-secondary)" }}>
            {row.risks.slice(0, 3).map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      </div>

      {row.sentiment_headlines.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--fg-muted)" }}>
            News / Reddit / portals
          </p>
          <ul className="space-y-1 text-xs" style={{ color: "var(--fg-secondary)" }}>
            {row.sentiment_headlines.map((h) => (
              <li key={h.title} className="flex gap-2">
                <span
                  className="shrink-0 uppercase font-mono text-[0.625rem]"
                  style={{
                    color:
                      h.bias === "bullish" ? "var(--green)" : h.bias === "bearish" ? "var(--red)" : "var(--fg-muted)",
                  }}
                >
                  {h.channel}
                </span>
                <span className="line-clamp-2">{h.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onAnalyze && (
        <button
          type="button"
          className="btn-secondary text-xs mt-3"
          onClick={() => onAnalyze(row.symbol)}
        >
          Open full options analysis
        </button>
      )}
    </div>
  );
}

export default function IndexForecastPanel({
  onAnalyzeIndex,
}: {
  onAnalyzeIndex?: (symbol: string) => void;
}) {
  const [data, setData] = useState<IndexForecastBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAPI<IndexForecastBundle>("/api/options/index-forecast");
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load index forecast");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium" style={{ color: "var(--fg-primary)" }}>
            Index Outlook — Daily Forecast
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
            Nifty, Bank Nifty, Fin Nifty &amp; Midcap Nifty — blended from technicals, India VIX, option chain PCR/skew,
            and news/Reddit/portal sentiment.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !data && !error && (
        <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          Click <strong>Refresh</strong> to load today&apos;s index forecast (Nifty, Bank Nifty, Fin Nifty, Midcap Nifty).
        </p>
      )}

      {data && (
        <>
          <div
            className="card"
            style={{
              borderColor:
                data.market_summary.daily_bias === "bullish"
                  ? "rgba(31,138,101,0.35)"
                  : data.market_summary.daily_bias === "bearish"
                    ? "rgba(220,38,38,0.35)"
                    : "var(--border)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
                  Market summary
                </p>
                <p className="text-lg font-medium mt-1" style={{ color: "var(--fg-primary)" }}>
                  {data.market_summary.label}
                </p>
                <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
                  {data.market_summary.detail}
                </p>
              </div>
              <BiasBadge bias={data.market_summary.daily_bias} />
            </div>
            <p className="text-[0.625rem] mt-2 font-mono" style={{ color: "var(--fg-muted)" }}>
              Updated {new Date(data.analyzed_at).toLocaleString("en-IN")}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.indices.map((row) => (
              <IndexCard key={row.id} row={row} onAnalyze={onAnalyzeIndex} />
            ))}
          </div>

          <p className="text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
            Forecast blends technical score (32%), headline/social sentiment (28%), index regime (18%), India VIX (12%),
            and PCR (10%). Daily = today&apos;s bias; weekly = slower trend overlay. Not financial advice — confirm on live chain before trading.
          </p>
        </>
      )}
    </div>
  );
}
