"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Layers,
  LineChart,
  AlertTriangle,
  Menu,
  Moon,
  Sun,
  X,
  Activity,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/equity", label: "Equity", icon: TrendingUp },
  { href: "/options", label: "Options", icon: Layers },
  { href: "/futures", label: "Futures", icon: LineChart },
  { href: "/dashboard", label: "Risk Dashboard", icon: Activity },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("mobile-nav-open", mobileOpen);
    return () => {
      document.body.classList.remove("mobile-nav-open");
    };
  }, [mobileOpen]);

  return (
    <div className="sidebar-shell">
      <header className="mobile-shell-bar">
        <div className="mobile-shell-brand">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: "var(--accent-muted)" }}
          >
            <svg width="14" height="16" viewBox="0 0 20 22" fill="none" aria-hidden>
              <path
                d="M19.162 5.452 10.698.565a.88.88 0 0 0-.879 0L1.356 5.452a.74.74 0 0 0-.37.64v9.853a.74.74 0 0 0 .37.64l8.464 4.887a.879.879 0 0 0 .879 0l8.464-4.886a.74.74 0 0 0 .37-.64V6.091a.74.74 0 0 0-.37-.64Zm-.531 1.035L10.46 20.639c-.055.095-.201.056-.201-.055v-9.266a.52.52 0 0 0-.26-.45L1.975 6.237c-.096-.056-.057-.202.054-.202h16.34c.233 0 .378.252.262.453Z"
                fill="var(--accent)"
              />
            </svg>
          </div>
          <span className="mobile-shell-title">Market Intel</span>
        </div>
        <div className="mobile-shell-actions">
          <button
            type="button"
            onClick={toggle}
            className="btn-ghost !p-1.5"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside id="app-sidebar" className={`app-sidebar${mobileOpen ? " is-open" : ""}`}>
      {/* Logo / brand */}
      <div
        className="flex items-center justify-between px-4 py-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: "var(--accent-muted)" }}
          >
            <svg width="14" height="16" viewBox="0 0 20 22" fill="none" aria-hidden>
              <path
                d="M19.162 5.452 10.698.565a.88.88 0 0 0-.879 0L1.356 5.452a.74.74 0 0 0-.37.64v9.853a.74.74 0 0 0 .37.64l8.464 4.887a.879.879 0 0 0 .879 0l8.464-4.886a.74.74 0 0 0 .37-.64V6.091a.74.74 0 0 0-.37-.64Zm-.531 1.035L10.46 20.639c-.055.095-.201.056-.201-.055v-9.266a.52.52 0 0 0-.26-.45L1.975 6.237c-.096-.056-.057-.202.054-.202h16.34c.233 0 .378.252.262.453Z"
                fill="var(--accent)"
              />
            </svg>
          </div>
          <div>
            <h1
              className="text-[0.8125rem] font-normal tracking-[-0.01em]"
              style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}
            >
              Market Intel
            </h1>
            <p
              className="text-[0.6875rem]"
              style={{ color: "var(--fg-tertiary)", fontFamily: "var(--font-mono)" }}
            >
              NSE / BSE
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="btn-ghost !p-1.5"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-auto px-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p
          className="mb-1.5 px-2 text-[0.6875rem] font-normal uppercase tracking-[0.06em]"
          style={{ color: "var(--fg-muted)", fontFamily: "var(--font-sans)" }}
        >
          Analysis
        </p>
        <div className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem] transition-colors"
                style={{
                  fontFamily: "var(--font-sans)",
                  color: active ? "var(--fg-primary)" : "var(--fg-secondary)",
                  background: active ? "var(--hover-row)" : "transparent",
                }}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <Icon
                  className="h-3.5 w-3.5 shrink-0 transition-colors"
                  style={{ color: active ? "var(--accent)" : "var(--fg-tertiary)" }}
                />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Disclaimer footer */}
      <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
        <div
          className="flex items-start gap-2 rounded-md p-3"
          style={{ background: "var(--amber-muted)", border: "1px solid rgba(201,162,39,0.2)" }}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--amber)" }} />
          <p
            className="text-[0.625rem] leading-relaxed"
            style={{ color: "var(--amber)", fontFamily: "var(--font-body)" }}
          >
            Personal research only. Not financial advice. Verify all data before trading.
          </p>
        </div>
      </div>
    </aside>
    </div>
  );
}

export function SignalBadge({ signal }: { signal: string }) {
  const s = signal.toLowerCase();
  if (s.includes("buy") || s === "long") return <span className="badge-buy">{signal}</span>;
  if (s.includes("sell") || s === "short") return <span className="badge-sell">{signal}</span>;
  if (s.includes("watch")) return <span className="badge-watch">{signal}</span>;
  return <span className="badge-avoid">{signal}</span>;
}

export function ScoreBar({ score, label }: { score: number; label?: string }) {
  const color =
    score >= 80 ? "var(--green)" : score >= 65 ? "var(--accent)" : score >= 50 ? "var(--amber)" : "var(--red)";
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-[0.6875rem]" style={{ color: "var(--fg-tertiary)" }}>
          <span style={{ fontFamily: "var(--font-sans)" }}>{label}</span>
          <span className="font-mono">{score}/100</span>
        </div>
      )}
      <div className="score-bar">
        <div className="score-fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

export function LevelCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div
      className="rounded-md p-3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <p className="field-label !mb-1 !normal-case !tracking-normal">{label}</p>
      <p
        className="text-lg font-normal tabular-nums"
        style={{ fontFamily: "var(--font-mono)", color: color || "var(--fg-primary)" }}
      >
        {typeof value === "number" ? `₹${value.toLocaleString("en-IN")}` : value}
      </p>
    </div>
  );
}

export function Disclaimer() {
  return (
    <div className="disclaimer">
      <strong style={{ fontFamily: "var(--font-sans)" }}>Disclaimer:</strong> This dashboard is for personal
      research and educational use only. It is not financial advice. Every trade carries risk. Always verify
      with your own analysis before making any trade decision.
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
      />
      <span className="ml-3 text-sm" style={{ color: "var(--fg-secondary)", fontFamily: "var(--font-body)" }}>
        Analyzing market data…
      </span>
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{
        background: "var(--red-muted)",
        border: "1px solid rgba(207,45,86,0.25)",
        color: "var(--red)",
        fontFamily: "var(--font-body)",
      }}
    >
      {message}
    </div>
  );
}
