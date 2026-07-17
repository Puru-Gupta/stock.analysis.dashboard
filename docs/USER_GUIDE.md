# Money Dashboard — User Guide

Practical guide to installing, configuring, and using the dashboard for Indian market research.

---

## 1. Installation

### Requirements

- Node.js 18+
- npm
- (Optional) Supabase account for persistent price storage

### Local setup

```bash
git clone <your-repo-url>
cd moneydashboard
npm install
cp .env.example .env.local
# Edit .env.local with Supabase keys (optional but recommended)
npm run dev
```

Open **http://localhost:4321**

### Production

Deployed on Vercel at https://moneydashboard-eight.vercel.app

```bash
vercel --prod
```

---

## 2. Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Recommended | Supabase project URL for incremental bar storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Server-side database access |

Without Supabase, the app still works using live Yahoo/NSE fetches on every request.

Verify connection:

```bash
curl https://moneydashboard-eight.vercel.app/api/health
```

Expected with Supabase: `"database":"connected"`

---

## 3. Pages overview

### Command Center (`/`)

Home page with links to all modules and market overview snapshot.

### Equity (`/equity`)

**Purpose:** Multi-factor stock analysis for swing trading.

**How to use:**
1. Enter symbol (e.g. `RELIANCE.NS`) or run a universe scan
2. Review signal (Buy / Watch / Avoid), scores, and diagnostics
3. Check regime banner — blocked Buys show as Watch
4. Use Position Sizer with the stop loss from analysis
5. Export scan results to CSV

**Scan filters:**
- Universe: Nifty 50, Midcap, Bank Nifty
- Signal: Buy, Watch, Avoid
- Sector, valuation bracket, trade mode

**Key panels:**
- Market Regime Banner — Nifty risk-on/off
- Signal Diagnostics — active setups (OBV, MVRB, MACD, etc.)
- Data Intel — source quality and accuracy score
- Compare — side-by-side two symbols

### Options (`/options`)

**Purpose:** Movement-aware strike selection with IV, theta, and Greeks.

**How to use:**
1. Select Call/Put and Strategy Mode (Selling, Buying, Neutral, Directional)
2. Review **Best Stocks** scan table — click a row to analyze
3. Check **Volatility & Time Decay** panel (IV, IV/HV, vol change 7/15/30d)
4. Review **Strategy Fit** suitability badge
5. Use **Strike Recommendations** table — prefer rows with live NSE data

**Important:** Only trade strikes when **Data Source = Live Chain**. Synthetic estimates are for research only.

### Futures (`/futures`)

**Purpose:** Directional setup ideas for index/stock trends.

**How to use:**
1. Enter `NIFTY`, `BANKNIFTY`, or a stock symbol
2. Select strategy mode: Trend Following, Breakout, Pullback, Mean Reversion, Volatility Expansion
3. Review Long/Short/Watch signal with entry, stop, target

**Note:** Uses cash/index history — verify actual FUT contract on your broker.

### Risk Dashboard (`/dashboard`)

**Purpose:** Market-wide temperature check.

**Shows:**
- Buy / Watch / Avoid counts across Nifty 50
- Top 5 opportunities
- Index regime
- Sector pulse (proxy stocks per sector)

**Best use:** Start here each morning before individual stock analysis.

---

## 4. API endpoints

| Endpoint | Example |
|----------|---------|
| Equity analyze | `GET /api/equity/analyze?symbol=RELIANCE.NS` |
| Equity scan | `GET /api/equity/scan?universe=nifty50&signal=Buy&limit=20` |
| Options analyze | `GET /api/options/analyze?symbol=RELIANCE.NS&strategy_mode=selling&option_type=call` |
| Options scan | `GET /api/options/scan?strategy_mode=selling&option_type=call&limit=12` |
| Futures analyze | `GET /api/futures/analyze?symbol=NIFTY&strategy_mode=trend_following` |
| Health | `GET /api/health` |
| Market overview | `GET /api/market-overview` |
| Risk dashboard | `GET /api/risk-dashboard` |

---

## 5. Recommended daily workflow

### For swing traders (15 minutes)

1. Open **Dashboard** → note regime (Risk-on / Neutral / Risk-off)
2. If Risk-off → skip new Buys; review watchlist only
3. Open **Equity** → Scan → Filter **Buy** → Sort by score
4. Analyze top 3 names → confirm R:R ≥ 1.8, RS ≥ 1.0, active setup
5. Size position using stop loss and 1–2% risk rule

### For options sellers (20 minutes)

1. Check Dashboard regime
2. Open **Options** → Mode: **Selling** → refresh stock scan
3. Pick names with **Favorable** fit and stable 15d movement
4. Analyze → confirm **Live Chain**, IV/HV > 1.0, P(OTM) ≥ 70%
5. Verify strike premium and margin on broker (Kite/Upstox)

### For index traders (10 minutes)

1. Dashboard regime
2. **Futures** → NIFTY → Trend Following or Breakout mode
3. Cross-check with Equity analysis on index proxy if needed

---

## 6. Understanding signals

| Signal | Meaning | Action |
|--------|---------|--------|
| **Strong Buy** | All elite gates passed | Highest conviction; full size if regime OK |
| **Buy** | Standard gates passed | Normal position size |
| **Watchlist** | Setup forming or one gate failed | Monitor; wait for improvement |
| **Avoid** | Weak profile or hard veto | Do not enter long |
| **Sell / Avoid** | Downtrend + weak scores | Exit bias on existing holdings |

See [STRATEGIES.md](./STRATEGIES.md) for full gate definitions.

---

## 7. Data quality tips

- **Accuracy score ≥ 75** — reliable for decision-making
- **Price spread > 2.5%** — verify spot on broker before trading
- **Bar count < 60** — insufficient history; skip or use caution
- **Options: chain_available = false** — do not trade synthetic strikes
- **Connect Supabase** — improves history depth and reduces fetch errors

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| No Buy signals in scan | Normal — gates are strict. Try Watch filter or wait for regime improvement |
| Options show "Estimated" | Symbol may lack NSE F&O chain; try NIFTY/BANKNIFTY or large F&O names |
| Slow scan | Nifty 50 full scan takes 30–60s; dashboard API has extended timeout |
| Database not configured | Add Supabase env vars in Vercel and redeploy |
| Wrong/stale price | Check Data Intel panel; compare agent quotes |

---

## 9. Related documentation

- **[STRATEGIES.md](./STRATEGIES.md)** — Complete strategy and selection playbook
- **[../README.md](../README.md)** — Project setup and architecture

---

*Personal research and educational use only. Not financial advice.*
