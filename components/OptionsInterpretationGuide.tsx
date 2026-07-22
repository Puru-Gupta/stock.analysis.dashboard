"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, X } from "lucide-react";
import {
  OPTIONS_INTERPRETATION_SECTIONS,
  OPTIONS_SELLER_ENVIRONMENT,
} from "@/lib/options-interpretation-guide";

function GuideTable({ rows }: { rows: { label: string; meaning: string }[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-md" style={{ border: "1px solid var(--border)" }}>
      <table className="data-table text-xs">
        <thead>
          <tr>
            <th>Value</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="font-medium whitespace-nowrap">{row.label}</td>
              <td style={{ color: "var(--fg-secondary)" }}>{row.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-flyout)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4"
          style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h2 className="text-lg font-normal tracking-[-0.02em]" style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}>
              Dashboard Interpretation Guide
            </h2>
            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
              How to read each metric on the statistical options dashboard
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !p-2" aria-label="Close guide">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {OPTIONS_INTERPRETATION_SECTIONS.map((section) => (
            <section
              key={section.id}
              className="rounded-md p-4"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              <h3 className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
                {section.title}
              </h3>
              {section.what && (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  <span style={{ color: "var(--fg-muted)" }}>What it shows — </span>
                  {section.what}
                </p>
              )}
              {section.how && (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                  <span style={{ color: "var(--fg-muted)" }}>How to use — </span>
                  {section.how}
                </p>
              )}
              {section.bullets && (
                <ul className="mt-2 space-y-1">
                  {section.bullets.map((b) => (
                    <li key={b} className="text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                      • {b}
                    </li>
                  ))}
                </ul>
              )}
              {section.table && <GuideTable rows={section.table} />}
              {section.interpretation && (
                <div className="mt-3">
                  {section.interpretation.heading && (
                    <p className="text-[0.625rem] uppercase tracking-wide mb-1" style={{ color: "var(--fg-muted)" }}>
                      {section.interpretation.heading}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {section.interpretation.items.map((item) => (
                      <li key={item} className="text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {section.note && (
                <p className="mt-2 text-xs italic" style={{ color: "var(--amber)" }}>
                  {section.note}
                </p>
              )}
            </section>
          ))}

          <section className="rounded-md p-4" style={{ background: "var(--green-muted)", border: "1px solid rgba(31,138,101,0.25)" }}>
            <h3 className="text-sm font-medium" style={{ color: "var(--green)" }}>
              Good Environment for Option Sellers
            </h3>
            <ul className="mt-2 space-y-1">
              {OPTIONS_SELLER_ENVIRONMENT.favorable.map((item) => (
                <li key={item} className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                  • {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md p-4" style={{ background: "var(--red-muted)", border: "1px solid rgba(220,38,38,0.2)" }}>
            <h3 className="text-sm font-medium" style={{ color: "var(--red)" }}>
              Higher-Risk Conditions
            </h3>
            <ul className="mt-2 space-y-1">
              {OPTIONS_SELLER_ENVIRONMENT.higherRisk.map((item) => (
                <li key={item} className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                  • {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export function OptionsInterpretationGuideButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("modal-open", open);
    return () => document.body.classList.remove("modal-open");
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn-secondary ${className}`}
        aria-label="Open dashboard interpretation guide"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Interpretation Guide</span>
      </button>
      <GuideModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function OptionsInterpretationSummary() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card" style={{ borderColor: "rgba(59,130,246,0.2)" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            Quick interpretation tips
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--fg-tertiary)" }}>
            Favorable seller setup: IV &gt; HV · Quiet/Normal regime · Confidence ≥ 60 · Price inside ~2σ
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          style={{ color: "var(--fg-muted)" }}
        />
      </button>
      {expanded && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--green)" }}>
              Good for sellers
            </p>
            <ul className="space-y-1">
              {OPTIONS_SELLER_ENVIRONMENT.favorable.slice(0, 4).map((item) => (
                <li key={item} className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                  • {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--red)" }}>
              Higher risk
            </p>
            <ul className="space-y-1">
              {OPTIONS_SELLER_ENVIRONMENT.higherRisk.slice(0, 4).map((item) => (
                <li key={item} className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
