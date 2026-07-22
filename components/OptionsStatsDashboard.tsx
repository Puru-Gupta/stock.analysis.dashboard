"use client";

import type { OptionsAnalysis } from "@/lib/api";
import type { OptionStatsBundle, TimeframeDistribution } from "@/lib/engines/option-stats";
import { normPdf } from "@/lib/engines/stats";
import { AlertTriangle, Info, Target, TrendingUp } from "lucide-react";

function colorVar(c: "green" | "yellow" | "red") {
  if (c === "green") return "var(--green)";
  if (c === "yellow") return "var(--amber)";
  return "var(--red)";
}

function SignalBadge({ signal }: { signal: string }) {
  const color =
    signal === "Extreme" ? "var(--red)" : signal === "Elevated" ? "var(--amber)" : "var(--fg-secondary)";
  return (
    <span className="font-mono text-xs" style={{ color }}>
      {signal}
    </span>
  );
}

function RatingPill({ rating, color }: { rating: string; color: "green" | "yellow" | "red" }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-[0.625rem]"
      style={{ background: `color-mix(in srgb, ${colorVar(color)} 15%, transparent)`, color: colorVar(color) }}
    >
      {rating}
    </span>
  );
}

function TopStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-md p-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <p className="field-label !mb-1">{label}</p>
      <p className="font-mono text-lg tabular-nums" style={{ color: accent || "var(--fg-primary)" }}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function DistributionCard({ d }: { d: TimeframeDistribution }) {
  return (
    <div className="rounded-md p-3 text-xs" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-medium" style={{ color: "var(--fg-primary)" }}>
          {d.label}
        </span>
        <SignalBadge signal={d.signal} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums" style={{ color: "var(--fg-secondary)" }}>
        <span>Mean</span>
        <span className="text-right">₹{d.mean}</span>
        <span>Std Dev</span>
        <span className="text-right">₹{d.std_dev}</span>
        <span>Current</span>
        <span className="text-right">₹{d.current}</span>
        <span>Z-Score</span>
        <span className="text-right" style={{ color: Math.abs(d.z_score) >= 2 ? "var(--amber)" : undefined }}>
          {d.z_score > 0 ? "+" : ""}
          {d.z_score}
        </span>
        <span>Percentile</span>
        <span className="text-right">{d.percentile}%</span>
        <span>Prob {d.direction === "below" ? "Below" : "Above"}</span>
        <span className="text-right">{d.prob_beyond_pct}%</span>
      </div>
      <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="mb-1 text-[0.625rem] uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
          Expected Range
        </p>
        <p className="font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
          68%: ₹{d.range_68[0]}–{d.range_68[1]}
        </p>
        <p className="font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
          95%: ₹{d.range_95[0]}–{d.range_95[1]}
        </p>
        <p className="font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
          99.7%: ₹{d.range_997[0]}–{d.range_997[1]}
        </p>
      </div>
    </div>
  );
}

function ExpectedMoveChart({ stats }: { stats: OptionStatsBundle }) {
  const { expected_move: em, distributions } = stats;
  const primary = distributions.find((d) => d.label === em.window_label) || distributions[0];
  if (!primary) return null;

  const mean = primary.mean;
  const std = primary.std_dev || 1;
  const minX = mean - 3.5 * std;
  const maxX = mean + 3.5 * std;
  const w = 400;
  const h = 100;
  const pad = 20;

  const toX = (price: number) => pad + ((price - minX) / (maxX - minX)) * (w - 2 * pad);
  const spotX = toX(em.spot);

  let path = "";
  for (let i = 0; i <= 80; i++) {
    const price = minX + (i / 80) * (maxX - minX);
    const z = (price - mean) / std;
    const y = h - pad - normPdf(z) * std * (h - 2 * pad) * 8;
    path += `${i === 0 ? "M" : "L"} ${toX(price).toFixed(1)} ${y.toFixed(1)}`;
  }

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      <svg viewBox={`0 0 ${w} ${h + 20}`} className="w-full h-36">
        <path d={`${path} L ${w - pad} ${h} L ${pad} ${h} Z`} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="1" />
        <line x1={spotX} y1={8} x2={spotX} y2={h} stroke="var(--accent)" strokeWidth="2" />
        <text x={spotX} y={h + 14} textAnchor="middle" fill="var(--accent)" fontSize="10">
          ₹{em.spot}
        </text>
      </svg>
    </div>
  );
}

function ConfidenceGauge({ score, label, warning }: { score: number; label: string; warning: boolean }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-1">
        <span className="font-mono text-2xl tabular-nums" style={{ color: warning ? "var(--amber)" : "var(--green)" }}>
          {score}
        </span>
        <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
          / 100 · {label}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted-fill)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: warning ? "var(--amber)" : "var(--green)",
          }}
        />
      </div>
      {warning && (
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--amber)" }}>
          Historical prices do not currently follow a stable normal distribution. Interpret probability estimates cautiously.
        </p>
      )}
    </div>
  );
}

export default function OptionsStatsDashboard({ analysis }: { analysis: OptionsAnalysis }) {
  const stats = analysis.stats;
  if (!stats) return null;

  const { volatility, health, recommendation, alerts, mean_reversion, confidence, focus } = stats;
  const riskColor = recommendation.risk === "Low" ? "green" : recommendation.risk === "Medium" ? "yellow" : "red";

  return (
    <div className="page-stack">
      {focus && focus.status !== "clean" && (
        <div
          className="card"
          style={{
            borderColor: focus.status === "avoid" ? "rgba(220,38,38,0.35)" : "rgba(201,162,39,0.35)",
            background: focus.status === "avoid" ? "var(--red-muted)" : "var(--amber-muted)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: focus.status === "avoid" ? "var(--red)" : "var(--amber)" }}>
            Focus: {focus.label}
            {focus.tags.length > 0 && (
              <span className="ml-2 font-normal text-xs" style={{ color: "var(--fg-secondary)" }}>
                {focus.tags.join(" · ")}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
            {focus.note}
          </p>
        </div>
      )}

      {/* Top row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <TopStat label="Spot" value={`₹${analysis.spot}`} sub={`${analysis.days_to_expiry} DTE`} accent="var(--accent)" />
        <TopStat label="Trend" value={health.trend_label} sub={health.trend} />
        <TopStat
          label="Vol Regime"
          value={stats.volatility_regime}
          accent={colorVar(stats.regime_color)}
        />
        <TopStat label="Confidence" value={`${confidence.score}`} sub={confidence.label} />
        <TopStat label="IV Rank" value={`${volatility.iv_rank}%`} sub={`${volatility.iv_percentile}th pct`} />
        <TopStat
          label="HV vs IV"
          value={`${volatility.iv_hv_ratio}x`}
          sub={`HV ${volatility.hv_20}% · IV ${volatility.implied_vol}%`}
          accent={volatility.iv_above_hv ? "var(--green)" : "var(--amber)"}
        />
      </div>

      {/* Volatility seller card */}
      <div
        className="card flex flex-wrap items-center justify-between gap-4"
        style={{
          borderColor: volatility.iv_above_hv ? "rgba(31,138,101,0.3)" : "var(--border)",
          background: volatility.iv_above_hv ? "var(--green-muted)" : undefined,
        }}
      >
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
            {volatility.iv_above_hv ? "IV Higher Than Historical" : "IV vs Historical Vol"}
          </p>
          <p className="mt-1 text-sm font-medium" style={{ color: volatility.iv_above_hv ? "var(--green)" : "var(--fg-primary)" }}>
            {volatility.seller_label}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--fg-secondary)" }}>
            HV 20d {volatility.hv_20}% · 60d {volatility.hv_60}% · 120d {volatility.hv_120}% · {volatility.iv_trend_label}
          </p>
          {volatility.seller_notes.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {volatility.seller_notes.map((note) => (
                <li key={note} className="text-xs" style={{ color: "var(--amber)" }}>
                  • {note}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl tracking-widest" style={{ color: "var(--amber)" }}>
            {volatility.seller_stars}
          </p>
          <p className="mt-1 font-mono text-[0.625rem] tabular-nums" style={{ color: "var(--fg-muted)" }}>
            Score {volatility.seller_favorability}/100
          </p>
        </div>
      </div>

      {/* Middle: comparison + expected move + mean reversion */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
            Distribution Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th>Timeframe</th>
                  <th>Z</th>
                  <th>Pct</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {stats.comparison.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="font-mono tabular-nums">
                      {row.z_score > 0 ? "+" : ""}
                      {row.z_score}
                    </td>
                    <td className="font-mono tabular-nums">{row.percentile}%</td>
                    <td>
                      <SignalBadge signal={row.signal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card lg:col-span-1">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
            Expected Move ({stats.expected_move.window_label})
          </h3>
          <ExpectedMoveChart stats={stats} />
          <div className="mt-3 space-y-2 font-mono text-xs tabular-nums" style={{ color: "var(--fg-secondary)" }}>
            <div className="flex justify-between">
              <span>1σ</span>
              <span>
                ₹{stats.expected_move.sigma_1[0]} – ₹{stats.expected_move.sigma_1[1]}
              </span>
            </div>
            <div className="flex justify-between">
              <span>2σ</span>
              <span>
                ₹{stats.expected_move.sigma_2[0]} – ₹{stats.expected_move.sigma_2[1]}
              </span>
            </div>
            <div className="flex justify-between">
              <span>3σ</span>
              <span>
                ₹{stats.expected_move.sigma_3[0]} – ₹{stats.expected_move.sigma_3[1]}
              </span>
            </div>
          </div>
        </div>

        <div className="card lg:col-span-1">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
            Mean Reversion Meter
          </h3>
          <p className="font-mono text-3xl tabular-nums" style={{ color: Math.abs(mean_reversion.z_score) >= 2 ? "var(--amber)" : "var(--fg-primary)" }}>
            {mean_reversion.z_score > 0 ? "+" : ""}
            {mean_reversion.z_score}σ
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-secondary)" }}>
            {mean_reversion.dist_from_mean > 0 ? "+" : ""}₹{mean_reversion.dist_from_mean} from {mean_reversion.window_label} mean
          </p>
          <p className="mt-3 text-sm">
            Reversion probability:{" "}
            <strong style={{ color: mean_reversion.probability === "High" ? "var(--green)" : "var(--fg-primary)" }}>
              {mean_reversion.probability}
            </strong>
          </p>
          <p className="mt-2 text-lg tracking-widest" style={{ color: "var(--amber)" }}>
            {mean_reversion.stars}
          </p>
        </div>
      </div>

      {/* Multi-timeframe cards */}
      <div>
        <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
          Multi-Timeframe Normal Distribution
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.distributions.map((d) => (
            <DistributionCard key={d.key} d={d} />
          ))}
        </div>
      </div>

      {/* Statistical health + confidence */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
            Statistical Health
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Trend", health.trend_label],
              ["Current Percentile", `${health.current_percentile}%`],
              ["Historical Percentile", `${health.historical_percentile}%`],
              ["Distribution Position", health.distribution_position],
              ["Std Dev", `₹${health.std_dev}`],
              ["Vol Regime", health.volatility_regime],
              ["Probability Rating", health.probability_rating],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md px-3 py-2" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <p style={{ color: "var(--fg-muted)" }}>{k}</p>
                <p className="font-mono tabular-nums mt-0.5" style={{ color: "var(--fg-primary)" }}>
                  {v}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
            Distribution Confidence
          </h3>
          <ConfidenceGauge score={confidence.score} label={confidence.label} warning={confidence.warning} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-[0.625rem] font-mono tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
            <span>Skew {confidence.factors.skewness}</span>
            <span>Kurt {confidence.factors.kurtosis}</span>
            <span>Outliers {confidence.factors.outlier_pct}%</span>
            <span>n={confidence.factors.sample_size}</span>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="card" style={{ borderColor: "rgba(245,78,0,0.25)" }}>
        <div className="flex items-start gap-3">
          <Target className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
              Recommended Action
            </p>
            <p className="text-xl font-medium mt-1" style={{ color: "var(--accent)" }}>
              {recommendation.action}
              {recommendation.suggested_strike > 0 && (
                <span style={{ color: "var(--fg-primary)" }}>
                  {" "}
                  · {recommendation.suggested_strike} {recommendation.option_type}
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-mono tabular-nums">
              <span>P(OTM) {recommendation.prob_otm}%</span>
              <span>P(Touch) {recommendation.prob_touch}%</span>
              <span>
                Risk{" "}
                <RatingPill rating={recommendation.risk} color={riskColor} />
              </span>
              <span>Confidence {recommendation.confidence}%</span>
            </div>
            <ul className="mt-3 space-y-1">
              {recommendation.reasons.map((r, i) => (
                <li key={i} className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                  • {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Strike probabilities */}
      <div className="card">
        <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
          Option Chain — Strike Probabilities
        </h3>
        {stats.strike_probabilities.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            No live chain strikes — probabilities require NSE option data.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th>Strike</th>
                  <th>Type</th>
                  <th>Premium</th>
                  <th>Dist σ</th>
                  <th>P(OTM)</th>
                  <th>P(ITM)</th>
                  <th>P(Touch)</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {stats.strike_probabilities.map((s) => (
                  <tr key={`${s.type}-${s.strike}`}>
                    <td className="font-medium">₹{s.strike}</td>
                    <td>{s.type}</td>
                    <td className="font-mono tabular-nums">₹{s.premium}</td>
                    <td className="font-mono tabular-nums">{s.dist_sigma}σ</td>
                    <td className="font-mono tabular-nums" style={{ color: s.prob_otm >= 85 ? "var(--green)" : undefined }}>
                      {s.prob_otm}%
                    </td>
                    <td className="font-mono tabular-nums">{s.prob_itm}%</td>
                    <td className="font-mono tabular-nums">{s.prob_touch}%</td>
                    <td>
                      <RatingPill rating={s.rating} color={s.rating_color} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Smart alerts */}
      {alerts.length > 0 && (
        <div className="card">
          <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)] mb-3">
            Smart Alerts
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {alerts.map((a) => {
              const Icon = a.type === "warning" ? AlertTriangle : a.type === "opportunity" ? TrendingUp : Info;
              const color = a.type === "warning" ? "var(--amber)" : a.type === "opportunity" ? "var(--green)" : "var(--fg-secondary)";
              return (
                <div
                  key={a.id}
                  className="flex gap-2 rounded-md p-3 text-xs"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                  <div>
                    <p className="font-medium" style={{ color: "var(--fg-primary)" }}>
                      {a.title}
                    </p>
                    <p className="mt-0.5 leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
                      {a.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
