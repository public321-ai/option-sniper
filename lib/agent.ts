// The Options Sniper agent: scan -> analyze -> score -> risk check ->
// paper trade -> monitor -> exit. Stateless: Alpaca is the only source of truth.
import {
  cancelOrder,
  closePosition,
  daysToExpiry,
  getAccount,
  getOpenOrders,
  getPositions,
  getStockBars,
  IS_MOCK,
  parseOccSymbol,
  placeSpreadOrder,
  type AlpacaAccount,
  type AlpacaPosition,
} from "./alpaca";
import {
  mockBars,
  mockClosePosition,
  mockGetAccount,
  mockGetPositions,
  mockPlaceSpread,
} from "./mock";
import { computeIndicators, scanAll, scoreOpportunity } from "./scanner";
import type {
  AccountView,
  AgentLogEntry,
  Decision,
  Opportunity,
  PositionLeg,
  ScanRow,
  SpreadPosition,
  TickResult,
} from "./types";
import { SCAN_SYMBOLS } from "./types";

const MIN_SCORE = Number(process.env.AGENT_MIN_SCORE || 75);
const MAX_RISK_PCT = Number(process.env.AGENT_MAX_RISK_PCT || 1.0); // % of equity per trade
const ENTRY_SLIPPAGE = 0.05; // per-share cushion above quoted debit to improve fills
// Auto-exit thresholds (tighter than 50% to lock in small gains / cut small losses)
const PROFIT_TARGET_PCT = Number(process.env.AGENT_PROFIT_PCT || 0.25); // take profit at +25%
const MAX_LOSS_PCT = Number(process.env.AGENT_MAX_LOSS_PCT || 0.20); // cut loss at -20%
const TIME_EXIT_DTE = Number(process.env.AGENT_TIME_EXIT_DTE || 7); // time exit at <= N DTE

export function logEntry(level: AgentLogEntry["level"], message: string, log: AgentLogEntry[]): void {
  log.push({ ts: Date.now(), level, message });
}

export async function getAccountView(): Promise<AccountView> {
  const acc: AlpacaAccount = IS_MOCK ? mockGetAccount() : await getAccount();
  return {
    accountNumber: acc.account_number,
    equity: Number(acc.equity),
    buyingPower: Number(acc.buying_power),
    cash: Number(acc.cash),
    portfolioValue: Number(acc.portfolio_value),
    lastEquity: Number(acc.last_equity),
    status: acc.status,
    mock: IS_MOCK,
  };
}

/** Build normalized spread views from raw Alpaca option positions. */
export async function buildSpreadPositions(rawPositions: AlpacaPosition[]): Promise<SpreadPosition[]> {
  const optionPositions = rawPositions.filter((p) => p.asset_class === "us_option");
  interface Group {
    underlying: string;
    expiry: string;
    legs: PositionLeg[];
  }
  const groups = new Map<string, Group>();
  for (const p of optionPositions) {
    const parsed = parseOccSymbol(p.symbol);
    if (!parsed) continue;
    const key = `${parsed.underlying}|${parsed.expiry}|${parsed.type}`;
    if (!groups.has(key)) groups.set(key, { underlying: parsed.underlying, expiry: parsed.expiry, legs: [] });
    groups.get(key)!.legs.push({
      symbol: p.symbol,
      qty: Number(p.qty),
      side: Number(p.qty) > 0 ? "long" : "short",
      strike: parsed.strike,
      avgEntryPrice: Number(p.avg_entry_price),
      currentPrice: Number(p.current_price),
      marketValue: Number(p.market_value),
    });
  }

  // Underlying trend data (for trend-reversal exits) - fetch once per underlying
  const trendCache = new Map<string, "bullish" | "bearish" | "neutral">();
  for (const g of groups.values()) {
    if (trendCache.has(g.underlying)) continue;
    try {
      const bars = IS_MOCK ? mockBars(g.underlying) : await getStockBars(g.underlying);
      trendCache.set(g.underlying, computeIndicators(bars).trend);
    } catch {
      trendCache.set(g.underlying, "neutral");
    }
  }

  const spreads: SpreadPosition[] = [];
  for (const [key, g] of groups) {
    const longLegs = g.legs.filter((l) => l.side === "long");
    const shortLegs = g.legs.filter((l) => l.side === "short");
    const netEntry = g.legs.reduce((acc, l) => acc + l.avgEntryPrice * l.qty, 0);
    const netValue = g.legs.reduce((acc, l) => acc + l.currentPrice * l.qty, 0);
    const spreadsQty = longLegs.reduce((acc, l) => acc + Math.abs(l.qty), 0) || 1;
    const pnlPct = netEntry !== 0 ? (netValue - netEntry) / netEntry : 0;
    // netEntry/netValue are totals across all spreads; report per-spread values
    const pnl = (netValue - netEntry) * 100;
    const dte = daysToExpiry(g.expiry);
    const trend = trendCache.get(g.underlying) ?? "neutral";

    // Exit rules: profit target, max loss, trend reversal, time exit
    let exitSignal: string | null = null;
    if (pnlPct >= PROFIT_TARGET_PCT)
      exitSignal = `TARGET HIT: +${Math.round(pnlPct * 100)}% profit (target ${(PROFIT_TARGET_PCT * 100).toFixed(0)}%)`;
    else if (pnlPct <= -MAX_LOSS_PCT)
      exitSignal = `MAX LOSS: ${Math.round(pnlPct * 100)}% of debit (limit ${(MAX_LOSS_PCT * 100).toFixed(0)}%)`;
    else if (dte <= TIME_EXIT_DTE)
      exitSignal = `TIME EXIT: ${dte} DTE (<= ${TIME_EXIT_DTE})`;
    else if (trend === "bearish") exitSignal = `TREND REVERSAL: ${g.underlying} turned bearish`;

    spreads.push({
      id: key,
      underlying: g.underlying,
      expiry: g.expiry,
      dte,
      qty: spreadsQty,
      legs: g.legs,
      entryDebit: Math.round((netEntry / spreadsQty) * 1000) / 1000,
      currentValue: Math.round((netValue / spreadsQty) * 1000) / 1000,
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: Math.round(pnlPct * 1000) / 1000,
      longStrike: longLegs[0]?.strike ?? 0,
      shortStrike: shortLegs[0]?.strike ?? 0,
      exitSignal,
    });
  }
  return spreads.sort((a, b) => a.underlying.localeCompare(b.underlying));
}

/** Enter a spread if the score and risk limits pass. Returns a decision. */
export async function evaluateAndEnter(
  best: Opportunity,
  account: AccountView,
  existingSpreads: SpreadPosition[],
  autoEnter: boolean,
  log: AgentLogEntry[]
): Promise<Decision> {
  const { candidate: cand, score } = best;
  const label = `${cand.underlying} ${cand.longLeg.strike}/${cand.shortLeg.strike}C ${cand.expiry} (${cand.dte} DTE)`;

  // Risk check: max loss of one spread must be <= MAX_RISK_PCT of equity
  const maxLossPerSpread = cand.maxLoss * 100;
  const riskPct = (maxLossPerSpread / account.equity) * 100;
  const maxRiskDollars = (account.equity * MAX_RISK_PCT) / 100;
  const suggestedQty = Math.max(0, Math.floor(maxRiskDollars / maxLossPerSpread));

  if (score < MIN_SCORE) {
    logEntry("info", `WAIT: ${label} scores ${score} < ${MIN_SCORE} threshold`, log);
    return { action: "WAIT", reason: `Score ${score} is below the ${MIN_SCORE} entry threshold`, score, riskPct };
  }
  if (riskPct > MAX_RISK_PCT) {
    logEntry("warn", `WAIT: ${label} risk ${riskPct.toFixed(2)}% of equity exceeds ${MAX_RISK_PCT}% limit`, log);
    return { action: "WAIT", reason: `Risk ${riskPct.toFixed(2)}% exceeds ${MAX_RISK_PCT}% per-trade limit`, score, riskPct };
  }
  if (suggestedQty < 1) {
    logEntry("warn", `WAIT: ${label} position sizing rounds to 0 spreads`, log);
    return { action: "WAIT", reason: "Position size rounds to zero spreads at this risk limit", score, riskPct };
  }
  if (existingSpreads.some((s) => s.underlying === cand.underlying)) {
    logEntry("info", `WAIT: already have an open ${cand.underlying} position - no pyramiding`, log);
    return { action: "WAIT", reason: `Open ${cand.underlying} position already exists`, score, riskPct };
  }

  if (!autoEnter) {
    logEntry("info", `ENTER approved (not submitted): ${label} score ${score}, risk ${riskPct.toFixed(2)}% - awaiting manual submit`, log);
    return { action: "ENTER", reason: "Signal approved - press SUBMIT TRADE to place the paper order", score, riskPct, suggestedQty };
  }

  try {
    // Cancel any stale sniper orders for this underlying before re-entering
    if (!IS_MOCK) {
      try {
        const open = await getOpenOrders();
        const stale = open.filter((o) => o.client_order_id?.startsWith(`sniper-${cand.underlying}-`));
        for (const s of stale) {
          await cancelOrder(s.id);
          logEntry("info", `Canceled stale ${cand.underlying} order ${s.id.slice(0, 8)}`, log);
        }
      } catch (err) {
        logEntry("warn", `Could not check/cancel stale orders: ${err instanceof Error ? err.message : String(err)}`, log);
      }
    }

    const qty = Math.min(suggestedQty, 10);
    const legs = [
      { symbol: cand.longLeg.symbol, ratio: 1, side: "buy" as const },
      { symbol: cand.shortLeg.symbol, ratio: 1, side: "sell" as const },
    ];
    const clientId = `sniper-${cand.underlying}-${cand.expiry}-${Date.now()}`;
    // Conservative debit + small slippage cushion so the limit fills in fast markets
    const limitPrice = Math.round((cand.debit + ENTRY_SLIPPAGE) * 100) / 100;
    if (IS_MOCK) {
      // demo brokerage fills each leg at its quoted price
      mockPlaceSpread({
        qty,
        legs: [
          { symbol: cand.longLeg.symbol, side: "buy", price: cand.longLeg.ask },
          { symbol: cand.shortLeg.symbol, side: "sell", price: cand.shortLeg.bid },
        ],
      });
    } else {
      await placeSpreadOrder({ qty, limitPrice, legs, clientId });
    }
    logEntry("trade", `ENTER: bought ${qty}x ${label} @ $${limitPrice.toFixed(2)} debit (max loss $${(maxLossPerSpread * qty).toFixed(0)}, max profit $${(cand.maxProfit * 100 * qty).toFixed(0)})`, log);
    logEntry("success", `Paper order submitted to Alpaca (${clientId})`, log);
    return { action: "ENTER", reason: `Paper order placed: ${qty} spread(s) @ $${limitPrice.toFixed(2)} debit`, score, riskPct, suggestedQty: qty };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logEntry("error", `Order failed for ${label}: ${msg}`, log);
    return { action: "WAIT", reason: `Order submission failed: ${msg}`, score, riskPct, suggestedQty };
  }
}

/** Close all legs of a spread. Short leg first, then long: closing the long
 *  leg while the short leg is still open would briefly leave a naked short
 *  option (rejected with 403 on level-3 accounts). */
export async function exitSpread(spread: SpreadPosition, reason: string, log: AgentLogEntry[]): Promise<boolean> {
  logEntry("trade", `EXIT ${spread.underlying} ${spread.longStrike}/${spread.shortStrike}C ${spread.expiry}: ${reason}`, log);
  try {
    const ordered = [...spread.legs].sort((a, b) => {
      if (a.side === b.side) return 0;
      return a.side === "short" ? -1 : 1;
    });
    for (const leg of ordered) {
      if (IS_MOCK) mockClosePosition(leg.symbol);
      else await closePosition(leg.symbol);
    }
    logEntry("success", `Closed ${spread.legs.length} leg(s) via Alpaca paper trading (short first, then long)`, log);
    return true;
  } catch (err) {
    logEntry("error", `Exit failed for ${spread.underlying} spread: ${err instanceof Error ? err.message : String(err)}`, log);
    return false;
  }
}

/**
 * One full agent tick. autoEnter=true submits approved trades automatically;
 * autoExit=true closes spreads that hit an exit rule.
 */
export async function runAgentTick(opts: { autoEnter: boolean; autoExit: boolean }): Promise<TickResult> {
  const log: AgentLogEntry[] = [];
  const startedAt = new Date();

  // 1) Account (Alpaca = source of truth)
  let account: AccountView | null = null;
  try {
    account = await getAccountView();
    logEntry("info", `Account: equity $${account.equity.toLocaleString()} | buying power $${account.buyingPower.toLocaleString()}`, log);
  } catch (err) {
    logEntry("error", `Account fetch failed: ${err instanceof Error ? err.message : String(err)}`, log);
    return {
      account: null, scan: [], best: null,
      decision: { action: "WAIT", reason: "Could not reach Alpaca account API" },
      positions: [], log, mock: IS_MOCK,
    };
  }

  // 2) Existing positions -> monitor / exit first
  let positions: SpreadPosition[] = [];
  try {
    const raw = IS_MOCK ? mockGetPositions() : await getPositions();
    positions = await buildSpreadPositions(raw);
    if (positions.length > 0 && opts.autoExit) {
      for (const spread of positions) {
        if (spread.exitSignal) await exitSpread(spread, spread.exitSignal, log);
      }
      const rawAfter = IS_MOCK ? mockGetPositions() : await getPositions();
      positions = await buildSpreadPositions(rawAfter);
    } else if (positions.length > 0) {
      for (const spread of positions) {
        if (spread.exitSignal) logEntry("warn", `EXIT SIGNAL on ${spread.underlying} spread: ${spread.exitSignal} (auto-exit off)`, log);
      }
    }
  } catch (err) {
    logEntry("error", `Position fetch failed: ${err instanceof Error ? err.message : String(err)}`, log);
  }

  // 3) Scan -> analyze -> score
  logEntry("info", `Scanning ${SCAN_SYMBOLS.join(", ")} for bullish Bull Call Spread setups...`, log);
  const scan: ScanRow[] = await scanAll(SCAN_SYMBOLS);
  const bullish = scan.filter((r) => r.indicators.trend === "bullish");
  logEntry("info", `Bullish trend: ${bullish.length ? bullish.map((r) => r.symbol).join(", ") : "none"} | neutral/bearish: ${scan.filter((r) => r.indicators.trend !== "bullish").map((r) => r.symbol).join(", ") || "none"}`, log);

  // 4) Best opportunity across the watchlist
  let best: Opportunity | null = null;
  for (const row of scan) {
    if (row.candidate && row.candidateScore !== null) {
      if (!best || row.candidateScore > best.score) {
        best = {
          candidate: row.candidate,
          score: row.candidateScore,
          breakdown: scoreOpportunity(row.candidate, row.indicators).breakdown,
        };
      }
    }
  }

  // 5) Decision (score >= 75 and risk <= 1% of equity => ENTER, else WAIT)
  let decision: Decision;
  if (!best) {
    decision = { action: "WAIT", reason: "No qualified Bull Call Spread found in the current market" };
    logEntry("info", "WAIT: no qualified opportunity across the watchlist", log);
  } else {
    decision = await evaluateAndEnter(best, account, positions, opts.autoEnter, log);
  }

  logEntry("info", `Tick complete in ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s`, log);
  return { account, scan, best, decision, positions, log, mock: IS_MOCK };
}
