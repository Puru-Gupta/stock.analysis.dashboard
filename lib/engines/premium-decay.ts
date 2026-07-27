import { blackScholesGreeks } from "./greeks";
import type { UpcomingEarnings } from "@/lib/data/earnings-calendar";

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface PremiumDecayWeek {
  week: number;
  label: string;
  dte_start: number;
  dte_end: number;
  days_in_week: number;
  premium_start: number;
  premium_end: number;
  premium_left: number;
  decay_this_week: number;
  pct_collected: number;
  pct_this_week: number;
  is_fast_zone: boolean;
  event_warning?: string;
}

export interface PremiumDecayTimeline {
  strike: number;
  option_type: "call" | "put";
  expiry: string;
  days_to_expiry: number;
  initial_premium: number;
  live_premium?: number;
  model: "live" | "theoretical";
  vol: number;
  weeks: PremiumDecayWeek[];
  fastest_weeks: number[];
  total_decay: number;
  note: string;
}

export interface ExpiryDecayLeg {
  expiry: string;
  days_to_expiry: number;
  premium: number;
  timeline: PremiumDecayWeek[];
  avg_decay_per_week: number;
  total_decay: number;
}

export interface ExpiryDecayComparison {
  strike: number;
  option_type: "call" | "put";
  near: ExpiryDecayLeg;
  far: ExpiryDecayLeg;
  recommendation: string;
}

function modeledPremium(
  spot: number,
  strike: number,
  vol: number,
  dte: number,
  optionType: "call" | "put",
  scale: number,
) {
  if (dte <= 0) return 0;
  const g = blackScholesGreeks(spot, strike, vol, dte, optionType);
  return r2(g.price * scale);
}

function weekLabel(week: number, totalWeeks: number, dteEnd: number) {
  if (dteEnd <= 0) return "Expiry week";
  if (week === totalWeeks) return "Final week";
  return `Week ${week}`;
}

function earningsWarningForWeek(
  weekStartDay: number,
  weekEndDay: number,
  earnings?: Pick<UpcomingEarnings, "days_away" | "label"> | null,
) {
  if (!earnings || earnings.days_away == null) return undefined;
  const d = earnings.days_away;
  if (d >= weekStartDay && d < weekEndDay) {
    return `Results ${earnings.label} falls in this window`;
  }
  return undefined;
}

/** Week-by-week modeled premium decay (flat spot & IV). Scales to live premium when provided. */
export function buildPremiumDecayTimeline(input: {
  spot: number;
  strike: number;
  vol: number;
  daysToExpiry: number;
  optionType: "call" | "put";
  livePremium?: number;
  expiry?: string;
  earnings?: Pick<UpcomingEarnings, "days_away" | "label"> | null;
}): PremiumDecayTimeline {
  const { spot, strike, vol, daysToExpiry, optionType, livePremium, expiry = "N/A", earnings } = input;
  const dte = Math.max(1, Math.round(daysToExpiry));
  const bsStart = blackScholesGreeks(spot, strike, vol, dte, optionType).price;
  const scale = livePremium && bsStart > 0 ? livePremium / bsStart : 1;
  const initial = r2(livePremium ?? bsStart * scale);

  const weeks: PremiumDecayWeek[] = [];
  let dteCursor = dte;
  let weekNum = 0;
  let dayOffset = 0;

  while (dteCursor > 0) {
    weekNum += 1;
    const daysInWeek = Math.min(7, dteCursor);
    const dteStart = dteCursor;
    const dteEnd = Math.max(0, dteCursor - daysInWeek);
    const premiumStart = modeledPremium(spot, strike, vol, dteStart, optionType, scale);
    const premiumEnd = modeledPremium(spot, strike, vol, dteEnd, optionType, scale);
    const decay = r2(Math.max(0, premiumStart - premiumEnd));
    const pctCollected = initial > 0 ? r2(((initial - premiumEnd) / initial) * 100) : 0;
    const pctThisWeek = initial > 0 ? r2((decay / initial) * 100) : 0;
    const eventWarning = earningsWarningForWeek(dayOffset, dayOffset + daysInWeek, earnings);

    weeks.push({
      week: weekNum,
      label: weekLabel(weekNum, 99, dteEnd),
      dte_start: dteStart,
      dte_end: dteEnd,
      days_in_week: daysInWeek,
      premium_start: premiumStart,
      premium_end: premiumEnd,
      premium_left: premiumEnd,
      decay_this_week: decay,
      pct_collected: pctCollected,
      pct_this_week: pctThisWeek,
      is_fast_zone: dteStart <= 14,
      event_warning: eventWarning,
    });

    dayOffset += daysInWeek;
    dteCursor = dteEnd;
  }

  // Relabel final week
  if (weeks.length) weeks[weeks.length - 1].label = weeks.length === 1 ? "Final week" : `Week ${weeks.length} (final)`;

  const fastestWeeks = [...weeks]
    .sort((a, b) => b.decay_this_week - a.decay_this_week)
    .slice(0, 2)
    .map((w) => w.week);

  const totalDecay = r2(initial - (weeks.at(-1)?.premium_left ?? 0));

  return {
    strike,
    option_type: optionType,
    expiry,
    days_to_expiry: dte,
    initial_premium: initial,
    live_premium: livePremium,
    model: livePremium ? "live" : "theoretical",
    vol: r2(vol * 100) / 100,
    weeks,
    fastest_weeks: fastestWeeks,
    total_decay: totalDecay,
    note: "Modeled decay assumes flat spot and IV. Real premium also moves with price and vol changes.",
  };
}

export function legPremiumAtExpiry(
  legs: { strike: number; expiry: string; ltp: number; type: string }[],
  strike: number,
  expiry: string,
  type: "CE" | "PE",
) {
  const leg = legs.find((l) => l.type === type && l.strike === strike && l.expiry === expiry && l.ltp > 0);
  return leg?.ltp ?? null;
}

/** Compare nearest two expiries at the same strike for decay efficiency. */
export function compareNearestExpiries(input: {
  spot: number;
  strike: number;
  vol: number;
  optionType: "call" | "put";
  expiries: string[];
  dteForExpiry: (expiry: string) => number;
  premiumForExpiry: (expiry: string) => number | null;
  earnings?: Pick<UpcomingEarnings, "days_away" | "label"> | null;
}): ExpiryDecayComparison | null {
  const unique = [...new Set(input.expiries.filter(Boolean))];
  if (unique.length < 2) return null;

  const nearExpiry = unique[0];
  const farExpiry = unique[1];
  const nearDte = input.dteForExpiry(nearExpiry);
  const farDte = input.dteForExpiry(farExpiry);
  if (nearDte <= 0 || farDte <= nearDte) return null;

  const buildLeg = (expiry: string, dte: number): ExpiryDecayLeg => {
    const live = input.premiumForExpiry(expiry);
    const timeline = buildPremiumDecayTimeline({
      spot: input.spot,
      strike: input.strike,
      vol: input.vol,
      daysToExpiry: dte,
      optionType: input.optionType,
      livePremium: live ?? undefined,
      expiry,
      earnings: input.earnings,
    }).weeks;
    const totalDecay = timeline.length ? timeline[0].premium_start - timeline.at(-1)!.premium_left : 0;
    const avg = timeline.length ? r2(totalDecay / timeline.length) : 0;
    return {
      expiry,
      days_to_expiry: dte,
      premium: live ?? timeline[0]?.premium_start ?? 0,
      timeline,
      avg_decay_per_week: avg,
      total_decay: r2(totalDecay),
    };
  };

  const near = buildLeg(nearExpiry, nearDte);
  const far = buildLeg(farExpiry, farDte);

  let recommendation = "";
  if (near.avg_decay_per_week > far.avg_decay_per_week * 1.15) {
    recommendation = `Near expiry (${nearExpiry}) collects ~${near.avg_decay_per_week}₹/week vs ${far.avg_decay_per_week}₹/week — faster theta if you accept shorter runway.`;
  } else if (far.avg_decay_per_week > near.avg_decay_per_week * 1.15) {
    recommendation = `Far expiry (${farExpiry}) pays more total premium (₹${far.premium}) with steadier weekly decay — better if you want more buffer from spot moves.`;
  } else {
    recommendation = `Both expiries have similar weekly decay (~₹${near.avg_decay_per_week}/wk near vs ₹${far.avg_decay_per_week}/wk far). Pick based on event risk and margin.`;
  }

  return {
    strike: input.strike,
    option_type: input.optionType,
    near,
    far,
    recommendation,
  };
}
