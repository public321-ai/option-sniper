// Shared types for Options Sniper

export const SCAN_SYMBOLS = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSLA"] as const;
export type ScanSymbol = (typeof SCAN_SYMBOLS)[number];

// ---------- Dynamic Market Discovery ----------

export interface MarketMover {
  symbol: string;
  name: string;
  price: number;
  changePct: number; // e.g. +5.2 => +5.2%
  volume: number;
  moverType: "gainer" | "loser" | "active";
  qualified: boolean; // has options + sufficient liquidity
  qualificationReason: string; // "Options Available → Qualified" or "Low momentum → Rejected"
}

export interface MarketDiscovery {
  topGainers: MarketMover[];
  topLosers: MarketMover[];
  mostActive: MarketMover[];
  qualifiedSymbols: string[]; // symbols that passed options/liquidity filter
  sniperCandidates: string[]; // top symbols for the agent to scan
}

// ---------- Options Intelligence ----------

export interface OptionGreeks {
  iv: number | null; // implied volatility (annualized, e.g. 0.342 = 34.2%)
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface OptionsIntelligence {
  symbol: string;
  greeks: OptionGreeks;
  optionVolume: number;
  openInterest: number;
  bidAskSpreadPct: number; // e.g. 0.031 = 3.1%
  expiry: string;
  strikeDistancePct: number; // distance of long strike from current price, e.g. 0.02 = 2% OTM
  liquidityRating: "GOOD" | "FAIR" | "POOR";
  volatilityRating: "LOW" | "NORMAL" | "ELEVATED" | "EXTREME";
  optionsQuality: number; // 0-100 composite score
}

// ---------- News + Corporate Action Risk ----------

export interface NewsItem {
  headline: string;
  source: string;
  ts: number; // epoch ms
  sentiment: "positive" | "neutral" | "negative";
}

export interface CorporateAction {
  symbol: string;
  type: "dividend" | "split" | "merger" | "earnings" | "other";
  description: string;
  date: string; // YYYY-MM-DD
}

export interface NewsRiskAssessment {
  symbol: string;
  recentNews: NewsItem[];
  sentiment: "Positive" | "Neutral" | "Negative";
  corporateActions: CorporateAction[];
  corporateActionStatus: "Clear" | "Warning";
  newsImpact: number; // -10 to +10 modifier
  riskWarning: string | null; // e.g. "Earnings in 3 days — elevated uncertainty"
}

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
  volume: number;
  iv: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
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
  optionsQuality: number;
  newsImpact: number;
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
  stopLoss: number; // per-share value that triggers max-loss exit
  profitTarget: number; // per-share value that triggers profit-taking exit
  exitSignal: string | null; // reason if agent wants to exit
}

export interface ClosedTrade {
  id: string; // underlying|expiry|call
  underlying: string;
  longStrike: number;
  shortStrike: number;
  expiry: string;
  entryDate: string; // ISO date of first fill
  exitDate: string; // ISO date of last fill
  entryDebit: number; // net debit per share at entry
  exitCredit: number; // net credit per share at exit
  qty: number; // number of spreads
  pnl: number; // total realized $ P&L
  pnlPct: number; // realized % P&L
  legs: { symbol: string; side: string; qty: number; price: number; netAmount: number }[];
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
  discovery: MarketDiscovery | null;
  intelligence: OptionsIntelligence | null;
  newsRisk: NewsRiskAssessment | null;
}
