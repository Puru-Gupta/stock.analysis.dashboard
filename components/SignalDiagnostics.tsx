"use client";

import { EQUITY_DEFINITIONS, SIGNAL_SETUPS } from "@/lib/equity-definitions";
import { LabelWithInfo } from "./InfoTip";
import { TrendingDown, TrendingUp, Activity, BarChart2 } from "lucide-react";

interface Diagnostics {
  mvrb?: {
    ret_1m?: number;
    ret_3m?: number;
    vol_ratio?: number;
    rs_vs_nifty?: number;
    near_52w_high?: boolean;
  } | null;
  accumulation?: {
    signal?: boolean;
    price_consolidation?: boolean;
    volume_accumulation?: boolean;
    near_20sma?: boolean;
    pre_breakout?: boolean;
    vol_vs_avg?: number;
    price_change_15d_pct?: number;
  };
  obv?: {
    signal?: boolean;
    obv_divergence?: boolean;
    volume_spike?: boolean;
    price_change_15d_pct?: number;
    obv_change_15d?: number;
    price_down_flat?: boolean;
    vol_20d_vs_60d?: number;
  };
  active_setups?: string[];
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-[0.625rem]"
      style={{
        background: active ? "var(--green-muted)" : "var(--muted-fill)",
        color: active ? "var(--green)" : "var(--fg-muted)",
      }}
    >
      {active ? "✓ " : "✗ "}{label}
    </span>
  );
}

function MetricRow({
  label,
  value,
  defKey,
  highlight,
}: {
  label: string;
  value: string | number | boolean;
  defKey: string;
  highlight?: boolean;
}) {
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div
      className="flex items-center justify-between rounded-md px-3 py-2"
      style={{
        background: highlight ? "var(--amber-muted)" : "var(--bg-secondary)",
        border: highlight ? "1px solid rgba(201,162,39,0.2)" : "1px solid var(--border)",
      }}
    >
      <LabelWithInfo label={label} definition={EQUITY_DEFINITIONS[defKey]} />
      <span
        className="font-mono text-sm tabular-nums"
        style={{ color: highlight ? "var(--amber)" : "var(--fg-primary)" }}
      >
        {display}
      </span>
    </div>
  );
}

export default function SignalDiagnostics({ diagnostics }: { diagnostics: Diagnostics }) {
  const { mvrb, accumulation, obv, active_setups = [] } = diagnostics;

  const showObvHighlight = obv?.obv_divergence && (obv?.price_change_15d_pct ?? 0) <= 2;
  const showVolAccum = accumulation?.volume_accumulation;

  return (
    <div className="space-y-4">
      {active_setups.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(245,78,0,0.25)" }}>
          <h3 className="card-section-title !normal-case !tracking-normal flex items-center gap-2" style={{ color: "var(--accent)" }}>
            <Activity className="h-3.5 w-3.5" /> Active Setups Detected
          </h3>
          <div className="space-y-2">
            {active_setups.map((key) => {
              const setup = SIGNAL_SETUPS[key as keyof typeof SIGNAL_SETUPS];
              if (!setup) return null;
              return (
                <div key={key} className="rounded-md p-3" style={{ background: "var(--accent-muted)" }}>
                  <p style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}>{setup.title}</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>{setup.description}</p>
                  <p className="mt-2 text-xs" style={{ color: "var(--green)" }}>→ {setup.action}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="card-section-title !normal-case !tracking-normal flex items-center gap-2">
          <TrendingDown className="h-3.5 w-3.5" style={{ color: "var(--amber)" }} />
          <LabelWithInfo
            label="OBV Accumulation (Price Weak, Volume Strong)"
            definition={EQUITY_DEFINITIONS.obv_divergence}
          />
        </h3>
        {showObvHighlight && (
          <div
            className="mb-3 rounded-md px-3 py-2 text-xs"
            style={{ background: "var(--amber-muted)", border: "1px solid rgba(201,162,39,0.25)", color: "var(--amber)" }}
          >
            <strong>Accumulation seen:</strong> Price is down/flat ({obv?.price_change_15d_pct}%) but OBV is rising (+{obv?.obv_change_15d?.toLocaleString()}).
            This often means buyers are quietly absorbing shares while price looks weak.
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricRow label="OBV Divergence" value={obv?.obv_divergence ?? false} defKey="obv_divergence" highlight={obv?.obv_divergence} />
          <MetricRow label="Price Change (15d)" value={`${obv?.price_change_15d_pct ?? 0}%`} defKey="ret_1m" highlight={showObvHighlight} />
          <MetricRow label="OBV Change (15d)" value={obv?.obv_change_15d?.toLocaleString() ?? "0"} defKey="obv_divergence" />
          <MetricRow label="Volume Spike (20d vs 60d)" value={`${obv?.vol_20d_vs_60d ?? 0}x`} defKey="volume_spike" highlight={obv?.volume_spike} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusPill active={!!obv?.obv_divergence} label="OBV Rising" />
          <StatusPill active={!!obv?.price_down_flat} label="Price Flat/Down" />
          <StatusPill active={!!obv?.volume_spike} label="Volume Spike" />
        </div>
      </div>

      <div className="card">
        <h3 className="card-section-title !normal-case !tracking-normal flex items-center gap-2">
          <BarChart2 className="h-3.5 w-3.5" style={{ color: "var(--green)" }} />
          <LabelWithInfo
            label="Volume Accumulation + Pre-Breakout"
            definition={EQUITY_DEFINITIONS.volume_accumulation}
          />
        </h3>
        {showVolAccum && !accumulation?.signal && (
          <div
            className="mb-3 rounded-md px-3 py-2 text-xs"
            style={{ background: "var(--green-muted)", border: "1px solid rgba(31,138,101,0.25)", color: "var(--green)" }}
          >
            <strong>Volume building:</strong> Volume is {accumulation?.vol_vs_avg}x the 20-day average while price consolidates.
            Not yet a full breakout setup — watch for range break with volume.
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricRow label="Volume vs 20d Avg" value={`${accumulation?.vol_vs_avg ?? 0}x`} defKey="vol_ratio" highlight={showVolAccum} />
          <MetricRow label="Price Consolidation" value={accumulation?.price_consolidation ?? false} defKey="price_consolidation" />
          <MetricRow label="Near 20-SMA" value={accumulation?.near_20sma ?? false} defKey="volume_accumulation" />
          <MetricRow label="Pre-Breakout (not at high)" value={accumulation?.pre_breakout ?? false} defKey="pre_breakout" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusPill active={!!accumulation?.volume_accumulation} label="Vol Accumulation" />
          <StatusPill active={!!accumulation?.price_consolidation} label="Consolidating" />
          <StatusPill active={!!accumulation?.signal} label="Full Breakout Setup" />
        </div>
      </div>

      <div className="card">
        <h3 className="card-section-title !normal-case !tracking-normal flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          <LabelWithInfo label="MVRB Momentum Metrics" definition={EQUITY_DEFINITIONS.ret_3m} />
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <MetricRow label="1M Return" value={`${mvrb?.ret_1m ?? 0}%`} defKey="ret_1m" />
          <MetricRow label="3M Return" value={`${mvrb?.ret_3m ?? 0}%`} defKey="ret_3m" highlight={(mvrb?.ret_3m ?? 0) > 10} />
          <MetricRow label="Volume Ratio" value={`${mvrb?.vol_ratio ?? 0}x`} defKey="vol_ratio" highlight={(mvrb?.vol_ratio ?? 0) > 1.2} />
          <MetricRow label="RS vs Nifty" value={mvrb?.rs_vs_nifty ?? 0} defKey="rs_vs_nifty" highlight={(mvrb?.rs_vs_nifty ?? 0) > 1} />
          <MetricRow label="Near 52W High" value={mvrb?.near_52w_high ?? false} defKey="near_52w_high" />
        </div>
      </div>
    </div>
  );
}
