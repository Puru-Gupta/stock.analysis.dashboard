"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type RegimeBannerData = {
  state: string;
  label: string;
  detail: string;
  allows_long: boolean;
  ret_20d: number;
  ema50?: number;
  ema200?: number;
  nifty_last?: number;
};

export default function MarketRegimeBanner({
  regime,
  niftyLast,
  compact,
}: {
  regime: RegimeBannerData | null;
  niftyLast?: number;
  compact?: boolean;
}) {
  if (!regime) return null;

  const Icon =
    regime.state === "risk_on" ? TrendingUp : regime.state === "risk_off" ? TrendingDown : Minus;
  const color =
    regime.state === "risk_on"
      ? "var(--green)"
      : regime.state === "risk_off"
        ? "var(--red)"
        : "var(--amber)";

  return (
    <div
      className={`regime-banner${compact ? " regime-banner-compact" : ""}`}
      style={{
        borderColor: regime.allows_long ? "rgba(0,236,126,0.2)" : "rgba(245,59,58,0.25)",
        background: regime.allows_long ? "var(--green-muted)" : "var(--red-muted)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
              Nifty {regime.label}
              {niftyLast != null ? (
                <span className="ml-2 font-mono tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                  {niftyLast.toLocaleString("en-IN")}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
              {regime.detail}
            </p>
            {!compact && regime.ema50 != null && regime.ema200 != null && (
              <p className="mt-1 font-mono text-[0.6875rem] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                20d {regime.ret_20d}% · EMA50 {regime.ema50} · EMA200 {regime.ema200}
                {!regime.allows_long ? " · fresh cash Buys blocked" : ""}
              </p>
            )}
          </div>
        </div>
        {!compact && (
          <Link href="/equity" className="btn-secondary text-xs shrink-0">
            Scan equities
          </Link>
        )}
      </div>
    </div>
  );
}
