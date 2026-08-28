# 🎯 Options Sniper

Autonomous **Bull Call Spread** trading agent for the **Alpaca Options Alpha Agents** hackathon.
Built with **Next.js 15 + Tailwind CSS 4**, fully **serverless** (Vercel-ready), **no database**,
**no Docker**, **no paid AI APIs** — and **PAPER TRADING ONLY**.

> ⚠️ **PAPER TRADING ONLY.** The app hard-blocks the live trading endpoint (`api.alpaca.markets`)
> and only talks to `paper-api.alpaca.markets`. This is not investment advice.

## What the agent does (scan → analyze → score → risk check → paper trade → monitor → exit)

Every tick the agent:

1. **Reads the Alpaca account** (equity, buying power) — Alpaca is the single source of truth.
2. **Monitors open positions** and automatically **EXITs** when any of these fire:
   - **+50% profit** on the spread debit
   - **−50% max loss** (half the debit gone)
   - **Trend reversal** (underlying turned bearish: price < 20MA < 50MA)
   - **≤ 7 DTE** (time exit)
3. **Scans** `SPY, QQQ, IWM, AAPL, MSFT, NVDA, TSLA`:
   - Pulls daily bars from Alpaca Market Data (`/v2/stocks/{s}/bars`)
   - Computes **20MA, 50MA, RSI(14), 5-bar momentum**
   - Keeps only **bullish trend** symbols (price > 20MA > 50MA)
   - Pulls the **options chain** (`/v1beta1/options/snapshots/{underlying}`, indicative feed)
4. **Builds Bull Call Spreads** with **14–45 DTE**: ATM long call + ~0.30Δ short call,
   liquidity-filtered (open interest ≥ 100, bid/ask spread ≤ 25% of mid).
5. **Scores each spread 0–100**: trend (25) + RSI (20) + momentum (20) + liquidity (15) + risk/reward (20).
6. **Selects the highest-scoring opportunity** across the watchlist.
7. **Risk check**: max loss (debit × 100) must be **≤ 1% of account equity**; position size is
   derived from that limit (capped at 10 spreads). No pyramiding — one spread per underlying.
8. **Decision**: score ≥ **75** **and** risk ≤ 1% → **ENTER** (auto-submits a multi-leg order to
   Alpaca paper trading when the agent runs with auto-enter on; otherwise the dashboard shows a
   **SUBMIT TRADE** button). Anything else → **WAIT**.

## Run it

```bash
cp .env.example .env.local   # add your Alpaca paper keys
npm install
npm run dev                  # http://localhost:3000
```

Get free paper keys at [app.alpaca.markets](https://app.alpaca.markets) → *Paper Trading*.

### Demo mode (no keys needed)

Set `ALPACA_MOCK=true` to run the **entire pipeline against clearly-labeled simulated data**
(in-memory demo brokerage, resets on restart). Useful for hackathon demos when the market is
closed or keys aren't handy. Leave it unset for real paper trading.

### Deploy to Vercel

```bash
npm i -g vercel
vercel            # then add ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_BASE_URL as project env vars
```

All Alpaca calls happen in **serverless API routes** (`app/api/**`); credentials never reach the
browser. There is no database — the agent loop is driven by the dashboard (START/STOP = client
polling every 60s), so it works perfectly on serverless.

### Alpaca Integration Monitor

The dashboard ships a live **Alpaca Integration Monitor**:
- **Connection status** + **PAPER/LIVE** environment badge (always PAPER — live is hard-blocked)
- **API latency** (last + average), **last API call**, **total / successful / failed** call counters
- Per-category counters for **market-data**, **options-data** and **trading/order** calls
- A **real-time activity timeline** showing every call — timestamp, operation
  (`GET /v2/account`, `GET market bars`, `GET options chain`, `POST /v2/orders`, …), category,
  status and latency — with a collapsible **View Response** panel of the formatted JSON body
- An **Agent → Alpaca → Decision → Order** pipeline view tracing how the agent uses Alpaca data
  to score, decide and execute paper trades

This is server-side instrumentation only: activity lives in a short in-memory ring buffer
(`lib/apiMonitor.ts`, no database) and **API keys/secrets are never logged or sent to the browser**.

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/account` | GET | Account equity/buying power + open positions (grouped into spreads with P&L) |
| `/api/agent/tick` | POST | Full autonomous tick: monitor/exit → scan → score → risk check → auto paper-trade |
| `/api/agent/scan` | POST | Scan + score only (never trades) |
| `/api/trade` | POST | Submit an approved spread to Alpaca paper trading |
| `/api/positions/close` | POST | CLOSE POSITION — close all legs of a spread |

## Alpaca MCP / CLI integration

The hackathon requires Alpaca MCP or CLI. The official Alpaca MCP server is a Python
**stdio** process, which can't run inside Vercel serverless functions — so this app talks to the
same Alpaca REST endpoints the MCP server wraps (`/v2/account`, `/v2/orders` multi-leg,
`/v2/positions`, options snapshots). For MCP-based workflows (Claude Code, Cursor, Claude
Desktop) this repo ships **`mcp-config.json`**:

```bash
# requires: https://docs.astral.sh/uv/  (provides uvx)
claude mcp add alpaca --config mcp-config.json   # or paste into your client config
```

The MCP server runs with `ALPACA_PAPER_TRADE=true` and the **same paper keys**, so anything you
do through MCP is visible in this dashboard (Alpaca is the source of truth) and vice-versa.

Alternatively, the Alpaca CLI can be used for the same paper account:
`pip install alpaca-py` / see https://docs.alpaca.markets/us/docs/alpacas-cli

## Notes & limits

- Options data uses the free **`indicative`** feed, which supplies real-time bid/ask quotes but
  **omits open interest and greeks**. The scanner therefore judges liquidity from quote sizes
  (`bid_size`/`ask_size`) and prices the short leg via a 1-sigma OTM rule when greeks are missing.
  With an Alpaca options data subscription, `feed=opra`-style data + real OI/greeks can be wired
  through `ALPACA_DATA_URL` + a `feed` change in `lib/alpaca.ts`.
- Paper orders are limit orders at the conservative spread debit (pay ask / hit bid), `day` TIF.
- The activity log is session-scoped in the browser (no persistence by design); the order and
  position history of record lives in your Alpaca paper account.
- Agent tuning via env: `AGENT_MIN_SCORE` (default 75), `AGENT_MAX_RISK_PCT` (default 1.0).
