"use client";

import type { ExpiryDecayComparison, PremiumDecayTimeline } from "@/lib/engines/premium-decay";
import { AlertTriangle, Clock } from "lucide-react";

function fmt(v: number) {
  return v.toFixed(2);
}

export default function PremiumDecayTimelinePanel({
  timeline,
  comparison,
  title = "Premium Decay Timeline",
}: {
  timeline: PremiumDecayTimeline;
  comparison?: ExpiryDecayComparison | null;
  title?: string;
}) {
  const maxDecay = Math.max(...timeline.weeks.map((w) => w.decay_this_week), 0.01);
  const typeLabel = timeline.option_type === "call" ? "CE" : "PE";

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
            {title}
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--fg-tertiary)" }}>
            {timeline.strike} {typeLabel} · {timeline.expiry} · {timeline.days_to_expiry} DTE ·{" "}
            {timeline.model === "live" ? "Live premium" : "Modeled"} ₹{fmt(timeline.initial_premium)}
          </p>
        </div>
        <div
          className="rounded-md px-3 py-1.5 text-xs"
          style={{ background: "var(--amber-muted)", color: "var(--amber)", border: "1px solid rgba(201,162,39,0.25)" }}
        >
          <Clock className="mr-1 inline h-3.5 w-3.5" />
          Fastest decay: week{timeline.fastest_weeks.length > 1 ? "s" : ""}{" "}
          {timeline.fastest_weeks.join(", ")}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>DTE</th>
              <th>Premium left</th>
              <th>Decay / week</th>
              <th>% collected</th>
              <th>Decay pace</th>
            </tr>
          </thead>
          <tbody>
            {timeline.weeks.map((w) => {
              const fast = w.is_fast_zone || timeline.fastest_weeks.includes(w.week);
              return (
                <tr
                  key={w.week}
                  style={{
                    background: fast ? "color-mix(in srgb, var(--amber) 8%, transparent)" : undefined,
                  }}
                >
                  <td>
                    <div className="text-sm">{w.label}</div>
                    {w.event_warning && (
                      <div className="mt-0.5 flex items-center gap-1 text-[0.625rem]" style={{ color: "var(--red)" }}>
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {w.event_warning}
                      </div>
                    )}
                  </td>
                  <td className="font-mono text-xs tabular-nums">
                    {w.dte_start}→{w.dte_end}
                  </td>
                  <td className="font-mono text-xs tabular-nums">₹{fmt(w.premium_left)}</td>
                  <td className="font-mono text-xs tabular-nums" style={{ color: "var(--green)" }}>
                    +₹{fmt(w.decay_this_week)}
                  </td>
                  <td className="font-mono text-xs tabular-nums">{w.pct_collected}%</td>
                  <td className="min-w-[120px]">
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (w.decay_this_week / maxDecay) * 100)}%`,
                          background: fast ? "var(--amber)" : "var(--accent)",
                        }}
                      />
                    </div>
                    <span className="font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                      {w.pct_this_week}% of premium
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[0.625rem] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        {timeline.note} Total modeled decay to expiry: ₹{fmt(timeline.total_decay)}.
        {timeline.weeks.some((w) => w.is_fast_zone) && " Highlighted rows are the usual fastest-decay zone (≤14 DTE)."}
      </p>

      {comparison && (
        <div className="mt-5 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
          <h4 className="text-sm font-medium mb-2" style={{ color: "var(--fg-primary)" }}>
            Nearest expiry comparison — {comparison.strike} {comparison.option_type === "call" ? "CE" : "PE"}
          </h4>
          <div className="grid gap-3 md:grid-cols-2 mb-3">
            {[comparison.near, comparison.far].map((leg) => (
              <div
                key={leg.expiry}
                className="rounded-md p-3 text-xs"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <p className="font-medium mb-1" style={{ color: "var(--fg-primary)" }}>
                  {leg.expiry}
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                  <span>DTE</span>
                  <span className="text-right">{leg.days_to_expiry}</span>
                  <span>Premium</span>
                  <span className="text-right">₹{fmt(leg.premium)}</span>
                  <span>Avg decay/wk</span>
                  <span className="text-right">₹{fmt(leg.avg_decay_per_week)}</span>
                  <span>Total decay</span>
                  <span className="text-right">₹{fmt(leg.total_decay)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
            {comparison.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
