# Money Dashboard — Documentation

Official documentation for the India Stock Analysis Dashboard.

## Documents

| Document | Description |
|----------|-------------|
| **[STRATEGIES.md](./STRATEGIES.md)** | Full strategy reference — every equity setup, options mode, futures strategy, Buy gates, and stock-selection workflow |
| **[STRATEGIES.doc](./STRATEGIES.doc)** | Word format — open directly in Microsoft Word |
| **[USER_GUIDE.md](./USER_GUIDE.md)** | How to set up, navigate, and use each page of the dashboard |
| **[USER_GUIDE.doc](./USER_GUIDE.doc)** | Word format user guide |
| **[STRATEGIES.html](./STRATEGIES.html)** | Printable HTML version of the strategy guide (open in browser → Print → Save as PDF) |

Regenerate `.doc` files after editing markdown:

```bash
node scripts/md-to-doc.js docs/STRATEGIES.md docs/STRATEGIES.doc
node scripts/md-to-doc.js docs/USER_GUIDE.md docs/USER_GUIDE.doc
```

## Quick links

- **Live app:** https://moneydashboard-eight.vercel.app
- **Equity analysis:** `/equity`
- **Options analysis:** `/options`
- **Futures analysis:** `/futures`
- **Risk dashboard:** `/dashboard`
- **Health check:** `/api/health`

## Who this is for

| You are… | Start with… |
|----------|-------------|
| Swing trader selecting Nifty 50 stocks | [STRATEGIES.md §2](./STRATEGIES.md#2-stock-selection-workflow-step-by-step) + Equity Buy checklist |
| Options premium seller | [STRATEGIES.md §8](./STRATEGIES.md#8-options-strategies) + Options seller checklist |
| First-time user | [USER_GUIDE.md](./USER_GUIDE.md) |
| Developer extending the engine | [STRATEGIES.md Appendix](./STRATEGIES.md#appendix-key-files) + `lib/engines/` |

## Disclaimer

Personal research and educational use only. Not financial advice. Verify all prices and orders on your broker before trading.
