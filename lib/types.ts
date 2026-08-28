// Shared types for Options Sniper

export const SCAN_SYMBOLS = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSLA"] as const;
export type ScanSymbol = (typeof SCAN_SYMBOLS)[number];

export interface Indicators {
  price: number;
  ma20: number | null;
  ma50: number | null;
  rsi: number | null;
  momentum: number | null; // % change over the last N bars
  trend: "bullish" | "bearish" | "neutral";
}

export interface OptionLegQuote {
  symbol: string;
  strike: number;
  expiry: string; // YYYY-MM-DD
  bid: number;
  ask: number;
  mid: number;
  bidSize: number;
  askSize: number;
  openInterest: number;
  delta: number | null;
}

export interface SpreadCandidate {
  underlying: string;
  longLeg: OptionLegQuote;
  shortLeg: OptionLegQuote;
  longStrike: number;
  shortStrike: number;
  expiry: string;
  dte: number;
  width: number;
  debit: number; // per share (long ask - short bid)
  maxProfit: number; // per share (width - debit)
  maxLoss: number; // per share (debit)
  riskReward: number;
}

export interface ScanRow {
  symbol: string;
  indicators: Indicators;
  candidate: SpreadCandidate | null;
  candidateScore: number | null;
  error?: string;
}

export interface ScoreBreakdown {
  trend: number;
  rsi: number;
  momentum: number;
  liquidity: number;
  riskReward: number;
}

export interface Opportunity {
  candidate: SpreadCandidate;
  score: number; // 0-100
  breakdown: ScoreBreakdown;
}

export interface Decision {
  action: "ENTER" | "WAIT" | "HOLD" | "EXIT";
  reason: string;
  score?: number;
  riskPct?: number; // max loss as % of equity for 1 spread
  suggestedQty?: number;
}

export interface AccountView {
  accountNumber: string;
  equity: number;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  lastEquity: number;
  status: string;
  mock: boolean;
}

export interface PositionLeg {
  symbol: string;
  qty: number; // signed
  side: "long" | "short";
  strike: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
}

export interface SpreadPosition {
  id: string; // underlying|expiry|call
  underlying: string;
  expiry: string;
  dte: number;
  qty: number; // number of spreads (long leg qty)
  legs: PositionLeg[];
  entryDebit: number; // net debit per share at entry
  currentValue: number; // net value per share now
  pnl: number; // $ per spread (x100 multiplier)
  pnlPct: number;
  longStrike: number;
  shortStrike: number;
  exitSignal: string | null; // reason if agent wants to exit
}

export interface AgentLogEntry {
  ts: number;
  level: "info" | "success" | "warn" | "error" | "trade";
  message: string;
}

export interface TickResult {
  account: AccountView | null;
  scan: ScanRow[];
  best: Opportunity | null;
  decision: Decision;
  positions: SpreadPosition[];
  log: AgentLogEntry[];
  mock: boolean;
}
