"use client";

import { Zap } from "lucide-react";

export type ScanPreset = {
  id: string;
  label: string;
  description: string;
  params: Record<string, string>;
};

export const SCAN_PRESETS: ScanPreset[] = [
  {
    id: "nifty-buy",
    label: "Nifty Buys",
    description: "Institutional Buy signals in Nifty 50",
    params: { universe: "nifty50", recommendation: "Buy" },
  },
  {
    id: "midcap-value",
    label: "Midcap Value",
    description: "Cheap+Fair valuation bracket",
    params: { universe: "midcap", valuation: "soft" },
  },
  {
    id: "smallcap-quality",
    label: "Smallcap Quality",
    description: "Filtered smallcaps + Watch/Buy",
    params: { universe: "smallcap", valuation: "soft", recommendation: "Watch" },
  },
  {
    id: "obv-accum",
    label: "OBV Accumulation",
    description: "Stealth accumulation setups",
    params: { universe: "nifty500", setup: "obv_accumulation" },
  },
  {
    id: "pre-breakout",
    label: "Pre-breakout",
    description: "Volume + consolidation",
    params: { universe: "nifty100", setup: "pre_breakout" },
  },
  {
    id: "vol-accum-breakout",
    label: "Vol accum breakout",
    description: "Confirmed range break on volume",
    params: { universe: "nifty100", setup: "vol_accum_breakout" },
  },
  {
    id: "trend-leaders",
    label: "Trend Leaders",
    description: "Nifty 100 high scores",
    params: { universe: "nifty100", recommendation: "Buy" },
  },
];

export default function ScanPresets({
  onRun,
  loading,
}: {
  onRun: (preset: ScanPreset) => void;
  loading?: boolean;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4" style={{ color: "var(--accent)" }} />
        <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] !mb-0">
          Quick screeners
        </h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SCAN_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={loading}
            onClick={() => onRun(p)}
            className="preset-tile text-left"
          >
            <p className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
              {p.label}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-tertiary)" }}>
              {p.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
