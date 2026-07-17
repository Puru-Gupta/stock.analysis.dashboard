"use client";

import type { DataQuality, ModeDetails, TradeAdvantage } from "@/lib/api";

const SOURCE_LABEL: Record<string, string> = {
  yfinance: "yfinance",
  nse_india: "NSE India",
  yahoo_http: "Yahoo HTTP",
  yahoo_python: "Yahoo Python",
  indian_market_api: "India Market API",
};

export default function DataIntelPanel({
  quality,
  advantages,
  modeDetails,
  agentQuotes,
  agentsMs,
}: {
  quality?: DataQuality | null;
  advantages?: TradeAdvantage[] | null;
  modeDetails?: ModeDetails | null;
  agentQuotes?: { source: string; last: number; latency_ms: number; change_pct?: number }[] | null;
  agentsMs?: number;
}) {
  if (!quality && !advantages?.length && !modeDetails) return null;

  return (
    <div className="page-stack">
      {quality && (
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
                Multi-Agent Live Data
              </h3>
              <p className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                yfinance primary + NSE / Yahoo / community feeds with consensus merge
                {agentsMs != null ? ` · ${agentsMs}ms` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-mono tabular-nums" style={{ color: "var(--accent)" }}>
                {quality.accuracy_score}
                <span className="text-sm" style={{ color: "var(--fg-tertiary)" }}>/100</span>
              </p>
              <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>accuracy</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <p className="field-label !mb-1">Consensus price</p>
              <p className="font-mono tabular-nums text-lg">
                ₹{quality.price_consensus.value.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                {quality.price_consensus.method} · spread {quality.price_consensus.spread_pct}%
              </p>
            </div>
            <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <p className="field-label !mb-1">Sources live</p>
              <p className="font-mono tabular-nums text-lg">{quality.sources_used.length}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                {quality.sources_used.map((s) => SOURCE_LABEL[s] || s).join(" · ")}
              </p>
            </div>
            <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <p className="field-label !mb-1">Bars merged</p>
              <p className="font-mono tabular-nums text-lg">{quality.bar_count}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                fundamentals {quality.fundamentals_complete ? "complete" : "partial"}
              </p>
            </div>
            <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <p className="field-label !mb-1">Option chain</p>
              <p className="font-mono text-lg" style={{ color: quality.live_chain ? "var(--green)" : "var(--fg-tertiary)" }}>
                {quality.live_chain ? "LIVE NSE" : "synthetic"}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
                stock-nse-india / HV fallback
              </p>
            </div>
          </div>

          {agentQuotes && agentQuotes.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Last</th>
                    <th>Latency</th>
                    <th>Chg%</th>
                  </tr>
                </thead>
                <tbody>
                  {agentQuotes.map((q) => (
                    <tr key={q.source}>
                      <td>{SOURCE_LABEL[q.source] || q.source}</td>
                      <td className="font-mono tabular-nums">₹{q.last.toLocaleString("en-IN")}</td>
                      <td className="font-mono tabular-nums">{q.latency_ms}ms</td>
                      <td className="font-mono tabular-nums">
                        {q.change_pct != null ? `${q.change_pct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {quality.notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--fg-secondary)" }}>
              {quality.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {advantages && advantages.length > 0 && (
        <div className="card">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
            Trade Advantages
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {advantages.map((a) => (
              <div
                key={a.title}
                className="rounded-md p-3"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm" style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}>
                    {a.title}
                  </p>
                  <span
                    className="text-[0.625rem] uppercase tracking-wider font-mono"
                    style={{
                      color:
                        a.weight === "high" || a.weight === "edge"
                          ? "var(--green)"
                          : "var(--fg-tertiary)",
                    }}
                  >
                    {a.weight}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  {a.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {modeDetails && (
        <div className="card">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
            Mode Details — {modeDetails.label}
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
            {modeDetails.objective}
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="field-label">When to use</p>
              <ul className="space-y-1 text-xs" style={{ color: "var(--fg-secondary)" }}>
                {modeDetails.when_to_use.map((x) => (
                  <li key={x}>• {x}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="field-label">Advantages</p>
              <ul className="space-y-1 text-xs" style={{ color: "var(--fg-secondary)" }}>
                {modeDetails.advantages.map((x) => (
                  <li key={x}>• {x}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="field-label">Risks</p>
              <ul className="space-y-1 text-xs" style={{ color: "var(--fg-secondary)" }}>
                {modeDetails.risks.map((x) => (
                  <li key={x}>• {x}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--amber)" }}>
            Invalidation: {modeDetails.invalidation}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
            Best for: {modeDetails.best_for}
          </p>
        </div>
      )}
    </div>
  );
}
