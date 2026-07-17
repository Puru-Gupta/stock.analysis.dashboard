"use client";

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";

export default function PositionSizer({
  entry,
  stop,
  defaultCapital = 500000,
}: {
  entry: number;
  stop: number;
  defaultCapital?: number;
}) {
  const [capital, setCapital] = useState(defaultCapital);
  const [riskPct, setRiskPct] = useState(1);

  const calc = useMemo(() => {
    if (!entry || !stop || entry <= stop) return null;
    const riskPerShare = entry - stop;
    const riskAmount = (capital * riskPct) / 100;
    const shares = Math.floor(riskAmount / riskPerShare);
    const positionValue = shares * entry;
    const actualRisk = shares * riskPerShare;
    const pctOfCapital = capital > 0 ? (positionValue / capital) * 100 : 0;
    return { shares, positionValue, actualRisk, riskPerShare, pctOfCapital };
  }, [capital, riskPct, entry, stop]);

  if (!entry || !stop) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-4 w-4" style={{ color: "var(--accent-blue)" }} />
        <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] !mb-0">
          Position sizer
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Capital (₹)</span>
          <input
            type="number"
            className="product-query-input mt-1 w-full"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value) || 0)}
            min={0}
            step={10000}
          />
        </label>
        <label className="block">
          <span className="field-label">Risk per trade (%)</span>
          <input
            type="number"
            className="product-query-input mt-1 w-full"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value) || 0)}
            min={0.25}
            max={5}
            step={0.25}
          />
        </label>
      </div>
      {calc && calc.shares > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Shares", value: calc.shares.toLocaleString("en-IN") },
            { label: "Position", value: `₹${Math.round(calc.positionValue).toLocaleString("en-IN")}` },
            { label: "Risk ₹", value: `₹${Math.round(calc.actualRisk).toLocaleString("en-IN")}` },
            { label: "% capital", value: `${calc.pctOfCapital.toFixed(1)}%` },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-md p-2"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              <p className="text-[0.625rem] uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
                {label}
              </p>
              <p className="mt-0.5 font-mono text-sm tabular-nums" style={{ color: "var(--fg-primary)" }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs" style={{ color: "var(--amber)" }}>
          Entry must be above stop loss for sizing math.
        </p>
      )}
      <p className="mt-2 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
        Risk ₹{(capital * riskPct) / 100} max · stop distance ₹{Math.max(0, entry - stop).toFixed(2)}/share
      </p>
    </div>
  );
}
