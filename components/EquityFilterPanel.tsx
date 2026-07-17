"use client";

import { LabelWithInfo } from "@/components/InfoTip";
import { EQUITY_DEFINITIONS } from "@/lib/equity-definitions";
import { Search, RefreshCw, ChevronDown } from "lucide-react";

type PillOption = { value: string; label: string };

function ProductLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="product-label">{children}</div>
  );
}

function PillGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: PillOption[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="pill-group" role="group">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`pill ${active ? "pill-active" : ""}`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ProductSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: PillOption[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="product-select-wrap">
      <select
        className="product-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="product-select-icon" aria-hidden />
    </div>
  );
}

export interface EquityFilters {
  symbol: string;
  universe: string;
  sector: string;
  timeframe: string;
  recFilter: string;
  riskFilter: string;
  setupFilter: string;
  valuationFilter: string;
}

interface EquityFilterPanelProps {
  filters: EquityFilters;
  onChange: <K extends keyof EquityFilters>(key: K, value: EquityFilters[K]) => void;
  onAnalyze: () => void;
  onScan: () => void;
  loading?: boolean;
}

const UNIVERSE_OPTIONS: PillOption[] = [
  { value: "nifty50", label: "Nifty 50" },
  { value: "nifty100", label: "Nifty 100" },
  { value: "nifty500", label: "Nifty 500" },
  { value: "midcap", label: "Midcap" },
  { value: "smallcap", label: "Smallcap" },
  { value: "banknifty", label: "Bank Nifty" },
  { value: "sector", label: "Sector" },
];

const TIMEFRAME_OPTIONS: PillOption[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const REC_OPTIONS: PillOption[] = [
  { value: "", label: "All" },
  { value: "Buy", label: "Buy" },
  { value: "Sell", label: "Sell" },
  { value: "Watch", label: "Watch" },
  { value: "Avoid", label: "Avoid" },
];

const RISK_OPTIONS: PillOption[] = [
  { value: "", label: "All" },
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Med" },
  { value: "High", label: "High" },
];

const SECTOR_OPTIONS: PillOption[] = [
  "IT", "Banking", "Pharma", "Auto", "FMCG", "Energy", "Metals", "Realty",
].map((s) => ({ value: s, label: s }));

const SETUP_OPTIONS: PillOption[] = [
  { value: "", label: "All setups" },
  { value: "obv_accumulation", label: "OBV accumulation" },
  { value: "volume_accumulation", label: "Volume accumulation" },
  { value: "pre_breakout", label: "Pre-breakout" },
  { value: "vol_accum_breakout", label: "Vol accum + breakout" },
];

const VALUATION_OPTIONS: PillOption[] = [
  { value: "", label: "Cheap+Fair" },
  { value: "cheap", label: "Cheap" },
  { value: "fair", label: "Fair" },
  { value: "premium", label: "Premium" },
];

const VALUATION_UNIVERSES = new Set(["midcap", "smallcap", "nifty500"]);

export default function EquityFilterPanel({
  filters,
  onChange,
  onAnalyze,
  onScan,
  loading,
}: EquityFilterPanelProps) {
  const { symbol, universe, sector, timeframe, recFilter, riskFilter, setupFilter, valuationFilter } = filters;
  const showValuation = VALUATION_UNIVERSES.has(universe);

  return (
    <div className="product-panel">
      {/* Symbol query — Cursor agent prompt bar */}
      <div className="product-section">
        <ProductLabel>Symbol</ProductLabel>
        <div className="product-query-row">
          <input
            className="product-query-input"
            value={symbol}
            onChange={(e) => onChange("symbol", e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && onAnalyze()}
            placeholder="RELIANCE.NS"
            spellCheck={false}
            autoCapitalize="characters"
          />
          <div className="product-query-actions">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={loading}
              className="product-action-primary"
            >
              <Search className="h-3.5 w-3.5" />
              Analyze
            </button>
            <button
              type="button"
              onClick={onScan}
              disabled={loading}
              className="product-action-secondary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Scan
            </button>
          </div>
        </div>
      </div>

      <div className="product-divider" />

      {/* Universe + timeframe */}
      <div className="product-section">
        <ProductLabel>
          <LabelWithInfo label="Universe" definition={EQUITY_DEFINITIONS.universe} />
        </ProductLabel>
        <PillGroup
          value={universe}
          options={UNIVERSE_OPTIONS}
          onChange={(v) => onChange("universe", v)}
        />
        {universe === "sector" && (
          <div className="product-section-nested">
            <ProductLabel>Sector</ProductLabel>
            <PillGroup
              value={sector}
              options={SECTOR_OPTIONS}
              onChange={(v) => onChange("sector", v)}
            />
          </div>
        )}
        {showValuation && (
          <div className="product-section-nested">
            <ProductLabel>
              <LabelWithInfo label="Valuation" definition={EQUITY_DEFINITIONS.valuation_filter} />
            </ProductLabel>
            <PillGroup
              value={valuationFilter}
              options={
                universe === "nifty500"
                  ? [{ value: "", label: "All" }, ...VALUATION_OPTIONS.filter((o) => o.value)]
                  : VALUATION_OPTIONS
              }
              onChange={(v) => onChange("valuationFilter", v)}
            />
          </div>
        )}
      </div>

      <div className="product-divider" />

      <div className="product-section product-section-row">
        <div className="product-section-half">
          <ProductLabel>Timeframe</ProductLabel>
          <PillGroup
            value={timeframe}
            options={TIMEFRAME_OPTIONS}
            onChange={(v) => onChange("timeframe", v)}
          />
        </div>
        <div className="product-section-half">
          <ProductLabel>
            <LabelWithInfo label="Recommendation" definition={EQUITY_DEFINITIONS.recommendation} />
          </ProductLabel>
          <PillGroup
            value={recFilter}
            options={REC_OPTIONS}
            onChange={(v) => onChange("recFilter", v)}
          />
        </div>
      </div>

      <div className="product-divider" />

      {/* Risk + setup — Devin-style inline row */}
      <div className="product-section product-section-row product-section-row-end">
        <div className="product-section-half">
          <ProductLabel>
            <LabelWithInfo label="Risk level" definition={EQUITY_DEFINITIONS.risk_level} />
          </ProductLabel>
          <PillGroup
            value={riskFilter}
            options={RISK_OPTIONS}
            onChange={(v) => onChange("riskFilter", v)}
          />
        </div>
        <div className="product-section-half">
          <ProductLabel>
            <LabelWithInfo label="Setup filter" definition={EQUITY_DEFINITIONS.setup_filter} />
          </ProductLabel>
          <ProductSelect
            value={setupFilter}
            options={SETUP_OPTIONS}
            onChange={(v) => onChange("setupFilter", v)}
          />
        </div>
      </div>
    </div>
  );
}
