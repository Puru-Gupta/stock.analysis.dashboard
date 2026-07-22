import type { OHLCVBar } from "@/lib/data/types";
import { historicalVol } from "./options";

export type FocusStatus = "clean" | "caution" | "avoid";

export interface StockFocusAssessment {
  status: FocusStatus;
  label: string;
  tags: string[];
  note: string;
  event_risk: "low" | "elevated";
}

function pctMove(a: number, b: number) {
  if (!b) return 0;
  return Math.abs((a - b) / b) * 100;
}

/** Price/volume signatures that often indicate news, events, or abnormal activity. */
export function assessStockFocus(input: {
  bars: OHLCVBar[];
  hv: number;
  zScore1m?: number;
  volRegime?: string;
}): StockFocusAssessment {
  const { bars, hv, zScore1m = 0, volRegime } = input;
  const tags: string[] = [];
  let severity = 0;

  const hv7 = bars.length > 26 ? historicalVol(bars.slice(0, -5)) : hv;
  const volJumpPp = (hv - hv7) * 100;
  const last = bars.at(-1)!;
  const prev = bars.at(-2);
  const lastMovePct = prev ? pctMove(last.close, prev.close) : 0;

  if (volJumpPp > 4) {
    tags.push("Vol spike");
    severity += 2;
  } else if (volJumpPp > 2.5) {
    tags.push("Vol rising");
    severity += 1;
  }

  if (lastMovePct > 3.5) {
    tags.push("Large 1d move");
    severity += 2;
  } else if (lastMovePct > 2.5) {
    tags.push("Sharp move");
    severity += 1;
  }

  if (prev && prev.close > 0) {
    const gapPct = Math.abs((last.open - prev.close) / prev.close) * 100;
    if (gapPct > 2) {
      tags.push("Gap open");
      severity += 2;
    }
  }

  if (bars.length >= 22) {
    const vols = bars.map((b) => b.volume);
    const avgVol = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
    if (avgVol > 0 && last.volume >= avgVol * 2.5) {
      tags.push("Volume surge");
      severity += 1;
    }
  }

  if (bars.length >= 4) {
    const move3d = pctMove(bars.at(-1)!.close, bars.at(-4)!.close);
    if (move3d > 8) {
      tags.push("3d momentum");
      severity += 1;
    }
  }

  if (Math.abs(zScore1m) >= 2.5) {
    tags.push("Extreme stretch");
    severity += 2;
  } else if (Math.abs(zScore1m) >= 2) {
    tags.push("Stretched price");
    severity += 1;
  }

  if (volRegime === "Extreme" || volRegime === "High") {
    tags.push("High vol regime");
    severity += volRegime === "Extreme" ? 2 : 1;
  }

  const hasNewsSignature = tags.some((t) =>
    ["Vol spike", "Large 1d move", "Gap open", "Volume surge"].includes(t),
  );

  if (hasNewsSignature && !tags.includes("News?")) {
    tags.unshift("News?");
  }

  const event_risk: StockFocusAssessment["event_risk"] =
    severity >= 3 || hasNewsSignature ? "elevated" : "low";

  let status: FocusStatus = "clean";
  let label = "Clean";
  let note = "No unusual price, volume, or vol signatures — typical for premium selling.";

  if (severity >= 4 || (hasNewsSignature && severity >= 2)) {
    status = "avoid";
    label = "News / odd";
    note = tags.length
      ? `${tags.slice(0, 3).join(" · ")} — avoid or use wider strikes until activity settles.`
      : "Abnormal activity detected — treat as event risk.";
  } else if (severity >= 1) {
    status = "caution";
    label = "Caution";
    note = `${tags.join(" · ")} — possible news or event; confirm before selling near strikes.`;
  }

  return {
    status,
    label,
    tags: [...new Set(tags)],
    note,
    event_risk,
  };
}

/** Legacy helper used by the seller engine. */
export function detectEventRisk(bars: OHLCVBar[], hv: number) {
  const focus = assessStockFocus({ bars, hv });
  return focus.event_risk === "elevated"
    ? { risk: "elevated" as const, note: focus.note }
    : { risk: "low" as const, note: "No abnormal volatility or price shock detected" };
}
