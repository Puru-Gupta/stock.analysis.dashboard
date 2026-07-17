# India Stock Analysis Dashboard

Decision-focused Indian equity, options, and futures analysis. Deployed on Vercel with Supabase for incremental data storage.

**Live:** https://moneydashboard-eight.vercel.app

## Data Storage (Incremental Sync)

Price data is stored in **Supabase PostgreSQL**. On each request:

1. Check the latest stored date for the symbol
2. **First fetch:** download 1 year of history
3. **Subsequent fetches:** download only new bars since the last stored date
4. Analysis runs on the full stored history from the database

Fundamentals are cached for 24 hours.

## Setup Supabase (Required for Persistent Storage)

### 1. Create Supabase project

Go to [supabase.com](https://supabase.com) → New Project (free tier works).

### 2. Run database schema

In Supabase Dashboard → **SQL Editor** → paste and run:

```
supabase/schema.sql
```

### 3. Get API keys

Settings → API → copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

### 4. Add to Vercel

Vercel Dashboard → your project → **Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service role) |

Redeploy after adding env vars.

### 5. Local development

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase keys
npm install
npm run dev
```

## Deploy to Vercel

```bash
vercel --prod --scope your-team
```

Or push to GitHub and connect the repo in Vercel.

## Verify Database

```bash
curl https://moneydashboard-eight.vercel.app/api/health
```

Expected after Supabase is connected:
```json
{"status":"ok","database":"connected","storage":"supabase_incremental"}
```

## Pages

| Page | Route |
|------|-------|
| Equity | `/equity` |
| Options | `/options` |
| Futures | `/futures` |
| Risk Dashboard | `/dashboard` |

## Strategy Documentation

Full documentation in the **[docs/](./docs/)** folder:

| File | Description |
|------|-------------|
| [docs/STRATEGIES.md](./docs/STRATEGIES.md) | Every strategy, signal gate, and stock-selection workflow |
| [docs/STRATEGIES.doc](./docs/STRATEGIES.doc) | **Word format** — open in Microsoft Word |
| [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | Setup, pages, daily workflow, API reference |
| [docs/USER_GUIDE.doc](./docs/USER_GUIDE.doc) | Word format user guide |
| [docs/STRATEGIES.html](./docs/STRATEGIES.html) | Printable HTML (open → Print → Save as PDF) |

## API Routes

All API runs as Next.js serverless functions on Vercel:

- `GET /api/equity/analyze?symbol=RELIANCE.NS`
- `GET /api/equity/scan?universe=nifty50`
- `GET /api/options/analyze?symbol=RELIANCE.NS`
- `GET /api/futures/analyze?symbol=NIFTY`
- `GET /api/health` — shows database connection status

## Architecture

```
Browser → Vercel (Next.js)
              ↓
         API Routes (TypeScript)
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
 Supabase DB      Yahoo Finance API
 (incremental)    (only new bars)
```

## Disclaimer

Personal research and educational use only. Not financial advice.
