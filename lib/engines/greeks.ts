/** Black-Scholes pricing and Greeks for Indian equity/index options. */

const RISK_FREE_RATE = 0.065; // ~6.5% India T-bill proxy

function normPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export interface GreeksResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export function blackScholesGreeks(
  spot: number,
  strike: number,
  vol: number,
  daysToExpiry: number,
  type: "call" | "put",
  rate = RISK_FREE_RATE,
): GreeksResult {
  if (spot <= 0 || strike <= 0 || vol <= 0 || daysToExpiry <= 0) {
    return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  const t = daysToExpiry / 365;
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol ** 2) * t) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const npd1 = normPdf(d1);

  let price: number;
  let delta: number;
  if (type === "call") {
    price = spot * nd1 - strike * Math.exp(-rate * t) * nd2;
    delta = nd1;
  } else {
    price = strike * Math.exp(-rate * t) * normCdf(-d2) - spot * normCdf(-d1);
    delta = nd1 - 1;
  }

  const gamma = npd1 / (spot * vol * sqrtT);
  const vega = (spot * npd1 * sqrtT) / 100;

  const thetaAnnual =
    type === "call"
      ? (-spot * npd1 * vol) / (2 * sqrtT) - rate * strike * Math.exp(-rate * t) * nd2
      : (-spot * npd1 * vol) / (2 * sqrtT) + rate * strike * Math.exp(-rate * t) * normCdf(-d2);
  const theta = thetaAnnual / 365;

  return {
    price: Math.max(0, price),
    delta: Math.round(delta * 1000) / 1000,
    gamma: Math.round(gamma * 10000) / 10000,
    theta: Math.round(theta * 100) / 100,
    vega: Math.round(vega * 100) / 100,
  };
}

export function daysToExpiryFromNseDate(expiryStr: string): number {
  const m = expiryStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return 30;
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const mon = months[m[2]];
  if (!mon) return 30;
  const expiry = new Date(`${m[3]}-${mon}-${m[1].padStart(2, "0")}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(Math.ceil((expiry.getTime() - now.getTime()) / 86400000), 1);
}
