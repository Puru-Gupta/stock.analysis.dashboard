"use client";

import { useEffect, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { EQUITY_DEFINITIONS, SIGNAL_SETUPS, GLOSSARY_SECTIONS } from "@/lib/equity-definitions";

export function GlossaryButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("modal-open", open);
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn-secondary ${className}`}
        aria-label="Open glossary"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Glossary</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg"
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
                  Keywords & Variables
                </h2>
                <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
                  How signals, scores, and filters work on this dashboard
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost !p-2" aria-label="Close glossary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-5">
              {GLOSSARY_SECTIONS.map((section) => (
                <section key={section.title}>
                  <h3 className="card-section-title">{section.title}</h3>
                  <div className="space-y-2">
                    {section.items.map(([term, key]) => (
                      <div
                        key={term}
                        className="rounded-md p-3"
                        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                      >
                        <p className="text-sm font-normal" style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}>
                          {term}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                          {EQUITY_DEFINITIONS[key] || key}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <section>
                <h3 className="card-section-title">Signal Setups</h3>
                <div className="space-y-2">
                  {Object.values(SIGNAL_SETUPS).map((s) => (
                    <div
                      key={s.title}
                      className="rounded-md p-3"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                    >
                      <p className="text-sm font-normal" style={{ fontFamily: "var(--font-sans)", color: "var(--fg-primary)" }}>
                        {s.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                        {s.description}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--green)" }}>
                        Action: {s.action}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
