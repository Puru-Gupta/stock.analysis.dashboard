"use client";

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

interface InfoTipProps {
  term: string;
  definition?: string;
  className?: string;
}

export function InfoTip({ term, definition, className = "" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!definition) return null;

  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors"
        style={{
          border: "1px solid var(--border)",
          color: "var(--fg-tertiary)",
        }}
        aria-label={`Info about ${term}`}
      >
        <Info className="h-2 w-2" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-5 z-50 block w-64 rounded-md p-3 text-xs leading-relaxed shadow-lg"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            color: "var(--fg-secondary)",
            boxShadow: "var(--shadow-flyout)",
            fontFamily: "var(--font-body)",
          }}
        >
          <span className="mb-1 block font-normal" style={{ color: "var(--accent)", fontFamily: "var(--font-sans)" }}>
            {term}
          </span>
          <span className="block">{definition}</span>
        </span>
      )}
    </span>
  );
}

export function LabelWithInfo({
  label,
  definition,
}: {
  label: string;
  definition?: string;
}) {
  return (
    <span className="inline-flex items-center">
      {label}
      <InfoTip term={label} definition={definition} />
    </span>
  );
}
