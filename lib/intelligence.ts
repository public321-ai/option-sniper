// Options Intelligence: analyze Greeks, IV, liquidity, and option quality
// for a spread candidate. Feeds into the Opportunity Score.
import "server-only";

import { IS_MOCK, type OptionSnapshot } from "./alpaca";
import type { OptionGreeks, OptionsIntelligence } from "./types";

/** Classify bid/ask spread into a liquidity rating. */
function liquidityRating(spreadPct: number): "GOOD" | "FAIR" | "POOR" {
  if (spreadPct <= 0.05) return "GOOD"; // <= 5% spread
  if (spreadPct <= 0.15) return "FAIR"; // <= 15% spread
  return "POOR";
}

/** Classify IV into a volatility rating. */
function volatilityRating(iv: number | null): "LOW" | "NORMAL" | "ELEVATED" | "EXTREME" {
  if (iv === null) return "NORMAL"; // unknown => neutral
  if (iv < 0.2) return "LOW";
  if (iv < 0.4) return "NORMAL";
  if (iv < 0.7) return "ELEVATED";
  return "EXTREME";
}

/** Compute a 0-100 options quality score from the intelligence data. */
function computeOptionsQuality(opts: {
  spreadPct: number;
  oi: number;
  volume: number;
  ivRating: "LOW" | "NORMAL" | "ELEVATED" | "EXTREME";
}): number {
  let score = 0;

  // Bid/ask spread quality (40 pts): tighter is better
  if (opts.spreadPct <= 0.03) score += 40;
  else if (opts.spreadPct <= 0.05) score += 35;
  else if (opts.spreadPct <= 0.10) score += 25;
  else if (opts.spreadPct <= 0.20) score += 15;
  else score += 5;

  // Open interest depth (30 pts): more is better
  if (opts.oi >= 1000) score += 30;
  else if (opts.oi >= 500) score += 25;
  else if (opts.oi >= 100) score += 18;
  else if (opts.oi >= 50) score += 10;
  else score += 3;

  // Option volume (20 pts): active trading is better
  if (opts.volume >= 500) score += 20;
  else if (opts.volume >= 200) score += 15;
  else if (opts.volume >= 50) score += 10;
  else if (opts.volume >= 10) score += 5;
  else score += 2;

  // IV sweet spot (10 pts): NORMAL and ELEVATED are good for credit spreads,
  // LOW is bad (not enough premium), EXTREME is dangerous
  if (opts.ivRating === "NORMAL") score += 10;
  else if (opts.ivRating === "ELEVATED") score += 7;
  else if (opts.ivRating === "LOW") score += 3;
  else score += 2; // EXTREME

  return Math.min(100, Math.max(0, score));
}

/** Build an OptionsIntelligence report for a spread candidate. */
export function buildOptionsIntelligence(
  symbol: string,
  longLeg: OptionSnapshot,
  shortLeg: OptionSnapshot,
  spotPrice: number
): OptionsIntelligence {
  // Use the long leg's data as the primary reference
  const avgOi = (longLeg.openInterest + shortLeg.openInterest) / 2;
  const avgVolume = (longLeg.volume + shortLeg.volume) / 2;

  // Bid/ask spread as percentage of mid price (average of both legs)
  const longMid = (longLeg.bid + longLeg.ask) / 2 || 1;
  const shortMid = (shortLeg.bid + shortLeg.ask) / 2 || 1;
  const longSpreadPct = longLeg.ask > longLeg.bid ? (longLeg.ask - longLeg.bid) / longMid : 0;
  const shortSpreadPct = shortLeg.ask > shortLeg.bid ? (shortLeg.ask - shortLeg.bid) / shortMid : 0;
  const avgSpreadPct = (longSpreadPct + shortSpreadPct) / 2;

  // Greeks: use the long leg as primary reference
  const greeks: OptionGreeks = {
    iv: longLeg.iv ?? shortLeg.iv ?? null,
    delta: longLeg.delta ?? shortLeg.delta ?? null,
    gamma: longLeg.gamma ?? shortLeg.gamma ?? null,
    theta: longLeg.theta ?? shortLeg.theta ?? null,
    vega: longLeg.vega ?? shortLeg.vega ?? null,
  };

  const volRating = volatilityRating(greeks.iv);
  const liqRating = liquidityRating(avgSpreadPct);
  const quality = computeOptionsQuality({
    spreadPct: avgSpreadPct,
    oi: avgOi,
    volume: avgVolume,
    ivRating: volRating,
  });

  // Strike distance from current price (for the long leg)
  const strikeDistancePct = spotPrice > 0 ? ((longLeg.strike - spotPrice) / spotPrice) * 100 : 0;

  return {
    symbol,
    greeks,
    optionVolume: Math.round(avgVolume),
    openInterest: Math.round(avgOi),
    bidAskSpreadPct: Math.round(avgSpreadPct * 1000) / 10, // as percentage, e.g. 3.1
    expiry: longLeg.expiry,
    strikeDistancePct: Math.round(strikeDistancePct * 100) / 100,
    liquidityRating: liqRating,
    volatilityRating: volRating,
    optionsQuality: quality,
  };
}

/** Compute the options quality score modifier (0-10) to add to the opportunity score. */
export function optionsQualityScoreModifier(intelligence: OptionsIntelligence | null): number {
  if (!intelligence) return 0; // no data, no bonus
  // Scale 0-100 quality to 0-10 score contribution
  return (intelligence.optionsQuality / 100) * 10;
}
