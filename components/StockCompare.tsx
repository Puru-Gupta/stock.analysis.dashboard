"use client";

import { useState } from "react";
import { fetchAPI, EquityAnalysis } from "@/lib/api";
import { SignalBadge } from "@/components/Sidebar";
import { GitCompare, Loader2 } from "lucide-react";

export default function StockCompare({
  primary,
  timeframe,
}: {
  primary: EquityAnalysis | null;
  timeframe: string;
}) {
  const [symbol, setSymbol] = useState("");
  const [other, setOther] = useState<EquityAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!primary) return null;

  const compare = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError("");
    try {
      const target = sym.endsWith(".NS") ? sym : `${sym}.NS`;
      const data = await fetchAPI<EquityAnalysis>(
        `/api/equity/analyze?symbol=${encodeURIComponent(target)}&timeframe=${timeframe}`,
      );
      setOther(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compare failed");
      setOther(null);
    } finally {
      setLoading(false);
    }
  };

  const rows: { label: string; a: string | number; b: string | number }[] = other
    ? [
        { label: "Signal", a: primary.signal, b: other.signal },
        { label: "Score", a: primary.final_score, b: other.final_score },
        { label: "Tech", a: primary.technical_score, b: other.technical_score },
        { label: "Fund", a: primary.fundamental_score, b: other.fundamental_score },
        { label: "R:R", a: `1:${primary.risk_reward}`, b: `1:${other.risk_reward}` },
        { label: "RSI", a: primary.score_breakdown?.rsi ?? "—", b: other.score_breakdown?.rsi ?? "—" },
        {
          label: "PE rel",
          a: primary.valuation_relative?.pe_relative ?? "—",
          b: other.valuation_relative?.pe_relative ?? "—",
        },
        {
          label: "20d exp",
          a: primary.expectancy?.avg_ret_20d != null ? `${primary.expectancy.avg_ret_20d}%` : "—",
          b: other.expectancy?.avg_ret_20d != null ? `${other.expectancy.avg_ret_20d}%` : "—",
        },
      ]
    : [];

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <GitCompare className="h-4 w-4" style={{ color: "var(--accent)" }} />
        <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] !mb-0">
          Compare stocks
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="product-query-input min-w-[140px] flex-1"
          placeholder="TCS.NS"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && compare()}
        />
        <button type="button" className="product-action-secondary" onClick={compare} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Compare"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs" style={{ color: "var(--red)" }}>{error}</p>}
      {other && (
        <div className="mt-4 table-scroll overflow-x-auto">
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th>Metric</th>
                <th>{primary.symbol.replace(".NS", "")}</th>
                <th>{other.symbol.replace(".NS", "")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td style={{ color: "var(--fg-tertiary)" }}>{r.label}</td>
                  <td>
                    {r.label === "Signal" ? <SignalBadge signal={String(r.a)} /> : r.a}
                  </td>
                  <td>
                    {r.label === "Signal" ? <SignalBadge signal={String(r.b)} /> : r.b}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
