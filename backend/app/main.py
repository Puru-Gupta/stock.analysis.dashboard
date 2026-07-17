from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.data.universes import SECTORS, UNIVERSES
from app.engines.equity import analyze_equity, scan_universe
from app.engines.futures import analyze_futures
from app.engines.options import analyze_options

app = FastAPI(
    title="Indian Stock Analysis API",
    description="Decision-focused equity, options, and futures analysis for personal research.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WatchlistRequest(BaseModel):
    symbols: list[str]


WATCHLIST: list[str] = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/universes")
def get_universes():
    return {
        "universes": list(UNIVERSES.keys()) + ["sector", "custom"],
        "sectors": list(SECTORS.keys()),
    }


@app.get("/api/equity/analyze")
def equity_analyze(
    symbol: str = Query(..., example="RELIANCE.NS"),
    timeframe: str = Query("daily", enum=["daily", "weekly", "monthly"]),
):
    sym = symbol if symbol.endswith(".NS") or symbol.startswith("^") else f"{symbol}.NS"
    result = analyze_equity(sym, timeframe=timeframe)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/equity/scan")
def equity_scan(
    universe: str = Query("nifty50"),
    sector: Optional[str] = None,
    timeframe: str = Query("daily"),
    recommendation: Optional[str] = None,
    risk_level: Optional[str] = None,
    limit: int = Query(30, le=100),
):
    return scan_universe(
        universe=universe,
        sector=sector,
        timeframe=timeframe,
        recommendation_filter=recommendation,
        risk_level=risk_level,
        limit=limit,
    )


@app.get("/api/options/analyze")
def options_analyze(
    symbol: str = Query(..., example="RELIANCE.NS"),
    expiry: Optional[str] = None,
    option_type: str = Query("call", enum=["call", "put"]),
    strategy_mode: str = Query("directional"),
    capital: float = Query(100000),
    risk_level: str = Query("medium"),
):
    sym = symbol if symbol.endswith(".NS") else f"{symbol}.NS"
    return analyze_options(sym, expiry, option_type, strategy_mode, capital, risk_level)


@app.get("/api/futures/analyze")
def futures_analyze(
    symbol: str = Query(..., example="NIFTY"),
    timeframe: str = Query("daily"),
    strategy_mode: str = Query("trend_following"),
    risk_level: str = Query("medium"),
    capital: float = Query(500000),
):
    return analyze_futures(symbol, timeframe, strategy_mode, risk_level, capital)


@app.get("/api/watchlist")
def get_watchlist():
    results = []
    for sym in WATCHLIST:
        try:
            r = analyze_equity(sym)
            if "error" not in r:
                results.append({
                    "symbol": r["symbol"],
                    "name": r["name"],
                    "signal": r["signal"],
                    "final_score": r["final_score"],
                    "current_price": r["current_price"],
                    "recommendation": r["recommendation"],
                })
        except Exception:
            continue
    return results


@app.post("/api/watchlist")
def update_watchlist(req: WatchlistRequest):
    global WATCHLIST
    WATCHLIST = [s if s.endswith(".NS") else f"{s}.NS" for s in req.symbols]
    return {"watchlist": WATCHLIST}


@app.get("/api/risk-dashboard")
def risk_dashboard():
    scans = scan_universe("nifty50", limit=50)
    buy_count = sum(1 for s in scans if s.get("signal") == "Buy")
    watch_count = sum(1 for s in scans if s.get("signal") == "Watch")
    avoid_count = sum(1 for s in scans if s.get("signal") in ("Avoid", "Sell"))
    high_risk = sum(1 for s in scans if s.get("risk_level") == "High")
    avg_score = round(sum(s.get("final_score", 0) for s in scans) / max(len(scans), 1), 1)
    top = scans[:5]
    return {
        "market_summary": {
            "stocks_analyzed": len(scans),
            "buy_signals": buy_count,
            "watch_signals": watch_count,
            "avoid_signals": avoid_count,
            "high_risk_count": high_risk,
            "average_score": avg_score,
        },
        "top_opportunities": top,
        "disclaimer": "For personal research and educational use only. Not financial advice.",
    }
