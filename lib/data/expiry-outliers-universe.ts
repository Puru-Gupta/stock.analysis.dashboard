import { NIFTY_50 } from "@/lib/data/universes";

/** Liquid index underlyings with weekly F&O (Yahoo symbols). */
export const FNO_INDICES = [
  { id: "nifty50", symbol: "^NSEI", label: "Nifty 50", weekly: true },
  { id: "banknifty", symbol: "^NSEBANK", label: "Bank Nifty", weekly: true },
  { id: "finnifty", symbol: "^CNXFIN", label: "Fin Nifty", weekly: true },
  { id: "midcpnifty", symbol: "^NSMIDCP", label: "Midcap Nifty", weekly: true },
] as const;

export function stockOptions() {
  return NIFTY_50.map((sym) => ({
    symbol: sym,
    label: sym.replace(".NS", ""),
  }));
}
