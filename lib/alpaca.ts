// Server-only Alpaca REST client. Credentials stay in env vars; nothing here is
// ever imported into client components. Alpaca is the single source of truth for
// account, orders and positions — no database is used anywhere in this app.
import "server-only";
import { makeSnippet, recordApiCall, type ApiCategory } from "./apiMonitor";

export const IS_MOCK = process.env.ALPACA_MOCK === "true";

function tradingBase(): string {
  const base = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  if (base.includes("api.alpaca.markets") && !base.includes("paper-api")) {
    // Hard guard: this app is paper-trading only.
    throw new Error("LIVE TRADING URL BLOCKED — Options Sniper only allows paper-api.alpaca.markets");
  }
  return base;
}

function dataBase(): string {
  return process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";
}

function requireKeys() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error("Missing ALPACA_API_KEY / ALPACA_SECRET_KEY env vars");
  return { key, secret };
}

interface CallMeta {
  op: string;
  category: ApiCategory;
}

async function request<T>(base: string, path: string, init: RequestInit = {}, meta: CallMeta): Promise<T> {
  const { key, secret } = requireKeys();
  const started = performance.now();
  let status: number | null = null;
  let ok = false;
  let text = "";
  let errorMsg: string | null = null;
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    status = res.status;
    ok = res.ok;
    text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const body = JSON.parse(text);
        detail = body.message || body.detail || text;
      } catch {
        /* keep raw text */
      }
      errorMsg = detail;
      throw new Error(`Alpaca ${res.status} on ${path}: ${detail}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  } catch (err) {
    if (!errorMsg) errorMsg = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    recordApiCall({
      op: meta.op,
      category: meta.category,
      method: (init.method || "GET").toUpperCase(),
      path,
      status,
      ok,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      responseSnippet: ok ? makeSnippet(text) : null,
      error: ok ? null : errorMsg,
    });
  }
}

// ---------- Account / Orders / Positions ----------

export interface AlpacaAccount {
  account_number: string;
  status: string;
  equity: string;
  last_equity: string;
  cash: string;
  portfolio_value: string;
  buying_power: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  asset_class: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id?: string;
  symbol: string;
  status: string;
  order_class?: string;
  legs?: AlpacaOrder[];
}

export async function getAccount(): Promise<AlpacaAccount> {
  return request<AlpacaAccount>(tradingBase(), "/v2/account", {}, { op: "GET /v2/account", category: "account" });
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  return request<AlpacaPosition[]>(tradingBase(), "/v2/positions", {}, { op: "GET /v2/positions", category: "trading" });
}

export async function getOpenOrders(): Promise<AlpacaOrder[]> {
  return request<AlpacaOrder[]>(
    tradingBase(),
    "/v2/orders?status=open&limit=50",
    {},
    { op: "GET /v2/orders", category: "trading" }
  );
}

export async function cancelOrder(orderId: string): Promise<void> {
  await request<unknown>(
    tradingBase(),
    `/v2/orders/${orderId}`,
    { method: "DELETE" },
    { op: "DELETE /v2/orders/{id}", category: "trading" }
  );
}

export interface MlegLegInput {
  symbol: string;
  ratio: number;
  side: "buy" | "sell";
}

/**
 * Place a multi-leg (Bull Call Spread) options order on paper trading.
 * limit_price is the net debit per share for the whole spread.
 */
export async function placeSpreadOrder(opts: {
  qty: number;
  limitPrice: number;
  legs: MlegLegInput[];
  clientId: string;
}): Promise<AlpacaOrder> {
  const body = {
    order_class: "mleg",
    qty: String(opts.qty),
    side: "buy",
    type: "limit",
    limit_price: Number(opts.limitPrice.toFixed(2)).toString(),
    time_in_force: "day",
    extended_hours: false,
    client_order_id: opts.clientId,
    legs: opts.legs.map((l) => ({
      symbol: l.symbol,
      ratio_qty: String(l.ratio),
      side: l.side,
    })),
  };
  return request<AlpacaOrder>(tradingBase(), "/v2/orders", {
    method: "POST",
    body: JSON.stringify(body),
  }, { op: "POST /v2/orders", category: "trading" });
}

/** Close an option position (full) by OCC symbol. */
export async function closePosition(symbol: string): Promise<AlpacaOrder> {
  return request<AlpacaOrder>(tradingBase(), `/v2/positions/${encodeURIComponent(symbol)}`, {
    method: "DELETE",
  }, { op: "DELETE /v2/positions/{symbol}", category: "trading" });
}

// ---------- Market data: stocks ----------

export interface StockBar {
  t: string;
  c: number;
}

export async function getStockBars(symbol: string, days = 70): Promise<StockBar[]> {
  const start = new Date(Date.now() - days * 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const res = await request<{ bars?: StockBar[] }>(
    dataBase(),
    `/v2/stocks/${symbol}/bars?timeframe=1Day&start=${start}&end=${end}&limit=200&feed=iex&adjustment=split`,
    {},
    { op: "GET market bars", category: "market" }
  );
  return res.bars || [];
}

export interface LatestQuote {
  bid_price: number;
  ask_price: number;
}

export async function getLatestStockQuote(symbol: string): Promise<LatestQuote | null> {
  try {
    const res = await request<{ quote?: LatestQuote }>(
      dataBase(),
      `/v2/stocks/${symbol}/quotes/latest?feed=iex`,
      {},
      { op: "GET latest quote", category: "market" }
    );
    return res.quote || null;
  } catch {
    return null;
  }
}

// ---------- Market data: options ----------

export interface OptionSnapshot {
  symbol: string;
  strike: number;
  expiry: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  openInterest: number;
  delta: number | null;
}

const OCC_RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;

export function parseOccSymbol(sym: string): {
  underlying: string;
  expiry: string;
  type: "C" | "P";
  strike: number;
} | null {
  const m = OCC_RE.exec(sym);
  if (!m) return null;
  const [, underlying, ymd, type, strikeStr] = m;
  const expiry = `20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`;
  return { underlying, expiry, type: type as "C" | "P", strike: parseInt(strikeStr, 10) / 1000 };
}

interface RawSnapshot {
  latestQuote?: {
    bp?: number; // bid price
    ap?: number; // ask price
    bs?: number; // bid size
    as?: number; // ask size
  };
  openInterest?: number;
  greeks?: { delta?: number };
}

/**
 * Fetch call option snapshots for an underlying with expirations in
 * [expGte, expLte] (YYYY-MM-DD). Paginates to see the full chain.
 * Returns normalized OptionSnapshot list.
 */
export async function getCallSnapshots(
  underlying: string,
  expGte: string,
  expLte: string
): Promise<OptionSnapshot[]> {
  const out: OptionSnapshot[] = [];
  let pageToken = "";
  for (let page = 0; page < 4; page++) {
    const path =
      `/v1beta1/options/snapshots/${underlying}?feed=indicative&type=call` +
      `&expiration_date_gte=${expGte}&expiration_date_lte=${expLte}&limit=500` +
      (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "");
    const res = await request<{ snapshots?: Record<string, RawSnapshot>; next_page_token?: string }>(
      dataBase(),
      path,
      {},
      { op: "GET options chain", category: "options" }
    );
    for (const [symbol, snap] of Object.entries(res.snapshots || {})) {
      const parsed = parseOccSymbol(symbol);
      if (!parsed) continue;
      out.push({
        symbol,
        strike: parsed.strike,
        expiry: parsed.expiry,
        bid: snap.latestQuote?.bp ?? 0,
        ask: snap.latestQuote?.ap ?? 0,
        bidSize: snap.latestQuote?.bs ?? 0,
        askSize: snap.latestQuote?.as ?? 0,
        // indicative feed omits open_interest/greeks -> stay 0/null; scanner
        // falls back to quote-size liquidity and a 1-sigma short-strike rule
        openInterest: snap.openInterest ?? 0,
        delta: snap.greeks?.delta ?? null,
      });
    }
    pageToken = res.next_page_token || "";
    if (!pageToken) break;
  }
  return out;
}

export function daysToExpiry(expiry: string, now = new Date()): number {
  const [y, m, d] = expiry.split("-").map(Number);
  const exp = new Date(Date.UTC(y, m - 1, d, 21, 0, 0)); // ~4pm ET
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 86400000));
}
