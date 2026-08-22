export type MarketEventCategory =
  | "budget"
  | "rbi"
  | "election"
  | "geopolitical"
  | "policy"
  | "results";

export interface MarketEvent {
  date: string;
  end_date?: string;
  label: string;
  category: MarketEventCategory;
}

/** Curated India macro / market catalysts for expiry-week context (2021–2026). */
export const MARKET_EVENTS: MarketEvent[] = [
  // Union Budget
  { date: "2021-02-01", label: "Union Budget FY22", category: "budget" },
  { date: "2022-02-01", label: "Union Budget FY23", category: "budget" },
  { date: "2023-02-01", label: "Union Budget FY24", category: "budget" },
  { date: "2024-02-01", label: "Interim Budget FY25", category: "budget" },
  { date: "2025-02-01", label: "Union Budget FY26", category: "budget" },
  { date: "2026-02-01", label: "Union Budget FY27", category: "budget" },

  // RBI MPC (policy decision days — approximate)
  { date: "2021-02-05", label: "RBI MPC", category: "rbi" },
  { date: "2021-04-07", label: "RBI MPC", category: "rbi" },
  { date: "2021-06-04", label: "RBI MPC", category: "rbi" },
  { date: "2021-08-06", label: "RBI MPC", category: "rbi" },
  { date: "2021-10-08", label: "RBI MPC", category: "rbi" },
  { date: "2021-12-08", label: "RBI MPC", category: "rbi" },
  { date: "2022-02-10", label: "RBI MPC", category: "rbi" },
  { date: "2022-04-08", label: "RBI MPC", category: "rbi" },
  { date: "2022-05-04", label: "RBI off-cycle hike", category: "rbi" },
  { date: "2022-06-08", label: "RBI MPC", category: "rbi" },
  { date: "2022-08-05", label: "RBI MPC", category: "rbi" },
  { date: "2022-09-30", label: "RBI MPC", category: "rbi" },
  { date: "2022-12-07", label: "RBI MPC", category: "rbi" },
  { date: "2023-02-08", label: "RBI MPC", category: "rbi" },
  { date: "2023-04-06", label: "RBI MPC", category: "rbi" },
  { date: "2023-06-08", label: "RBI MPC", category: "rbi" },
  { date: "2023-08-10", label: "RBI MPC", category: "rbi" },
  { date: "2023-10-06", label: "RBI MPC", category: "rbi" },
  { date: "2023-12-08", label: "RBI MPC", category: "rbi" },
  { date: "2024-02-08", label: "RBI MPC", category: "rbi" },
  { date: "2024-04-05", label: "RBI MPC", category: "rbi" },
  { date: "2024-06-07", label: "RBI MPC", category: "rbi" },
  { date: "2024-08-08", label: "RBI MPC", category: "rbi" },
  { date: "2024-10-09", label: "RBI MPC", category: "rbi" },
  { date: "2024-12-06", label: "RBI MPC", category: "rbi" },
  { date: "2025-02-07", label: "RBI MPC", category: "rbi" },
  { date: "2025-04-09", label: "RBI MPC", category: "rbi" },
  { date: "2025-06-06", label: "RBI MPC", category: "rbi" },
  { date: "2025-08-08", label: "RBI MPC", category: "rbi" },
  { date: "2025-10-08", label: "RBI MPC", category: "rbi" },
  { date: "2025-12-05", label: "RBI MPC", category: "rbi" },

  // Elections & major policy
  { date: "2024-04-19", end_date: "2024-06-01", label: "Lok Sabha elections 2024", category: "election" },
  { date: "2024-06-04", label: "Election results 2024", category: "election" },
  { date: "2019-05-23", label: "Election results 2019", category: "election" },

  // Geopolitical / global spillovers (week anchors)
  { date: "2022-02-24", label: "Russia–Ukraine war begins", category: "geopolitical" },
  { date: "2020-03-23", end_date: "2020-03-27", label: "COVID crash / lockdown", category: "geopolitical" },
  { date: "2023-03-10", label: "SVB / global banking stress", category: "geopolitical" },
  { date: "2025-04-02", label: "US reciprocal tariffs announced", category: "geopolitical" },

  // NSE expiry regime change
  { date: "2024-09-03", label: "Nifty weekly expiry → Tuesday", category: "policy" },
];

const CATEGORY_COLORS: Record<MarketEventCategory, string> = {
  budget: "#f59e0b",
  rbi: "#3b82f6",
  election: "#a855f7",
  geopolitical: "#ef4444",
  policy: "#06b6d4",
  results: "#22c55e",
};

export function eventCategoryColor(cat: MarketEventCategory) {
  return CATEGORY_COLORS[cat];
}

/** Events whose date (or range) overlaps [windowStart, windowEnd]. */
export function eventsForWindow(windowStart: string, windowEnd: string): MarketEvent[] {
  return MARKET_EVENTS.filter((e) => {
    const eStart = e.date;
    const eEnd = e.end_date || e.date;
    return eStart <= windowEnd && eEnd >= windowStart;
  });
}

/** Events in a calendar range (for chart band annotations). */
export function eventsInRange(rangeStart: string, rangeEnd: string): MarketEvent[] {
  return eventsForWindow(rangeStart, rangeEnd);
}
