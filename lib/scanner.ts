// Market scanning pipeline:
// bars -> MA20/MA50/RSI/momentum -> bullish trend filter -> options chain ->
// Bull Call Spread construction (14-45 DTE) -> 0-100 scoring.
import {
  getCallSnapshots,
  getStockBars,
  IS_MOCK,
  type OptionSnapshot,
} from "./alpaca";
import { mockBars, mockCallSnapshots } from "./mock";
import { clamp, momentum, rsi, sma } from "./indicators";
import type { Indicators, ScanRow, ScoreBreakdown, SpreadCandidate } from "./types";

const MIN_DTE = 14;
const MAX_DTE = 45;

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysToExpiryLocal(expiry: string): number {
  const [y, m, d] = expiry.split("-").map(Number);
  const exp = new Date(Date.UTC(y, m - 1, d, 21, 0, 0));
  return Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000));
}

export function computeIndicators(bars: { c: number }[]): Indicators {
  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const rsiVal = rsi(closes, 14);
  const mom = momentum(closes, 5);
  let trend: Indicators["trend"] = "neutral";
  if (ma20 !== null && ma50 !== null) {
    if (price > ma20 && ma20 > ma50) trend = "bullish";
    else if (price < ma20 && ma20 < ma50) trend = "bearish";
  }
  return { price, ma20, ma50, rsi: rsiVal, momentum: mom, trend };
}

/** Liquidity check per leg. The free indicative feed omits open_interest, so
 *  when OI is unknown (0) we fall back to visible quote sizes. */
function legIsLiquid(c: OptionSnapshot): boolean {
  if (c.bid <= 0 || c.ask <= 0) return false;
  const mid = (c.bid + c.ask) / 2;
  if ((c.ask - c.bid) / mid > 0.25) return false;
  if (c.openInterest >= 100) return true;
  return c.openInterest === 0 && c.bidSize >= 1 && c.askSize >= 1;
}

/** Build every viable Bull Call Spread candidate from a raw call chain. */
export function buildSpreadCandidates(
  underlying: string,
  spot: number,
  calls: OptionSnapshot[]
): SpreadCandidate[] {
  const byExpiry = new Map<string, OptionSnapshot[]>();
  for (const c of calls) {
    const dte = daysToExpiryLocal(c.expiry);
    if (dte < MIN_DTE || dte > MAX_DTE) continue;
    if (!legIsLiquid(c)) continue;
    if (!byExpiry.has(c.expiry)) byExpiry.set(c.expiry, []);
    byExpiry.get(c.expiry)!.push(c);
  }

  const candidates: SpreadCandidate[] = [];
  for (const [expiry, legs] of byExpiry) {
    legs.sort((a, b) => a.strike - b.strike);
    // Long leg: ATM (first strike >= spot)
    const long = legs.find((l) => l.strike >= spot);
    if (!long) continue;
    // Short leg: >= ~3% above spot; pick delta closest to 0.30 when greeks are
    // available, otherwise the strike nearest a 1-sigma OTM move (~15% vol).
    const minShortStrike = long.strike + Math.max(spot * 0.03, 1);
    const shortPool = legs.filter((l) => l.strike >= minShortStrike);
    if (shortPool.length === 0) continue;
    const dte = daysToExpiryLocal(expiry);
    const targetStrike = spot + spot * 0.15 * Math.sqrt(dte / 365);
    const short = shortPool.reduce((best, l) => {
      if (l.delta != null && best.delta != null) {
        return Math.abs(l.delta - 0.3) < Math.abs(best.delta - 0.3) ? l : best;
      }
      return Math.abs(l.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? l : best;
    }, shortPool[0]);
    if (short.strike <= long.strike) continue;

    const width = short.strike - long.strike;
    const debit = long.ask - short.bid; // conservative: pay the ask, hit the bid
    if (debit <= 0.15 || debit >= width) continue;
    const maxProfit = width - debit;
    const maxLoss = debit;
    const riskReward = maxProfit / maxLoss;
    if (riskReward < 0.8) continue;

    candidates.push({
      underlying,
      longLeg: { ...long, mid: (long.bid + long.ask) / 2 },
      shortLeg: { ...short, mid: (short.bid + short.ask) / 2 },
      longStrike: long.strike,
      shortStrike: short.strike,
      expiry,
      dte: daysToExpiryLocal(expiry),
      width,
      debit: Math.round(debit * 100) / 100,
      maxProfit: Math.round(maxProfit * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
      riskReward: Math.round(riskReward * 100) / 100,
    });
  }
  return candidates;
}

/**
 * Score a spread 0-100.
 * Weights: trend 25, RSI 20, momentum 20, liquidity 15, risk/reward 20.
 */
export function scoreOpportunity(
  cand: SpreadCandidate,
  ind: Indicators
): { score: number; breakdown: ScoreBreakdown } {
  // Trend (25): price>MA20>MA50 already required; reward MA separation
  const maSep = ind.ma20 !== null && ind.ma50 !== null ? (ind.ma20 - ind.ma50) / (ind.ma50 || 1) : 0;
  const trendScore = clamp(12 + (maSep / 0.03) * 13, 0, 25);

  // RSI (20): sweet spot 50-65 (bullish momentum, not overbought)
  const r = ind.rsi ?? 50;
  let rsiScore: number;
  if (r >= 50 && r <= 65) rsiScore = 20;
  else if (r > 65 && r <= 72) rsiScore = 20 - (r - 65) * 2;
  else if (r >= 40 && r < 50) rsiScore = 10 + (r - 40);
  else if (r < 40) rsiScore = clamp((r - 25) * 0.6, 0, 10);
  else rsiScore = 0; // >72 overbought
  rsiScore = clamp(rsiScore, 0, 20);

  // Momentum (20): 5-bar ROC; +2.5% or more => full
  const m = ind.momentum ?? 0;
  const momentumScore = clamp(10 + (m / 2.5) * 10, 0, 20);

  // Liquidity (15): open interest when available, quote sizes otherwise,
  // plus tight bid/ask spreads
  const oi = Math.min(cand.longLeg.openInterest, cand.shortLeg.openInterest);
  const size = Math.min(cand.longLeg.bidSize, cand.longLeg.askSize, cand.shortLeg.bidSize, cand.shortLeg.askSize);
  const depthScore =
    oi > 0
      ? (clamp(Math.log10(oi / 100 + 1), 0, 2) / 2) * 8
      : clamp(Math.log10(size + 1) / Math.log10(51), 0, 1) * 8; // 50+ contracts depth => full
  const longSpreadPct = (cand.longLeg.ask - cand.longLeg.bid) / cand.longLeg.mid;
  const shortSpreadPct = (cand.shortLeg.ask - cand.shortLeg.bid) / cand.shortLeg.mid;
  const avgSpreadPct = (longSpreadPct + shortSpreadPct) / 2;
  const spreadScore = 7 * (1 - avgSpreadPct / 0.25);
  const liquidityScore = clamp(depthScore + spreadScore, 0, 15);

  // Risk/reward (20): RR >= 2 => full
  const rrScore = clamp((cand.riskReward / 2) * 20, 0, 20);

  const breakdown: ScoreBreakdown = {
    trend: Math.round(trendScore * 10) / 10,
    rsi: Math.round(rsiScore * 10) / 10,
    momentum: Math.round(momentumScore * 10) / 10,
    liquidity: Math.round(liquidityScore * 10) / 10,
    riskReward: Math.round(rrScore * 10) / 10,
  };
  const total =
    breakdown.trend + breakdown.rsi + breakdown.momentum + breakdown.liquidity + breakdown.riskReward;
  return { score: Math.round(clamp(total, 0, 100) * 10) / 10, breakdown };
}

/** Analyze a single symbol end-to-end. Never throws; errors land on the row. */
export async function analyzeSymbol(symbol: string): Promise<ScanRow> {
  const emptyInd: Indicators = {
    price: 0, ma20: null, ma50: null, rsi: null, momentum: null, trend: "neutral",
  };
  try {
    const bars = IS_MOCK ? mockBars(symbol) : await getStockBars(symbol);
    if (bars.length < 55) {
      return { symbol, indicators: emptyInd, candidate: null, candidateScore: null, error: "not enough bar history" };
    }
    const ind = computeIndicators(bars);
    if (ind.trend !== "bullish") {
      return { symbol, indicators: ind, candidate: null, candidateScore: null };
    }
    const calls = IS_MOCK
      ? mockCallSnapshots(symbol, dateOffset(MIN_DTE), dateOffset(MAX_DTE))
      : await getCallSnapshots(symbol, dateOffset(MIN_DTE), dateOffset(MAX_DTE));
    const candidates = buildSpreadCandidates(symbol, ind.price, calls);
    if (candidates.length === 0) {
      return { symbol, indicators: ind, candidate: null, candidateScore: null };
    }
    let best: SpreadCandidate | null = null;
    let bestScore = -1;
    for (const cand of candidates) {
      const { score } = scoreOpportunity(cand, ind);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    return { symbol, indicators: ind, candidate: best, candidateScore: bestScore };
  } catch (err) {
    return { symbol, indicators: emptyInd, candidate: null, candidateScore: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function scanAll(symbols: readonly string[]): Promise<ScanRow[]> {
  return Promise.all(symbols.map((s) => analyzeSymbol(s)));
}
