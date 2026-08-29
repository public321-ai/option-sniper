// DEMO-ONLY deterministic market simulator. Used exclusively when
// ALPACA_MOCK=true so the full agent pipeline can be validated/demoed without
// Alpaca keys. When ALPACA_MOCK is not set, none of this code runs and all data
// comes from the real Alpaca paper APIs.
import type { AlpacaAccount, AlpacaPosition, MoverStock, OptionSnapshot, StockBar } from "./alpaca";
import { daysToExpiry } from "./alpaca";
import { recordApiCall, type ApiCategory } from "./apiMonitor";
import type { AlpacaCorporateAction, AlpacaNewsArticle } from "./alpaca";

/** Record a mock-mode Alpaca call so the Integration Monitor shows activity in demos too. */
function recMock(op: string, category: ApiCategory, method: string, path: string, snippet: string | null = null): void {
  recordApiCall({ op, category, method, path, status: 200, ok: true, durationMs: 0.1, responseSnippet: snippet, mock: true });
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Base price + regime per symbol: "up" = bullish trend, "flat", "down"
const SYMBOL_CONFIG: Record<string, { price: number; regime: "up" | "flat" | "down"; vol: number }> = {
  SPY: { price: 570, regime: "up", vol: 0.012 },
  QQQ: { price: 480, regime: "up", vol: 0.015 },
  IWM: { price: 215, regime: "down", vol: 0.016 },
  AAPL: { price: 228, regime: "up", vol: 0.018 },
  MSFT: { price: 415, regime: "flat", vol: 0.014 },
  NVDA: { price: 128, regime: "up", vol: 0.028 },
  TSLA: { price: 250, regime: "up", vol: 0.032 },
};

/** Deterministic daily close series (same within a given day so scans are stable). */
export function mockBars(symbol: string): StockBar[] {
  const cfg = SYMBOL_CONFIG[symbol] || SYMBOL_CONFIG.SPY;
  const today = new Date();
  const dayKey = today.toISOString().slice(0, 10);
  const rand = mulberry32(seedFrom(symbol + dayKey));
  const bars: StockBar[] = [];
  const n = 70;
  let price = cfg.price * (1 - (cfg.regime === "up" ? 0.035 : cfg.regime === "down" ? -0.05 : 0.005));
  for (let i = 0; i < n; i++) {
    const trend =
      cfg.regime === "up" ? 0.0011 : cfg.regime === "down" ? -0.0014 : (rand() - 0.5) * 0.001;
    const noise = (rand() - 0.5) * 2 * cfg.vol;
    price = price * (1 + trend + noise);
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i) * 1.4);
    bars.push({ t: d.toISOString(), c: Math.round(price * 100) / 100 });
  }
  recMock("GET market bars", "market", "GET", `/v2/stocks/${symbol}/bars`);
  return bars;
}

/** Current underlying price consistent with mockBars. */
export function mockUnderlyingPrice(symbol: string): number {
  const bars = mockBars(symbol);
  return bars[bars.length - 1].c;
}

// --- Black-Scholes call pricing (r=4%, no dividends) for realistic mocks ---
function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation of erf
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)) * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

function bsCall(strike: number, spot: number, dte: number, vol: number): { price: number; delta: number; gamma: number; theta: number; vega: number; iv: number } {
  const T = Math.max(dte, 1) / 365;
  const sigma = Math.max(vol * Math.sqrt(252), 0.1); // daily vol -> annualized
  const r = 0.04;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const price = spot * normCdf(d1) - strike * Math.exp(-r * T) * normCdf(d2);
  const delta = normCdf(d1);
  // Approximate Greeks
  const gammaVal = normCdf(d1) / (spot * sigma * sqrtT); // standard gamma approx
  const thetaVal = -(spot * normCdf(d1) * sigma) / (2 * sqrtT) / 365; // daily theta
  const vegaVal = spot * normCdf(d1) * sqrtT / 100; // per 1% vol change
  return { price: Math.max(0.03, price), delta, gamma: gammaVal, theta: thetaVal, vega: vegaVal, iv: sigma };
}

function mockCall(strike: number, spot: number, dte: number, vol: number) {
  return bsCall(strike, spot, dte, vol);
}

function nextExpiries(dteMin: number, dteMax: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let d = dteMin; d <= dteMax; d += 7) {
    const e = new Date(today);
    e.setDate(today.getDate() + d);
    while (e.getUTCDay() !== 5) e.setUTCDate(e.getUTCDate() + 1); // roll to Friday
    out.push(e.toISOString().slice(0, 10));
  }
  return [...new Set(out)];
}

function occSymbol(underlying: string, expiry: string, type: "C" | "P", strike: number): string {
  const ymd = expiry.replace(/-/g, "").slice(2);
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${underlying}${ymd}${type}${strikeStr}`;
}

export function mockCallSnapshots(underlying: string, expGte: string, expLte: string): OptionSnapshot[] {
  const cfg = SYMBOL_CONFIG[underlying] || SYMBOL_CONFIG.SPY;
  const spot = mockUnderlyingPrice(underlying);
  const expiries = nextExpiries(14, 45).filter(
    (e) => e >= expGte.slice(0, 10) && e <= expLte.slice(0, 10)
  );
  const rand = mulberry32(seedFrom(underlying + expGte + expLte));
  const out: OptionSnapshot[] = [];
  const step = Math.max(1, Math.round(spot * 0.01));
  const baseStrike = Math.round(spot / step) * step;
  for (const expiry of expiries) {
    const dte = daysToExpiry(expiry);
    for (let k = -8; k <= 12; k++) {
      const strike = baseStrike + k * step;
      if (strike <= 0) continue;
      const { price, delta, gamma: gammaVal, theta: thetaVal, vega: vegaVal, iv } = mockCall(strike, spot, dte, cfg.vol);
      const spreadPct = 0.01 + rand() * 0.04;
      const half = Math.max(0.01, (price * spreadPct) / 2);
      const oi = Math.round(150 + rand() * 9000 + (Math.abs(spot - strike) < step * 2 ? 8000 : 0));
      const vol = Math.round(50 + rand() * 4000);
      out.push({
        symbol: occSymbol(underlying, expiry, "C", strike),
        strike,
        expiry,
        bid: Math.round(Math.max(0.01, price - half) * 100) / 100,
        ask: Math.round((price + half) * 100) / 100,
        bidSize: Math.round(5 + rand() * 45),
        askSize: Math.round(5 + rand() * 45),
        openInterest: oi,
        delta: Math.round(Math.min(0.95, Math.max(0.02, delta)) * 100) / 100,
        volume: vol,
        iv: Math.round(iv * 1000) / 1000,
        gamma: Math.round(Math.max(0, gammaVal) * 10000) / 10000,
        theta: Math.round(thetaVal * 10000) / 10000,
        vega: Math.round(vegaVal * 1000) / 1000,
      });
    }
  }
  recMock("GET options chain", "options", "GET", `/v1beta1/options/snapshots/${underlying}`);
  return out;
}

// ---- In-memory demo brokerage (module state; resets on cold start) ----

interface MockLeg {
  symbol: string;
  qty: number; // signed
  avg_entry_price: number;
  openedAt: number;
}

const mockPositions = new Map<string, MockLeg>(); // key: symbol
const mockOrders: { id: string; symbol: string; status: string; created_at: string }[] = [];

export function mockGetAccount(): AlpacaAccount {
  const equity = 100000;
  const positionsValue = [...mockPositions.values()].reduce(
    (acc, l) => acc + l.qty * mockOptionPrice(l.symbol),
    0
  );
  const acc: AlpacaAccount = {
    account_number: "MOCK-PAPER-0001",
    status: "ACTIVE",
    equity: String(Math.round((equity + positionsValue) * 100) / 100),
    last_equity: String(equity),
    cash: String(Math.round(equity * 100) / 100),
    portfolio_value: String(Math.round(positionsValue * 100) / 100),
    buying_power: String(Math.round(equity * 2 * 100) / 100),
  };
  recMock("GET /v2/account", "account", "GET", "/v2/account", JSON.stringify(acc, null, 2));
  return acc;
}

export function mockOptionPrice(symbol: string): number {
  const parsed = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(symbol);
  if (!parsed) return 1;
  const [, underlying, ymd, type, strikeStr] = parsed;
  const cfg = SYMBOL_CONFIG[underlying] || SYMBOL_CONFIG.SPY;
  const spot = mockUnderlyingPrice(underlying);
  const expiry = `20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`;
  const dte = daysToExpiry(expiry);
  const strike = parseInt(strikeStr, 10) / 1000;
  if (type === "C") return mockCall(strike, spot, dte, cfg.vol).price;
  return Math.max(0.03, mockCall(strike, spot, dte, cfg.vol).price - (spot - strike) + 0.02);
}

export function mockGetPositions(): AlpacaPosition[] {
  const positions: AlpacaPosition[] = [...mockPositions.entries()].map(([symbol, leg]) => {
    const price = mockOptionPrice(symbol);
    return {
      symbol,
      qty: String(leg.qty),
      side: leg.qty > 0 ? "long" : "short",
      avg_entry_price: String(leg.avg_entry_price),
      current_price: String(Math.round(price * 100) / 100),
      market_value: String(Math.round(leg.qty * price * 100) / 100),
      cost_basis: String(leg.qty * leg.avg_entry_price),
      asset_class: "us_option",
    };
  });
  recMock("GET /v2/positions", "trading", "GET", "/v2/positions", JSON.stringify(positions));
  return positions;
}

export function mockPlaceSpread(opts: {
  qty: number;
  legs: { symbol: string; side: "buy" | "sell"; price: number }[];
}): { id: string } {
  const orderId = `mock-${Date.now()}`;
  for (const leg of opts.legs) {
    const signedQty = leg.side === "buy" ? opts.qty : -opts.qty;
    const existing = mockPositions.get(leg.symbol);
    if (existing) {
      const totalQty = existing.qty + signedQty;
      if (totalQty === 0) mockPositions.delete(leg.symbol);
      else
        mockPositions.set(leg.symbol, {
          ...existing,
          qty: totalQty,
          avg_entry_price: Math.abs(
            (existing.avg_entry_price * existing.qty + leg.price * signedQty) / totalQty
          ),
        });
    } else {
      mockPositions.set(leg.symbol, {
        symbol: leg.symbol,
        qty: signedQty,
        avg_entry_price: leg.price,
        openedAt: Date.now(),
      });
    }
  }
  mockOrders.unshift({
    id: orderId,
    symbol: opts.legs.map((l) => l.symbol).join("+"),
    status: "filled",
    created_at: new Date().toISOString(),
  });
  recMock("POST /v2/orders", "trading", "POST", "/v2/orders", JSON.stringify(mockOrders[0]));
  return { id: orderId };
}

export function mockClosePosition(symbol: string): { id: string } {
  mockPositions.delete(symbol);
  const id = `mock-close-${Date.now()}`;
  const order = { id, symbol, status: "closed", created_at: new Date().toISOString() };
  mockOrders.unshift(order);
  recMock("DELETE /v2/positions/{symbol}", "trading", "DELETE", `/v2/positions/${symbol}`, JSON.stringify(order));
  return { id };
}

// ---- Mock Market Discovery ----

const MOVER_CONFIG: { symbol: string; name: string; price: number; changePct: number; volume: number }[] = [
  { symbol: "NVDA", name: "NVIDIA Corp", price: 128, changePct: 5.2, volume: 85_000_000 },
  { symbol: "AMD", name: "Advanced Micro Devices", price: 175, changePct: 4.7, volume: 62_000_000 },
  { symbol: "META", name: "Meta Platforms", price: 530, changePct: 3.8, volume: 28_000_000 },
  { symbol: "AVGO", name: "Broadcom Inc", price: 165, changePct: 3.1, volume: 18_000_000 },
  { symbol: "PLTR", name: "Palantir Technologies", price: 38, changePct: 2.9, volume: 55_000_000 },
  { symbol: "AAPL", name: "Apple Inc", price: 228, changePct: 1.1, volume: 42_000_000 },
  { symbol: "COIN", name: "Coinbase Global", price: 245, changePct: -4.2, volume: 22_000_000 },
  { symbol: "RIVN", name: "Rivian Automotive", price: 14, changePct: -3.8, volume: 35_000_000 },
  { symbol: "SNAP", name: "Snap Inc", price: 11, changePct: -2.9, volume: 48_000_000 },
  { symbol: "INTC", name: "Intel Corp", price: 22, changePct: -2.1, volume: 58_000_000 },
  { symbol: "TSLA", name: "Tesla Inc", price: 250, changePct: 2.4, volume: 120_000_000 },
  { symbol: "SPY", name: "S&P 500 ETF", price: 570, changePct: 0.6, volume: 95_000_000 },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 480, changePct: 0.8, volume: 72_000_000 },
];

export function mockMarketMovers(): {
  topGainers: MoverStock[];
  topLosers: MoverStock[];
  mostActive: MoverStock[];
} {
  const movers: MoverStock[] = MOVER_CONFIG.map((m) => ({
    symbol: m.symbol,
    name: m.name,
    price: m.price,
    change: Math.round(m.price * m.changePct / 100 * 100) / 100,
    changePct: m.changePct,
    volume: m.volume,
  }));
  recMock("GET market movers", "market", "GET", "/v1beta1/screener/stocks/movers?top=10");
  recMock("GET most active", "market", "GET", "/v1beta1/screener/stocks/most-actives");
  return {
    topGainers: movers.filter((m) => m.changePct > 0).sort((a, b) => b.changePct - a.changePct),
    topLosers: movers.filter((m) => m.changePct < 0).sort((a, b) => a.changePct - b.changePct),
    mostActive: [...movers].sort((a, b) => b.volume - a.volume),
  };
}

/** All mock symbols have options available. */
export function mockOptionsAvailable(symbol: string): boolean {
  return Object.hasOwn(SYMBOL_CONFIG, symbol) || MOVER_CONFIG.some((m) => m.symbol === symbol);
}

// ---- Mock News ----

const MOCK_NEWS: Record<string, { headline: string; source: string; sentiment: number }[]> = {
  NVDA: [
    { headline: "NVIDIA beats Q2 earnings expectations with record data center revenue", source: "Reuters", sentiment: 0.8 },
    { headline: "NVIDIA announces next-gen GPU architecture at GTC conference", source: "Bloomberg", sentiment: 0.7 },
    { headline: "Analysts raise NVIDIA price targets after strong guidance", source: "MarketWatch", sentiment: 0.5 },
  ],
  AMD: [
    { headline: "AMD gains market share in server processors", source: "CNBC", sentiment: 0.6 },
    { headline: "AMD earnings call highlights AI chip growth", source: "Barrons", sentiment: 0.4 },
  ],
  AAPL: [
    { headline: "Apple announces new iPhone lineup at fall event", source: "TechCrunch", sentiment: 0.3 },
    { headline: "Apple Services revenue hits all-time high", source: "WSJ", sentiment: 0.5 },
  ],
  TSLA: [
    { headline: "Tesla deliveries exceed Wall Street estimates", source: "Reuters", sentiment: 0.6 },
    { headline: "Tesla recalls 200K vehicles over seatbelt issue", source: "AP", sentiment: -0.5 },
  ],
  META: [
    { headline: "Meta advertising revenue surges on AI-powered targeting", source: "Bloomberg", sentiment: 0.7 },
  ],
  QQQ: [
    { headline: "Tech sector leads market rally as inflation data cools", source: "CNBC", sentiment: 0.4 },
  ],
  SPY: [
    { headline: "S&P 500 reaches new all-time high on broad gains", source: "MarketWatch", sentiment: 0.3 },
  ],
};

export function mockNews(symbol: string): AlpacaNewsArticle[] {
  const articles = MOCK_NEWS[symbol] || [
    { headline: `No major news for ${symbol}`, source: "Wire", sentiment: 0 },
  ];
  recMock("GET news", "market", "GET", `/v1beta1/news?symbols=${symbol}`);
  return articles.map((a, i) => ({
    id: i + 1,
    headline: a.headline,
    source: a.source,
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
    symbols: [symbol],
  }));
}

// ---- Mock Corporate Actions ----

export function mockCorporateActions(symbol: string): AlpacaCorporateAction[] {
  recMock("GET corporate actions", "market", "GET", `/v1/corporate-actions?symbols=${symbol}`);
  // Most symbols have no corporate actions
  const caMap: Record<string, AlpacaCorporateAction[]> = {
    AAPL: [{
      id: "ca-aapl-div",
      type: "cash_dividend",
      symbol: "AAPL",
      ex_date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
      record_date: new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10),
      payable_date: new Date(Date.now() + 17 * 86400000).toISOString().slice(0, 10),
      rate: 0.25,
    }],
  };
  return caMap[symbol] || [];
}
