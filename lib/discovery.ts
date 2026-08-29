// Dynamic Market Discovery: fetch top gainers/losers/most-active from
// Alpaca, then qualify symbols for options availability and liquidity.
// Replaces the fixed SCAN_SYMBOLS-only approach with dynamic candidates.
import "server-only";

import {
  getCallSnapshots,
  getMarketMovers,
  IS_MOCK,
  type MoverStock,
} from "./alpaca";
import {
  mockMarketMovers,
  mockOptionsAvailable,
} from "./mock";
import type { MarketDiscovery, MarketMover } from "./types";
import { SCAN_SYMBOLS } from "./types";

/** Convert raw MoverStock to MarketMover with type tag. */
function toMover(m: MoverStock, moverType: MarketMover["moverType"]): MarketMover {
  return {
    symbol: m.symbol,
    name: m.name ?? m.symbol,
    price: m.price,
    changePct: m.changePct,
    volume: m.volume,
    moverType,
    qualified: false,
    qualificationReason: "Pending",
  };
}

/** Check if a symbol has options available by requesting a single snapshot page.
 *  If we get at least 1 result, options exist. */
async function checkOptionsAvailability(symbol: string): Promise<boolean> {
  if (IS_MOCK) return mockOptionsAvailable(symbol);
  try {
    const expGte = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const expLte = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    const snaps = await getCallSnapshots(symbol, expGte, expLte);
    return snaps.length > 0;
  } catch {
    return false;
  }
}

/** Qualify movers: check options availability + momentum threshold. */
async function qualifyMovers(
  movers: MarketMover[],
  concurrency = 3
): Promise<MarketMover[]> {
  const results: MarketMover[] = [];
  for (let i = 0; i < movers.length; i += concurrency) {
    const batch = movers.slice(i, i + concurrency);
    const checks = await Promise.all(
      batch.map(async (m) => {
        const hasOptions = await checkOptionsAvailability(m.symbol);
        // For gainers: need at least +1% change to qualify
        // For losers: always reject (we trade bull call spreads)
        // For active: need positive momentum
        let qualified = false;
        let reason = "";

        if (m.moverType === "loser") {
          qualified = false;
          reason = "Bearish — rejected for Bull Call Spread";
        } else if (!hasOptions) {
          qualified = false;
          reason = "No options available → Rejected";
        } else if (m.moverType === "gainer" && m.changePct < 1) {
          qualified = false;
          reason = "Low momentum → Rejected";
        } else if (m.moverType === "active" && m.changePct <= 0) {
          qualified = false;
          reason = "Negative momentum → Rejected";
        } else {
          qualified = true;
          reason = "Options Available → Qualified";
        }
        return { ...m, qualified, qualificationReason: reason };
      })
    );
    results.push(...checks);
  }
  return results;
}

/** Deduplicate symbols across categories, preferring gainer > active > loser. */
function deduplicateMovers(movers: MarketMover[]): MarketMover[] {
  const seen = new Map<string, MarketMover>();
  const priority: Record<MarketMover["moverType"], number> = {
    gainer: 0,
    active: 1,
    loser: 2,
  };
  for (const m of movers) {
    const existing = seen.get(m.symbol);
    if (!existing || priority[m.moverType] < priority[existing.moverType]) {
      seen.set(m.symbol, m);
    }
  }
  return [...seen.values()];
}

/** Run full market discovery pipeline. Never throws; errors result in empty lists. */
export async function discoverMarkets(): Promise<MarketDiscovery> {
  let topGainers: MarketMover[] = [];
  let topLosers: MarketMover[] = [];
  let mostActive: MarketMover[] = [];

  try {
    const raw = IS_MOCK ? mockMarketMovers() : await getMarketMovers();
    topGainers = (raw.topGainers || []).map((m) => toMover(m, "gainer"));
    topLosers = (raw.topLosers || []).map((m) => toMover(m, "loser"));
    mostActive = (raw.mostActive || []).map((m) => toMover(m, "active"));
  } catch {
    // Movers API may not be available; fall through to default watchlist
  }

  // Qualify all movers
  const allMovers = [...topGainers, ...mostActive, ...topLosers];
  const qualified = await qualifyMovers(allMovers);

  // Re-sort into categories after qualification
  topGainers = qualified.filter((m) => m.moverType === "gainer");
  topLosers = qualified.filter((m) => m.moverType === "loser");
  mostActive = qualified.filter((m) => m.moverType === "active");

  // Build qualified symbol list (deduplicated)
  const qualifiedSymbols = deduplicateMovers(qualified.filter((m) => m.qualified)).map((m) => m.symbol);

  // Build sniper candidates: top qualified gainers/active, then fill from default watchlist
  const dynamicCandidates = deduplicateMovers(
    qualified.filter((m) => m.qualified && m.moverType !== "loser")
  )
    .sort((a, b) => b.changePct - a.changePct)
    .map((m) => m.symbol);

  // Merge with default watchlist (always include them as a baseline)
  const seen = new Set(dynamicCandidates);
  const sniperCandidates = [...dynamicCandidates];
  for (const s of SCAN_SYMBOLS) {
    if (!seen.has(s)) sniperCandidates.push(s);
  }

  return {
    topGainers,
    topLosers,
    mostActive,
    qualifiedSymbols,
    sniperCandidates: sniperCandidates.slice(0, 15), // cap at 15 to control scan time
  };
}
