# Money Dashboard — Strategy Guide

Complete reference for every strategy, signal, and selection workflow in the dashboard. Use this document to understand **what the engine is doing**, **when each strategy applies**, and **how to leverage the dashboard for stock selection**.

> **Disclaimer:** This tool is for personal research and education only. It is not financial advice. Always verify prices, lot sizes, and margin on your broker before trading.

---

## Table of Contents

1. [How the Dashboard Thinks](#1-how-the-dashboard-thinks)
2. [Stock Selection Workflow (Step-by-Step)](#2-stock-selection-workflow-step-by-step)
3. [Market Regime Gate](#3-market-regime-gate)
4. [Equity Strategies](#4-equity-strategies)
5. [Fundamental Scoring](#5-fundamental-scoring)
6. [Buy / Watch / Avoid Decision Logic](#6-buy--watch--avoid-decision-logic)
7. [Trade Modes & Exit Plans](#7-trade-modes--exit-plans)
8. [Options Strategies](#8-options-strategies)
9. [Futures Strategies](#9-futures-strategies)
10. [Universe Scans & Ranking](#10-universe-scans--ranking)
11. [Data Quality & When to Trust Signals](#11-data-quality--when-to-trust-signals)
12. [Quick Reference Tables](#12-quick-reference-tables)

---

## 1. How the Dashboard Thinks

The dashboard is built as a **multi-layer research terminal**, not a signal bot. Every recommendation passes through stacked filters:

```
Market Data (multi-source)
        ↓
Technical Score + Active Setups
        ↓
Fundamental Score (sector-relative)
        ↓
Index Regime Gate (Nifty risk-on/off)
        ↓
Trade Mode (trend vs accumulate)
        ↓
Hard Buy Gates (R:R, RS, volume, RSI)
        ↓
Signal: Buy / Watch / Avoid + Entry/Stop/Target
```

**Core philosophy:**
- **Never loosen thresholds** to produce more signals. Empty Buy scans are intentional.
- **Confluence over single indicators** — MACD alone does not trigger a Buy.
- **Regime first** — even a perfect stock setup is blocked when Nifty is risk-off.
- **Defined risk** — every Buy includes entry zone, stop loss, targets, and invalidation.

**Best suited for:** Swing traders (2–6 weeks to 3 months) on Nifty 50 / liquid large caps.

---

## 2. Stock Selection Workflow (Step-by-Step)

### Morning routine (5–10 minutes)

1. **Open Command Center** (`/`) or **Risk Dashboard** (`/dashboard`)
   - Check **Nifty regime** banner: Risk-on / Neutral / Risk-off
   - If **Risk-off** → skip fresh cash Buys; focus on watchlist or hedging

2. **Run an equity scan** (`/equity` → Scan tab)
   - Universe: `nifty50` (default) or sector filter
   - Filter: **Buy** signals only
   - Sort by: `final_score` descending

3. **Review top 3–5 names**
   - Click each symbol for full analysis
   - Confirm: regime allows long, R:R ≥ 1.8, RS ≥ 1.0, volume ≥ 1.2×

4. **Check trade mode**
   - **Trend follow** → enter on pullback or breakout continuation
   - **Accumulate on dip** → enter near support; patience for breakout

5. **Size the position** (Equity page → Position Sizer)
   - Use stop loss from analysis
   - Risk 1–2% of capital per trade

### For options traders

1. **Open Options page** (`/options`)
2. **Scan table** — ranked Nifty 50 names by strategy fit (Selling / Buying / Neutral)
3. **Click a row** → full analysis with IV, theta, movement context
4. **Only trade strikes marked `Live Chain`** — ignore synthetic estimates
5. **Confirm suitability badge** = Favorable before selling premium

### For index / futures ideas

1. **Open Futures page** (`/futures`)
2. Analyze `NIFTY` or `BANKNIFTY` with strategy mode matching your view
3. Use output as **directional thesis** — verify on broker with actual FUT contract

---

## 3. Market Regime Gate

**Engine:** `lib/engines/regime.ts`

The regime gate evaluates **Nifty 50 index** using:
- EMA 50 / EMA 200 stack
- 20-day Nifty return
- Price vs EMA 50

| Regime | Conditions | Effect on Buys |
|--------|-----------|----------------|
| **Risk-on** | Nifty above EMA50/200 stack, 20d return ≥ 0% | Fresh cash Buys allowed |
| **Neutral** | Mixed signals | Buys allowed only if Nifty **above EMA50** |
| **Risk-off** | Nifty below EMA200, or 20d return ≤ −5%, or bearish EMA stack | **Fresh cash Buys blocked** → downgraded to Watch |

### How to use it

- **Risk-on:** Full position sizing on Buy signals
- **Neutral:** Half size; prefer stocks with RS > 1.1 and confirmed setups
- **Risk-off:** No new longs. Review existing positions; consider cash or hedges

> The regime gate does **not** use India VIX. It is a trend/momentum filter on Nifty structure.

---

## 4. Equity Strategies

Equity analysis combines a **composite technical score** (0–100) with **named setups** that trigger when specific patterns confirm.

**Engine:** `lib/engines/technical.ts`, `lib/engines/strategies.ts`

### 4.1 Technical Score Components

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Trend | 25% | Uptrend / downtrend / neutral via SMA20/50 + swing structure |
| Momentum | 20% | 3-month return, RSI band, MACD histogram |
| Volume | 20% | Current volume vs 20-day average |
| Support/Resistance | 15% | Distance to 60-day support/resistance zones |
| Relative Strength | 20% | 3-month excess return vs Nifty |
| Setup bonus | up to +15 | Confirmed OBV, accumulation, or confluence patterns |

### 4.2 Active Setups (Named Strategies)

These are the **specific strategies** the engine detects. A stock can have multiple active setups.

---

#### OBV Accumulation (`obv_accumulation`)

**What it is:** On-Balance Volume rising while price is flat or down — "quiet accumulation" by institutions.

**Trigger conditions:**
- OBV change over 15 days is **positive**
- Price change over 15 days is **flat or down** (−8% to +2%)
- True divergence required (not volume spike alone)

**When to use:**
- You believe smart money is building a position before a move
- Stock is in a base/consolidation, not chasing highs
- Fundamentals are acceptable (fund score ≥ 55)

**Trade mode:** Accumulate on dip

**Entry:** Near support or entry zone; stop below structural low

**Exit:** Breakout above consolidation within 15 sessions, or time stop at 30 days

**Risk:** False accumulation — volume dries up, no breakout follows

---

#### Volume Breakout Setup (`volume_breakout_setup`)

**What it is:** Price consolidating in a tight Bollinger band with rising volume near the 20-SMA — pre-breakout coiling.

**Trigger conditions:**
- Bollinger band width compressed (< 75% of 20-day average width)
- Volume > 1.5× 20-day average
- Price within 3% of 20-SMA
- Not already at 52-week high

**When to use:**
- Anticipating a directional move out of consolidation
- Volume confirms participation before the break
- Combine with regime check — breakouts fail in risk-off markets

**Trade mode:** Accumulate on dip (pre-breakout) or Trend follow (post-breakout)

**Entry:** On close above recent range high with volume, or scale in near 20-SMA

**Exit:** Time stop if no breakout in 15 sessions

---

#### Volume Accumulation Breakout (`vol_accum_breakout`)

**What it is:** Volume built during a base, then price closed above the 20-day range high on confirming volume — the post-accumulation breakout (distinct from pre-breakout `volume_breakout_setup`).

**Trigger conditions:**
- 20-day average volume ≥ 1.2× 60-day average **or** prior consolidation + volume accumulation
- Close above prior 20-bar range high
- Today's volume ≥ 1.2× 20-day average

**When to use:**
- You want names that already broke out after quiet accumulation
- Momentum continuation in risk-on regimes
- Pair with Buy/Watch filter and index regime check

**Trade mode:** Trend follow

**Entry:** On breakout close or first pullback to breakout level

**Exit:** Stop below breakout level / recent swing low; trail under EMA20 after +1.5R

---

#### MVRB Momentum (`mvrb_momentum`)

**What it is:** Momentum + Volume + Relative strength + Breakout — a systematic momentum filter for trending stocks.

**Trigger conditions:**
- 3-month return > 12%
- Volume ratio ≥ 1.3× (vs 20-day avg)
- Relative strength vs Nifty ≥ 1.0
- Often near 52-week high

**When to use:**
- Strong trending market (risk-on regime)
- Leader stocks outperforming Nifty
- You accept buying closer to highs with volume confirmation

**Trade mode:** Trend follow

**Entry:** Pullback to entry zone or breakout above resistance

**Exit:** Trail stop under EMA20 after +1.5R; cut if RS drops below 0.9 for 5 sessions

**Risk:** Chasing extended moves; RSI > 70 blocks fresh Buys

---

#### MACD Cross (`macd_cross`)

**What it is:** MACD line crosses above signal line with rising histogram — classic momentum confirmation.

**Trigger conditions:**
- Part of **bullish confluence** (≥ 3 bullish votes)
- MACD bullish crossover OR MACD above signal with rising histogram

**When to use:**
- Confirming a trend already in place
- Never used alone — requires confluence with ADX, EMA stack, or Bollinger

**Trade mode:** Trend follow

---

#### ADX + EMA Trend (`adx_ema_trend`)

**What it is:** ADX ≥ 25 (trending market) with +DI > −DI and bullish EMA stack (price > EMA20 > EMA50).

**Trigger conditions:**
- ADX trending (≥ 25)
- +DI dominates −DI
- Price above EMA20 above EMA50

**When to use:**
- Established trends with measurable directional strength
- Avoid in choppy/sideways markets (ADX < 25)

**Trade mode:** Trend follow

---

#### Bollinger Squeeze Breakout (`bb_squeeze_breakout`)

**What it is:** Bollinger bands compressed (width < 8%) with MACD rising in an uptrend — volatility expansion setup.

**Trigger conditions:**
- BB squeeze active
- MACD histogram rising
- Bullish EMA stack
- Part of bullish confluence

**When to use:**
- Low-volatility consolidation before an expansion move
- Often precedes 5–15% moves on large caps

**Trade mode:** Trend follow

**Risk:** False breakouts in neutral/risk-off regimes

---

### 4.3 Strategy Confluence (Multi-Factor Vote)

**Engine:** `lib/engines/strategies.ts` → `evaluateStrategyConfluence`

The engine counts **bullish votes** from independent factors:

| Factor | Bullish vote when… |
|--------|-------------------|
| MACD | Above signal + rising histogram, or bullish cross |
| ADX | ADX ≥ 25 and +DI > −DI |
| EMA stack | Price > EMA20 > EMA50 |
| Bollinger | Oversold (mean-reversion bias) |
| BB squeeze | Squeeze + MACD rising + uptrend |

**Bullish confluence** = ≥ 3 votes. Required for **Strong Buy** and preferred for standard **Buy**.

> Confluence **confirms** — it never overrides a failed R:R, RS, or regime gate.

---

### 4.4 Entry, Stop, and Target Geometry

**Engine:** `lib/engines/technical.ts`

Based on ATR(14) and 60-day support/resistance:

| Trend | Entry Zone | Stop Loss | Target 1 | Target 2 |
|-------|-----------|-----------|----------|----------|
| **Uptrend** | Price − 0.3 ATR to Price + 0.1 ATR | max(Support − 0.3 ATR, Price − 1.5 ATR) | max(Resistance, Price + 1.5 ATR) | Price + 2.5 ATR |
| **Downtrend** | Price − 0.2 ATR to Price | min(Resistance + 0.3 ATR, Price + 1.5 ATR) | min(Support, Price − 1.5 ATR) | Price − 2.5 ATR |
| **Neutral** | Support to Price | Support − 0.5 ATR | Resistance | Midpoint |

**Minimum R:R for Buy:** 1.8 (standard), 2.0 (Strong Buy)

---

## 5. Fundamental Scoring

**Engine:** `lib/engines/fundamental.ts`

Fundamental score (0–100) combines four pillars:

| Pillar | Weight | Key inputs |
|--------|--------|-----------|
| Quality | 30% | ROE, profit margin, free cash flow |
| Growth | 25% | Revenue growth, earnings growth |
| Valuation | 25% | Sector-relative P/E or P/B, PEG, forward P/E |
| Debt | 20% | Debt-to-equity ratio |

### Sector-relative valuation

- **Banks / financials:** P/B vs sector median (not P/E)
- **Other sectors:** P/E vs sector median
- **PEG < 1:** attractive; **PEG > 2.5:** rich

### Fundamental thresholds

| Score | Label | Role in Buy decision |
|-------|-------|----------------------|
| ≥ 70 | Strong | Required for Strong Buy |
| ≥ 55 | Good | Minimum for standard Buy |
| 40–54 | Average | Watchlist only |
| < 40 | Weak | Blocks Buy even with strong tech |

---

## 6. Buy / Watch / Avoid Decision Logic

**Engine:** `lib/engines/fundamental.ts` → `combineDecision`

### Signal tiers

| Signal | Requirements |
|--------|-------------|
| **Strong Buy** | Tech ≥ 70, Fund ≥ 70, uptrend, RS ≥ 1.1, vol ≥ 1.2×, R:R ≥ 2.0, RSI ≤ 70, ≥ 3 bullish confluence votes, regime allows |
| **Buy** | Tech ≥ 65, Fund ≥ 55, not downtrend, RS ≥ 1.0, vol ≥ 1.2× (or confirmed setup), R:R ≥ 1.8, RSI ≤ 70, regime allows, plus confluence OR active setup OR (uptrend + vol ≥ 1.3×) |
| **Buy (setup path)** | Confirmed setup + tech ≥ 60, fund ≥ 55, vol ≥ 1.2×, RS ≥ 1.0, R:R ≥ 1.8 |
| **Watchlist** | Mixed signals, mid-zone score, or failed single gate |
| **Avoid / Sell** | Weak tech + weak fund, downtrend, or bearish confluence |

### Post-decision vetoes (Buy → Watch/Avoid)

Even after a Buy is computed, these **hard vetoes** apply:

| Veto | Effect |
|------|--------|
| Regime risk-off | Buy → Watch |
| Downtrend | Buy → Avoid |
| R:R < 1.8 | Buy → Watch |
| RSI > 70 | Buy → Watch |
| RS < 1.0 | Buy → Watch |
| Volume < 1.2× without setup | Buy → Watch |

### Composite score

```
final_score = technical_score × 0.55 + fundamental_score × 0.45
```

Use `final_score` for **ranking** within a scan. Use **signal + gates** for **action**.

---

## 7. Trade Modes & Exit Plans

**Engine:** `lib/engines/trade-mode.ts`

### Trade modes

The engine detects whether your edge is **momentum** or **accumulation** — these are incompatible entry styles.

| Mode | Active when… | Horizon | Time stop |
|------|-------------|---------|-----------|
| **Trend follow** | MVRB momentum, ADX/EMA trend, MACD cross, BB squeeze breakout; or near 52w high with RSI 50–70 | 1–3 months | 45 trading days |
| **Accumulate on dip** | OBV accumulation, volume breakout setup; or OBV divergence + RSI < 50 | 2–6 weeks | 30 trading days |
| **No clear mode** | Neither edge active | Wait | 21 trading days |

**Conflict resolution:** If both trend and accumulation signals fire:
- Near 52w high or 3M return > 15% → **Trend follow** wins
- Otherwise → **Accumulate** wins

### Exit plan rules

**Trend follow:**
- Hard stop at structural invalidation
- Trail under EMA20 after +1.5R move
- Cut if RS vs Nifty < 0.9 for 5 consecutive sessions

**Accumulate on dip:**
- Hard stop at support breach
- Exit if no breakout above consolidation within 15 sessions
- Take 1/3 off at +1R

**Reduce position if:**
- Fundamental score drops below 50
- Index regime flips to risk-off
- RSI > 75 after entry without pullback hold

---

## 8. Options Strategies

**Engine:** `lib/engines/options.ts`, `lib/engines/greeks.ts`

### Strategy modes

| Mode | Objective | Best market conditions |
|------|-----------|----------------------|
| **Selling** | Collect premium via OTM options | Range-bound tape, IV > HV, low 15d movement |
| **Buying / Directional** | Long calls or puts for directional move | Clear trend, momentum intact, IV not extreme |
| **Neutral** | Iron condor / range strategies | 15d and 30d movement < 4–8%, no strong trend |

### Underlying movement analysis

Before any strike is recommended, the engine evaluates **7 / 15 / 30-day price movement**:

| Window | Trading days | Purpose |
|--------|-------------|---------|
| 7 days | ~5 bars | Recent momentum |
| 15 days | 15 bars | **Primary window** — expiry cycle alignment |
| 30 days | ~22 bars | Medium-term range for strike width |

Each combination of (strategy mode × call/put) produces a **suitability rating**: Favorable / Caution / Avoid.

**Examples:**
- **Sell call + flat 15d movement (< 3%)** → Favorable (range-bound ideal for call selling)
- **Sell call + 15d rally > 8%** → Caution (continuation risk)
- **Sell put + 15d decline > 8%** → Avoid (falling knife)
- **Buy call + uptrend + positive 15d** → Favorable
- **Neutral + 15d/30d range compressed** → Favorable for Iron Condor

### Volatility metrics

| Metric | Meaning | How to use |
|--------|---------|-----------|
| **ATM IV** | Implied vol at nearest strike | Current option pricing richness |
| **HV (20d)** | Historical realized volatility | Baseline for "normal" movement |
| **IV/HV ratio** | IV ÷ HV | > 1.1 favors sellers; < 1.0 favors buyers |
| **Vol change 7/15/30d** | HV change in percentage points | Rising vol → widen strikes; falling vol → tighter strikes OK |

### Greeks (per strike)

| Greek | Meaning | Seller perspective | Buyer perspective |
|-------|---------|-------------------|-------------------|
| **Theta** | Daily premium decay (₹/day) | Positive income | Negative — time working against you |
| **Delta** | Price sensitivity to ₹1 spot move | Lower delta OTM = less directional risk | Higher delta ITM = more leverage |
| **Vega** | Sensitivity to 1% IV change | Benefits from IV crush | Hurt by IV expansion |
| **7d decay** | Theta × 7 | Expected weekly income (approx) | Expected weekly loss (approx) |

### Named option structures

#### Cash-Secured Put (CSP)
- **When:** Selling mode + Put + stable/uptrending stock
- **Logic:** Sell OTM put below expected move; collect premium; willing to own stock at strike
- **Strike gate:** P(OTM) ≥ 70%, strike ≥ 0.8× expected move from spot, live liquidity

#### Covered Call / Sell OTM Call
- **When:** Selling mode + Call + mild extension (5–10% in 15d) or range-bound
- **Logic:** Sell call above expected move; keep premium if stock stays below strike
- **Caution:** Avoid after sharp rallies (> 8% in 15d)

#### Iron Condor
- **When:** Neutral mode + 15d movement < 4% and 30d < 8%
- **Structure:** Sell OTM call + buy further call + sell OTM put + buy further put
- **Legs placed at:** ±1× and ±1.5× expected move from spot

#### Bull Call Spread
- **When:** Uptrend + directional buying + top call strike identified
- **Structure:** Buy lower strike CE, sell higher strike CE
- **Advantage:** Defined max loss vs naked call

#### Bear Put Spread
- **When:** Downtrend + put buying
- **Structure:** Buy higher strike PE, sell lower strike PE

### Options strike selection gates

**For selling (live chain):**
- P(OTM) ≥ 70%
- Strike distance ≥ 0.8 × expected move
- OI > 500 OR volume > 100
- IV > HV × 1.1 adds to score

**For buying:**
- Composite score ≥ 65
- Suitability ≠ Avoid
- Liquidity check when chain available

> **Important:** When live NSE chain is unavailable, the engine uses **synthetic HV-based estimates**. These are marked in the API but should **never be traded without broker verification**.

---

## 9. Futures Strategies

**Engine:** `lib/engines/futures.ts`

> **Note:** The futures module analyzes **cash/index price history** with futures-style rules. It does not fetch NSE FUT contracts, OI, or basis. Use for **directional ideas** on Nifty/BankNifty — not contract-level execution.

### Strategy modes

#### Trend Following
- **Long:** Uptrend + volume ≥ 1.3× + RSI 50–65
- **Short:** Downtrend + volume ≥ 1.3× + RSI 35–50
- **Stop:** Support/resistance ± 0.3 ATR
- **Target:** 2× risk distance

#### Breakout
- **Long:** Range compression + price breaks above resistance + volume > 1.2×
- **Short:** Range compression + breakdown below support + volume > 1.2×
- **Stop:** Beyond broken level ± 0.5 ATR
- **Target:** Width of prior range

#### Pullback
- **Long:** Uptrend + price within 3% of 20-SMA + RSI 40–60
- **Short:** Downtrend + bounce to 20-SMA + RSI 40–60
- **Stop:** 20-SMA ± 0.8 ATR
- **Target:** Resistance (long) or support (short)

#### Mean Reversion
- **Long:** Price ≥ 1.5 ATR below 20-SMA + RSI < 35
- **Short:** Price ≥ 1.5 ATR above 20-SMA + RSI > 65
- **Target:** 20-SMA (reversion to mean)

#### Volatility Expansion
- **Long/Short:** Range compressed for 12 bars, then current bar range > 1.2× ATR with volume > 1.3×
- Direction follows the expansion candle (close vs open)

**Universal R:R floor:** 1.5 — signals below this downgrade to Watch.

---

## 10. Universe Scans & Ranking

### Equity scan (`/api/equity/scan`)

**Engine:** `lib/engines/equity.ts` → `scanUniverse`

| Parameter | Options | Effect |
|-----------|---------|--------|
| `universe` | nifty50, midcap, banknifty, custom | Stock pool |
| `sector` | IT, Banking, Pharma, etc. | Filter by sector |
| `signal` | Buy, Watch, Avoid, All | Filter by signal |
| `limit` | 10–50 | Max results returned |

**Scan process:**
1. Fetch Nifty bars once (shared across symbols)
2. Analyze each symbol in parallel (6 concurrent workers)
3. Apply filters (signal, risk level, valuation bracket)
4. Sort by `final_score` descending
5. Return top N

**How to leverage:**
- **Daily Buy scan** → your watchlist for the week
- **Sector scan** → rotate into leading sectors in risk-on regimes
- **Watch scan** → names approaching Buy gates (setup forming)

### Options scan (`/api/options/scan`)

**Engine:** `lib/engines/options.ts` → `scanOptionsUniverse`

Ranks top 30 Nifty 50 names by:
- Price movement fit for selected strategy mode
- Historical volatility
- Trend alignment
- Suitability score (favorable names rank higher)

**Does not fetch live option chains** — use scan for **stock selection**, then run full analyze for strikes.

### Risk dashboard (`/dashboard`)

Aggregates full Nifty 50 scan:
- Buy / Watch / Avoid counts
- Average score
- Top 5 opportunities
- Index regime summary

**Best use:** Single-screen market temperature before diving into individual names.

---

## 11. Data Quality & When to Trust Signals

**Engine:** `lib/data/agents/orchestrator.ts`, `consensus.ts`

### Data sources (priority order)

1. **Yahoo Finance** (primary OHLC)
2. **NSE India** (stock-nse-india — quotes, option chains)
3. **Yahoo HTTP / Python fallbacks**
4. **Community Indian Market API**

### Quality indicators (shown in Data Intel panel)

| Indicator | Good | Caution |
|-----------|------|---------|
| Accuracy score | ≥ 80 | < 70 |
| Price spread | < 1.5% across sources | > 2.5% |
| Bar count | ≥ 120 daily bars | < 60 bars |
| Live chain | ✓ for options | Synthetic estimates |
| Fundamentals | Complete | Missing P/E or sector |

### Rules of thumb

1. **Trust equity Buys** when accuracy ≥ 75, bar count ≥ 120, spread < 2%
2. **Trust options strikes** only when `chain_available: true`
3. **Verify on broker** before any F&O order — Greeks are BS estimates, not broker margin calcs
4. **Skip mid/small caps** if bar count is low or sources disagree
5. **Connect Supabase** for incremental storage — reduces re-fetch errors and improves history depth

---

## 12. Quick Reference Tables

### Equity Buy checklist

- [ ] Nifty regime = Risk-on or Neutral (above EMA50)
- [ ] Signal = Buy or Strong Buy
- [ ] Technical score ≥ 65
- [ ] Fundamental score ≥ 55
- [ ] R:R ≥ 1.8
- [ ] RS vs Nifty ≥ 1.0
- [ ] Volume ≥ 1.2× (or confirmed setup)
- [ ] RSI ≤ 70
- [ ] Trend ≠ downtrend
- [ ] Active setup matches trade mode
- [ ] Data accuracy ≥ 75

### Options seller checklist

- [ ] Strategy mode = Selling or Neutral
- [ ] Suitability = Favorable
- [ ] Live NSE chain available
- [ ] P(OTM) ≥ 70% on selected strike
- [ ] IV/HV ratio > 1.0 (prefer > 1.1)
- [ ] 15d movement not strongly against you
- [ ] Theta income acceptable for DTE remaining
- [ ] No major earnings/event before expiry

### Options buyer checklist

- [ ] Clear trend matching option type (call = uptrend, put = downtrend)
- [ ] Suitability = Favorable
- [ ] IV/HV < 1.2 (not overpaying for vol)
- [ ] Momentum confirmed on 7d and 15d windows
- [ ] Stop loss defined (~50% of premium)
- [ ] DTE sufficient for move to develop (prefer > 14 DTE)

### Strategy → Market condition map

| Market condition | Best equity strategy | Best options strategy | Best futures strategy |
|-----------------|---------------------|----------------------|----------------------|
| Risk-on + trending | MVRB momentum, ADX/EMA trend | Buy calls / bull spreads | Trend following |
| Risk-on + consolidating | OBV accumulation, volume breakout | Sell puts (CSP) | Breakout (await trigger) |
| Neutral + range-bound | Watchlist / small positions | Iron condor, sell OTM | Mean reversion |
| Risk-off | **No new longs** | Avoid naked selling | Avoid or short only |
| High volatility spike | Wait for base | Sell premium if IV > HV | Volatility expansion |
| Post-rally pause | Watch for pullback entry | Sell OTM calls | Pullback long |

---

## Appendix: Key Files

| Module | File |
|--------|------|
| Equity analysis | `lib/engines/equity.ts` |
| Technical + setups | `lib/engines/technical.ts` |
| Strategy confluence | `lib/engines/strategies.ts` |
| Fundamentals + Buy logic | `lib/engines/fundamental.ts` |
| Regime gate | `lib/engines/regime.ts` |
| Trade modes + exits | `lib/engines/trade-mode.ts` |
| Options + Greeks | `lib/engines/options.ts`, `lib/engines/greeks.ts` |
| Futures | `lib/engines/futures.ts` |
| Strategy descriptions | `lib/engines/intel.ts` |
| Data orchestration | `lib/data/agents/orchestrator.ts` |

---

*Last updated: July 2026 — reflects engine logic in the main TypeScript codebase.*
