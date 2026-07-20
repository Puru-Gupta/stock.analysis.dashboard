"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAPI, SellerBoard, SellerContract, SellerPick } from "@/lib/api";
import { LoadingSpinner, ErrorMessage } from "@/components/Sidebar";
import { Search, Sparkles, X, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useAppCache } from "@/components/AppCacheProvider";

const CACHE_KEY = "options_seller";

type SellerCache = {
  symbol: string;
  typeFilter: string;
  board: SellerBoard | null;
  picks?: SellerPick[];
  picksLoaded?: boolean;
};

function isMarketOpenIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 555 && mins <= 930; // 09:15–15:30 IST
}

function RatingBadge({ c }: { c: SellerContract }) {
  const cls =
    c.rating === "strong_sell" || c.rating === "good_sell"
      ? "badge-buy"
      : c.rating === "watch"
        ? "badge-watch"
        : "badge-sell";
  const dot = c.rating === "watch" ? "🟡" : c.rating === "avoid" ? "🔴" : "🟢";
  return (
    <span className={cls}>
      {dot} {c.rating_label}
    </span>
  );
}

function Stars({ score }: { score: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(score / 20)));
  return (
    <span className="tracking-[0.2em] text-base" aria-label={`${filled} of 5 stars`}>
      <span style={{ color: "var(--amber)" }}>{"★".repeat(filled)}</span>
      <span style={{ color: "var(--border-strong)" }}>{"★".repeat(5 - filled)}</span>
    </span>
  );
}

function qualityText(q: SellerContract["premium_quality"]) {
  if (q === "overpriced") return { text: "Premium appears Overpriced", color: "var(--green)" };
  if (q === "cheap") return { text: "Premium Cheap — Avoid Selling", color: "var(--red)" };
  return { text: "Premium Fairly Priced", color: "var(--fg-primary)" };
}

function trendColor(word: string) {
  if (word === "Sideways") return "var(--green)";
  if (word === "Highly Volatile") return "var(--red)";
  return "var(--amber)";
}

function ExpectedMoveVisual({ board, contract }: { board: SellerBoard; contract: SellerContract }) {
  const [low, high] = board.expected_range;
  const { spot } = board;
  const strike = contract.strike;
  const pad = Math.max(board.expected_move * 0.6, Math.abs(strike - spot) * 0.25, spot * 0.005);
  const min = Math.min(low, strike) - pad;
  const max = Math.max(high, strike) + pad;
  const x = (v: number) => 16 + ((v - min) / (max - min)) * 368;
  const ok = contract.outside_em;
  const strikeColor = ok ? "var(--green)" : "var(--red)";

  return (
    <div>
      <svg viewBox="0 0 400 74" className="w-full">
        <line x1="16" y1="30" x2="384" y2="30" stroke="var(--border-strong)" strokeWidth="1.5" />
        {/* expected move band */}
        <line x1={x(low)} y1="30" x2={x(high)} y2="30" stroke="var(--amber)" strokeWidth="3" opacity="0.55" />
        <line x1={x(low)} y1="20" x2={x(low)} y2="40" stroke="var(--amber)" strokeWidth="1.5" />
        <line x1={x(high)} y1="20" x2={x(high)} y2="40" stroke="var(--amber)" strokeWidth="1.5" />
        {/* spot */}
        <line x1={x(spot)} y1="16" x2={x(spot)} y2="44" stroke="var(--fg-tertiary)" strokeWidth="1" strokeDasharray="3" />
        {/* strike */}
        <circle cx={x(strike)} cy="30" r="6" fill={strikeColor} />
        <text x={x(low)} y="58" textAnchor="middle" fontSize="10" fill="var(--fg-tertiary)" fontFamily="var(--font-mono)">
          {Math.round(low)}
        </text>
        <text x={x(spot)} y="14" textAnchor="middle" fontSize="10" fill="var(--fg-secondary)" fontFamily="var(--font-mono)">
          {Math.round(spot)}
        </text>
        <text x={x(high)} y="58" textAnchor="middle" fontSize="10" fill="var(--fg-tertiary)" fontFamily="var(--font-mono)">
          {Math.round(high)}
        </text>
        <text x={x(strike)} y="70" textAnchor="middle" fontSize="10" fill={strikeColor} fontFamily="var(--font-mono)">
          {contract.strike} {contract.type}
        </text>
      </svg>
      <p className="mt-1 text-center text-xs" style={{ color: ok ? "var(--green)" : "var(--red)" }}>
        {ok ? "Strike is outside the expected move" : "Strike is inside the expected move — assignment risk"}
      </p>
    </div>
  );
}

function SmileChart({ board }: { board: SellerBoard }) {
  const pts = board.smile.filter((s) => s.ce_iv != null || s.pe_iv != null);
  if (pts.length < 3) return <p className="text-xs" style={{ color: "var(--fg-muted)" }}>Volatility smile needs a live chain.</p>;
  const ivs = pts.flatMap((p) => [p.ce_iv, p.pe_iv]).filter((v): v is number => v != null);
  const minIv = Math.min(...ivs);
  const maxIv = Math.max(...ivs, minIv + 1);
  const minK = pts[0].strike;
  const maxK = pts[pts.length - 1].strike;
  const x = (k: number) => 8 + ((k - minK) / (maxK - minK || 1)) * 344;
  const y = (iv: number) => 66 - ((iv - minIv) / (maxIv - minIv)) * 56;
  const path = (key: "ce_iv" | "pe_iv") =>
    pts
      .filter((p) => p[key] != null)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.strike).toFixed(1)} ${y(p[key]!).toFixed(1)}`)
      .join(" ");
  return (
    <div>
      <svg viewBox="0 0 360 80" className="w-full">
        <path d={path("ce_iv")} fill="none" stroke="var(--green)" strokeWidth="1.5" />
        <path d={path("pe_iv")} fill="none" stroke="var(--red)" strokeWidth="1.5" />
      </svg>
      <p className="text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
        IV by strike — <span style={{ color: "var(--green)" }}>Calls</span> · <span style={{ color: "var(--red)" }}>Puts</span>
      </p>
    </div>
  );
}

function AdvancedRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs" style={{ color: "var(--fg-tertiary)" }}>{label}</span>
      <span className="font-mono text-xs tabular-nums" style={{ color: "var(--fg-primary)" }}>{value}</span>
    </div>
  );
}

function AnalysisPanel({
  board,
  contract,
  onClose,
}: {
  board: SellerBoard;
  contract: SellerContract;
  onClose: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    document.body.classList.add("modal-open");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const q = qualityText(contract.premium_quality);
  const sellOk = contract.decision === "sell";
  const edgePositive = contract.premium_edge > 0;
  const riskColor =
    contract.risk.level === "low" ? "var(--green)" : contract.risk.level === "medium" ? "var(--amber)" : "var(--red)";

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AI Analysis"
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto"
        style={{ background: "var(--bg-card)", borderLeft: "1px solid var(--border-strong)", boxShadow: "var(--shadow-flyout)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h2 className="text-base font-normal tracking-[-0.02em]" style={{ color: "var(--fg-primary)" }}>
              <Sparkles className="mr-1.5 inline h-4 w-4" style={{ color: "var(--accent)" }} />
              AI Analysis
            </h2>
            <p className="font-mono text-xs tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
              {board.symbol.replace(".NS", "")} · {contract.strike} {contract.type} · ₹{contract.premium} · {board.days_to_expiry} DTE
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !p-2" aria-label="Close panel">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Seller Score + Premium Edge heroes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md p-4 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <p className="field-label !mb-1">Seller Score</p>
              <p className="font-mono text-3xl tabular-nums" style={{ color: "var(--fg-primary)" }}>
                {contract.seller_score}
                <span className="text-sm" style={{ color: "var(--fg-muted)" }}> /100</span>
              </p>
              <Stars score={contract.seller_score} />
              <div className="mt-1"><RatingBadge c={contract} /></div>
            </div>
            <div className="rounded-md p-4 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <p className="field-label !mb-1">Premium Edge</p>
              {contract.premium_edge_ok ? (
                <>
                  <p className="font-mono text-3xl tabular-nums" style={{ color: edgePositive ? "var(--green)" : "var(--red)" }}>
                    {edgePositive ? "+" : ""}{Math.round(contract.premium_edge)}%
                  </p>
                  <p className="mt-1 text-xs" style={{ color: edgePositive ? "var(--green)" : "var(--red)" }}>
                    {contract.premium_edge >= 12 ? "Overpriced" : contract.premium_edge <= -8 ? "Underpriced" : "Near Fair Value"}
                  </p>
                  <p className="mt-1 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
                    vs fair ₹{contract.fair_premium}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-mono text-3xl tabular-nums" style={{ color: "var(--fg-muted)" }}>—</p>
                  <p className="mt-1 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
                    Premium too small for a reliable fair-value comparison
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Decision banner */}
          <div
            className="rounded-md px-4 py-3 text-center text-sm font-medium"
            style={{
              background: sellOk ? "var(--green-muted)" : "var(--red-muted)",
              color: sellOk ? "var(--green)" : "var(--red)",
              border: `1px solid ${sellOk ? "var(--green)" : "var(--red)"}33`,
            }}
          >
            {sellOk ? "Sell — all conditions met" : "Avoid Selling"}
          </div>

          {/* Simple facts */}
          <div className="space-y-0">
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>Probability of Profit</span>
              <span className="font-mono text-lg tabular-nums" style={{ color: contract.pop >= 85 ? "var(--green)" : "var(--fg-primary)" }}>
                {Math.round(contract.pop)}%
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>Premium Quality</span>
              <span className="text-sm" style={{ color: q.color }}>{q.text}</span>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>Trend</span>
              <span className="text-sm font-medium" style={{ color: trendColor(board.trend_word) }}>{board.trend_word}</span>
            </div>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>Risk</span>
              <span className="text-sm font-medium capitalize" style={{ color: riskColor }}>
                {contract.risk.level}
                {contract.risk.reasons.length > 0 && (
                  <span className="ml-2 text-xs font-normal" style={{ color: "var(--fg-tertiary)" }}>
                    ({contract.risk.reasons.join(" · ")})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* AI Recommendation */}
          <div className="rounded-md p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <p className="field-label !mb-2">AI Recommendation</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--fg-primary)" }}>
              {contract.recommendation}
            </p>
          </div>

          {/* Expected Move */}
          <div>
            <p className="field-label !mb-2">Expected Move</p>
            <ExpectedMoveVisual board={board} contract={contract} />
          </div>

          {/* Advanced — collapsed by default */}
          <div className="rounded-md" style={{ border: "1px solid var(--border)" }}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm"
              style={{ color: "var(--fg-secondary)" }}
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              Advanced
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showAdvanced && (
              <div className="px-4 pb-4">
                <AdvancedRow label="Delta" value={contract.advanced.delta} />
                <AdvancedRow label="Gamma" value={contract.advanced.gamma} />
                <AdvancedRow label="Theta (per day)" value={`₹${contract.advanced.theta}`} />
                <AdvancedRow label="Vega" value={contract.advanced.vega} />
                <AdvancedRow label="Contract IV" value={`${contract.advanced.iv}%`} />
                <AdvancedRow label="IV Rank (est.)" value={board.iv_rank} />
                <AdvancedRow label="IV Percentile (est.)" value={board.iv_percentile} />
                <AdvancedRow label="IV / HV Ratio" value={`${board.iv_hv_ratio}x`} />
                <AdvancedRow label="Open Interest" value={contract.advanced.oi.toLocaleString("en-IN")} />
                <AdvancedRow label="OI Change" value={contract.advanced.oi_change.toLocaleString("en-IN")} />
                <AdvancedRow label="Volume" value={contract.advanced.volume.toLocaleString("en-IN")} />
                <AdvancedRow
                  label="Bid–Ask Spread"
                  value={contract.advanced.bid_ask_spread_pct != null ? `${contract.advanced.bid_ask_spread_pct}%` : "—"}
                />
                <AdvancedRow label="Put–Call Ratio (OI)" value={board.pcr ?? "—"} />
                <AdvancedRow label="Max Pain" value={board.max_pain != null ? `₹${board.max_pain}` : "—"} />
                <div className="pt-3">
                  <p className="field-label !mb-1">Volatility Smile</p>
                  <SmileChart board={board} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SellerAssistant() {
  const cache = useAppCache();
  const cached = cache.get<SellerCache>(CACHE_KEY);
  const [symbol, setSymbol] = useState(cached?.symbol ?? "NIFTY");
  const [typeFilter, setTypeFilter] = useState(cached?.typeFilter ?? "all");
  const [board, setBoard] = useState<SellerBoard | null>(cached?.board ?? null);
  const [picks, setPicks] = useState<SellerPick[]>(cached?.picks ?? []);
  const [picksLoaded, setPicksLoaded] = useState(cached?.picksLoaded ?? false);
  const [picksLoading, setPicksLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SellerContract | null>(null);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const picksRef = useRef({ picks, picksLoaded });
  picksRef.current = { picks, picksLoaded };

  const analyze = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else {
        setLoading(true);
        setError("");
      }
      try {
        const data = await fetchAPI<SellerBoard>(
          `/api/options/seller?symbol=${encodeURIComponent(symbolRef.current)}`,
        );
        if (data.error) {
          if (!silent) setError(data.error);
          return;
        }
        setBoard(data);
        cache.set(CACHE_KEY, {
          symbol: symbolRef.current,
          typeFilter,
          board: data,
          picks: picksRef.current.picks,
          picksLoaded: picksRef.current.picksLoaded,
        });
        // Keep the open panel in sync after a live refresh
        setSelected((prev) =>
          prev ? data.contracts.find((c) => c.type === prev.type && c.strike === prev.strike) ?? prev : prev,
        );
      } catch (e) {
        if (!silent) {
          setError(e instanceof Error ? e.message : "Analysis failed");
          setBoard(null);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cache, typeFilter],
  );

  // Live updates during market hours (every 2 minutes)
  useEffect(() => {
    if (!board) return;
    const id = setInterval(() => {
      if (isMarketOpenIST()) analyze(true);
    }, 120000);
    return () => clearInterval(id);
  }, [board, analyze]);

  const loadPicks = useCallback(async () => {
    setPicksLoading(true);
    try {
      const data = await fetchAPI<SellerPick[]>("/api/options/seller/scan?limit=12");
      setPicks(data);
      setPicksLoaded(true);
      const saved = cache.get<SellerCache>(CACHE_KEY);
      cache.set(CACHE_KEY, {
        symbol: symbolRef.current,
        typeFilter,
        board: saved?.board ?? null,
        picks: data,
        picksLoaded: true,
      });
    } catch {
      setPicks([]);
      setPicksLoaded(true);
    } finally {
      setPicksLoading(false);
    }
  }, [cache, typeFilter]);

  // Load suggestions once on first open
  const picksAutoloaded = useRef(false);
  useEffect(() => {
    if (picksAutoloaded.current || picksLoaded) return;
    picksAutoloaded.current = true;
    loadPicks();
  }, [picksLoaded, loadPicks]);

  const analyzeSymbol = useCallback(
    (sym: string) => {
      setSymbol(sym);
      symbolRef.current = sym;
      analyze();
    },
    [analyze],
  );

  const contracts = (board?.contracts ?? []).filter(
    (c) => typeFilter === "all" || c.type === (typeFilter === "call" ? "CE" : "PE"),
  );

  return (
    <div className="page-stack">
      <div className="product-panel">
        <div className="product-section">
          <p className="product-label">Underlying</p>
          <div className="product-query-row">
            <input
              className="product-query-input"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              placeholder="NIFTY, BANKNIFTY, RELIANCE.NS"
              spellCheck={false}
              autoCapitalize="characters"
            />
            <div className="product-query-actions">
              <button type="button" onClick={() => analyze()} disabled={loading} className="product-action-primary">
                <Search className="h-3.5 w-3.5" />
                Analyze
              </button>
            </div>
          </div>
        </div>
        <div className="product-divider" />
        <div className="product-section">
          <p className="product-label">Show</p>
          <div className="pill-group" role="group">
            {(
              [
                { value: "all", label: "All" },
                { value: "call", label: "Calls" },
                { value: "put", label: "Puts" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTypeFilter(value)}
                className={`pill ${typeFilter === value ? "pill-active" : ""}`}
                aria-pressed={typeFilter === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Suggested stocks to explore for option selling */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Suggested Stocks for Option Selling
            </h3>
            <p className="text-xs" style={{ color: "var(--fg-tertiary)" }}>
              Liquid F&amp;O names ranked by sell-readiness — click one to score its option chain
            </p>
          </div>
          <button
            onClick={loadPicks}
            className="btn-secondary flex items-center gap-2 text-xs shrink-0"
            disabled={picksLoading}
          >
            <RefreshCw className={`h-3 w-3 ${picksLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {picksLoading ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            Scanning NIFTY 50 liquid names for range-bound, seller-friendly setups...
          </p>
        ) : picks.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            {picksLoaded ? "No seller-friendly stocks found right now." : "Click Refresh to scan for seller-friendly stocks."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Sell-Readiness</th>
                  <th>Trend</th>
                  <th>15d Move</th>
                  <th>HV</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => (
                  <tr key={p.symbol} onClick={() => analyzeSymbol(p.symbol)} className="cursor-pointer">
                    <td className="font-medium">{p.name}</td>
                    <td className="font-mono tabular-nums" style={{ color: p.score >= 80 ? "var(--green)" : p.score >= 60 ? "var(--accent)" : "var(--fg-tertiary)" }}>
                      {p.score}
                    </td>
                    <td className="text-xs" style={{ color: trendColor(p.trend_word) }}>{p.trend_word}</td>
                    <td className="font-mono text-xs tabular-nums" style={{ color: Math.abs(p.days_15) < 3 ? "var(--green)" : "var(--fg-tertiary)" }}>
                      {p.days_15 > 0 ? "+" : ""}{p.days_15}%
                    </td>
                    <td className="font-mono text-xs tabular-nums">{p.hv}%</td>
                    <td className="max-w-[240px] truncate text-xs" style={{ color: "var(--fg-secondary)" }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!board && !loading && !error && (
        <div className="card text-center">
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            Pick a suggested stock above, or enter any underlying and click <strong>Analyze</strong>. Every contract gets a{" "}
            <strong>Seller Score</strong> answering one question: should I sell this option right now?
          </p>
        </div>
      )}

      {board && !loading && (
        <>
          {/* Minimal context strip */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="font-mono text-sm tabular-nums" style={{ color: "var(--fg-primary)" }}>
                  {board.symbol.replace(".NS", "")} · ₹{board.spot}
                </span>
                <span className="font-mono text-xs tabular-nums" style={{ color: "var(--fg-tertiary)" }}>
                  Expiry {board.expiry} ({board.days_to_expiry} DTE)
                </span>
                <span className="text-xs">
                  Trend:{" "}
                  <span style={{ color: trendColor(board.trend_word) }}>{board.trend_word}</span>
                </span>
                <span className="text-xs">
                  Event Risk:{" "}
                  <span style={{ color: board.event_risk === "low" ? "var(--green)" : "var(--red)" }}>
                    {board.event_risk === "low" ? "Low" : "Elevated"}
                  </span>
                </span>
              </div>
              <button
                onClick={() => analyze(true)}
                className="btn-secondary flex items-center gap-2 text-xs shrink-0"
                disabled={refreshing}
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Updating" : "Refresh"}
              </button>
            </div>
            {board.note && (
              <p className="mt-2 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>{board.note}</p>
            )}
          </div>

          {/* Contracts table */}
          <div className="card">
            <h3 className="card-section-title !normal-case !tracking-normal !text-sm !text-[var(--fg-primary)]">
              Should I sell this option?
            </h3>
            {contracts.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>No contracts to score for this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Contract</th>
                      <th>Premium</th>
                      <th>Prob. of Profit</th>
                      <th>Premium Edge</th>
                      <th>Seller Score</th>
                      <th>Rating</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => (
                      <tr key={`${c.type}-${c.strike}`} onClick={() => setSelected(c)} className="cursor-pointer">
                        <td className="font-medium font-mono tabular-nums">
                          {c.strike} {c.type}
                        </td>
                        <td className="font-mono tabular-nums">₹{c.premium}</td>
                        <td className="font-mono tabular-nums" style={{ color: c.pop >= 85 ? "var(--green)" : "var(--fg-primary)" }}>
                          {Math.round(c.pop)}%
                        </td>
                        <td className="font-mono tabular-nums" style={{ color: !c.premium_edge_ok ? "var(--fg-muted)" : c.premium_edge > 0 ? "var(--green)" : c.premium_edge < 0 ? "var(--red)" : "var(--fg-tertiary)" }}>
                          {c.premium_edge_ok ? `${c.premium_edge > 0 ? "+" : ""}${Math.round(c.premium_edge)}%` : "—"}
                        </td>
                        <td className="font-mono tabular-nums" style={{ color: "var(--accent)" }}>{c.seller_score}</td>
                        <td><RatingBadge c={c} /></td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(c);
                            }}
                          >
                            <Sparkles className="h-3 w-3" style={{ color: "var(--accent)" }} />
                            AI Analysis
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[0.625rem]" style={{ color: "var(--fg-muted)" }}>
              Scores weight IV rank, IV vs realized vol, probability of profit, distance beyond the expected move, trend, liquidity, and event risk.
            </p>
          </div>
        </>
      )}

      {board && selected && (
        <AnalysisPanel board={board} contract={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
