/**
 * Upcoming earnings / results dates via Yahoo Finance calendarEvents.
 */

import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface UpcomingEarnings {
  date: string;
  days_away: number;
  is_estimate: boolean;
  label: string;
}

const cache = new Map<string, { at: number; data: UpcomingEarnings | null }>();
const TTL_MS = 6 * 60 * 60 * 1000;

function formatLabel(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function calendarDaysAway(iso: string) {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(iso);
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((t1.getTime() - t0.getTime()) / 86400000);
}

export async function fetchUpcomingEarnings(symbol: string): Promise<UpcomingEarnings | null> {
  const key = symbol.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  let data: UpcomingEarnings | null = null;
  try {
    const summary = await yf.quoteSummary(key, { modules: ["calendarEvents"] });
    const earnings = summary.calendarEvents?.earnings;
    const rawDates = earnings?.earningsDate || [];
    const future = rawDates
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d.getTime()))
      .filter((d) => calendarDaysAway(d.toISOString()) >= 0)
      .sort((a, b) => a.getTime() - b.getTime());

    const next = future[0];
    if (next) {
      const iso = next.toISOString();
      const days = calendarDaysAway(iso);
      data = {
        date: iso.split("T")[0],
        days_away: days,
        is_estimate: earnings?.isEarningsDateEstimate === true,
        label: formatLabel(next),
      };
    }
  } catch {
    try {
      const q = await yf.quote(key);
      const ts = q.earningsTimestampStart ?? q.earningsTimestamp;
      if (ts) {
        const d = new Date(ts);
        const days = calendarDaysAway(d.toISOString());
        if (days >= 0) {
          data = {
            date: d.toISOString().split("T")[0],
            days_away: days,
            is_estimate: false,
            label: formatLabel(d),
          };
        }
      }
    } catch {
      data = null;
    }
  }

  cache.set(key, { at: Date.now(), data });
  return data;
}
