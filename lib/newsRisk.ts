// News + Corporate Action Risk Check:
// Uses Alpaca news and corporate-action data to assess risk before trading.
// Simple deterministic keyword/category rules — no external AI/LLM required.
import "server-only";

import { getCorporateActions, getNewsForSymbol, IS_MOCK } from "./alpaca";
import { mockNews, mockCorporateActions } from "./mock";
import type { CorporateAction, NewsItem, NewsRiskAssessment } from "./types";

// ---------- Deterministic news sentiment via keyword matching ----------

const POSITIVE_PATTERNS = [
  /\b(beat|beats|exceed|exceeds|surpass|outperform|upgrade|upgraded|bullish|rally|surge|soar|jump|gain|profit|record\s+(high|revenue|sales|earnings)|strong\s+(demand|sales|growth|revenue)|raised\s+guidance|raised\s+target|buy\s+rating|initiative|breakthrough|win|contract|partnership|launch|expansion|approved|fda\s+approval)\b/i,
];

const NEGATIVE_PATTERNS = [
  /\b(miss|misses|below|disappoint|cut|cuts|slash|downgrade|downgraded|bearish|crash|plunge|drop|fall|decline|loss|lawsuit|investigation|sec\s+probe|fraud|recall|bankrupt|delist|warning|caution|risk|concern|weak\s+(demand|sales|growth|revenue)|lowered\s+guidance|lowered\s+target|sell\s+rating|fine|penalty|regulatory|halt|suspension|resign|resignation|fired|scandal)\b/i,
];

const EARNINGS_PATTERNS = [
  /\b(earnings|quarterly\s+results|eps|revenue\s+report|fiscal\s+quarter|10-[qk]|guidance|outlook|conference\s+call|investor\s+day)\b/i,
];

function classifyHeadline(headline: string): "positive" | "neutral" | "negative" {
  for (const re of NEGATIVE_PATTERNS) {
    if (re.test(headline)) return "negative";
  }
  for (const re of POSITIVE_PATTERNS) {
    if (re.test(headline)) return "positive";
  }
  return "neutral";
}

function isEarningsRelated(headline: string): boolean {
  return EARNINGS_PATTERNS.some((re) => re.test(headline));
}

// ---------- Corporate action risk assessment ----------

const WARNING_ACTION_TYPES = new Set([
  "forward_split",
  "reverse_split",
  "cash_merger",
  "stock_merger",
  "stock_and_cash_merger",
  "spin_off",
  "redemption",
  "reorganization",
]);

function classifyCorporateAction(ca: {
  type: string;
  ex_date: string;
  rate?: number;
  new_rate?: number;
  old_rate?: number;
}): { type: CorporateAction["type"]; isWarning: boolean; description: string } {
  const caType = ca.type?.toLowerCase() || "";
  const daysToEx = Math.ceil(
    (new Date(ca.ex_date).getTime() - Date.now()) / 86400000
  );

  if (caType.includes("dividend")) {
    return {
      type: "dividend",
      isWarning: ca.rate && ca.rate > 0 ? daysToEx <= 7 : false,
      description: `Dividend $${ca.rate?.toFixed(2) ?? "?"}/share ex-date ${ca.ex_date}`,
    };
  }
  if (caType.includes("split")) {
    return {
      type: "split",
      isWarning: true,
      description: `Stock split ${ca.old_rate ?? "?"}:${ca.new_rate ?? "?"} ex-date ${ca.ex_date}`,
    };
  }
  if (caType.includes("merger") || caType.includes("acquisition")) {
    return {
      type: "merger",
      isWarning: true,
      description: `M&A activity: ${caType} ex-date ${ca.ex_date}`,
    };
  }
  if (caType === "earnings" || caType.includes("earnings")) {
    return {
      type: "earnings",
      isWarning: daysToEx <= 7,
      description: `Earnings event ex-date ${ca.ex_date} (${daysToEx}d away)`,
    };
  }
  if (WARNING_ACTION_TYPES.has(caType)) {
    return {
      type: "other",
      isWarning: true,
      description: `${caType} ex-date ${ca.ex_date}`,
    };
  }
  return {
    type: "other",
    isWarning: false,
    description: `${caType} ex-date ${ca.ex_date}`,
  };
}

// ---------- Full risk assessment pipeline ----------

/** Assess news and corporate action risk for a symbol. Never throws. */
export async function assessNewsRisk(symbol: string): Promise<NewsRiskAssessment> {
  const emptyResult: NewsRiskAssessment = {
    symbol,
    recentNews: [],
    sentiment: "Neutral",
    corporateActions: [],
    corporateActionStatus: "Clear",
    newsImpact: 0,
    riskWarning: null,
  };

  let newsItems: NewsItem[] = [];
  let corpActions: CorporateAction[] = [];

  try {
    const rawNews = IS_MOCK
      ? mockNews(symbol)
      : await getNewsForSymbol(symbol, 10);

    newsItems = rawNews.map((n) => ({
      headline: n.headline,
      source: n.source,
      ts: new Date(n.created_at).getTime(),
      sentiment: classifyHeadline(n.headline),
    }));
  } catch {
    // News is best-effort; proceed without it
  }

  try {
    const rawActions = IS_MOCK
      ? mockCorporateActions(symbol)
      : await getCorporateActions(symbol);

    for (const ca of rawActions) {
      const classified = classifyCorporateAction(ca);
      corpActions.push({
        symbol,
        type: classified.type,
        description: classified.description,
        date: ca.ex_date,
      });
    }
  } catch {
    // Corporate actions are best-effort; proceed without them
  }

  // Aggregate sentiment
  let posCount = 0;
  let negCount = 0;
  let earningsNear = false;
  for (const n of newsItems) {
    if (n.sentiment === "positive") posCount++;
    else if (n.sentiment === "negative") negCount++;
    if (isEarningsRelated(n.headline)) {
      const age = (Date.now() - n.ts) / 86400000;
      if (age <= 5) earningsNear = true;
    }
  }

  let sentiment: NewsRiskAssessment["sentiment"] = "Neutral";
  let newsImpact = 0;
  if (posCount > negCount + 1) {
    sentiment = "Positive";
    newsImpact = Math.min(4, posCount - negCount); // +1 to +4
  } else if (negCount > posCount + 1) {
    sentiment = "Negative";
    newsImpact = -Math.min(4, negCount - posCount); // -1 to -4
  }

  // Corporate action warnings
  const hasWarning = corpActions.some((ca) => {
    const daysTo = Math.ceil(
      (new Date(ca.date).getTime() - Date.now()) / 86400000
    );
    // Only warn for events within 14 days
    return daysTo >= -7 && daysTo <= 14 &&
      (ca.type === "merger" || ca.type === "split" ||
        (ca.type === "earnings" && daysTo <= 7));
  });

  const corporateActionStatus = hasWarning ? "Warning" : "Clear";

  // Build risk warning string
  let riskWarning: string | null = null;
  if (earningsNear) riskWarning = "Earnings-related news — elevated uncertainty";
  if (hasWarning) {
    const warningActions = corpActions.filter((ca) => ca.type !== "other");
    if (warningActions.length > 0) {
      riskWarning = `${warningActions[0].type.charAt(0).toUpperCase() + warningActions[0].type.slice(1)}: ${warningActions[0].description}`;
    }
  }
  // If negative sentiment + corporate action warning, stronger warning
  if (sentiment === "Negative" && hasWarning) {
    newsImpact = Math.min(-5, newsImpact - 2);
    riskWarning = `Negative news + corporate action risk — ${riskWarning}`;
  }

  return {
    symbol,
    recentNews: newsItems.slice(0, 5),
    sentiment,
    corporateActions: corpActions,
    corporateActionStatus,
    newsImpact,
    riskWarning,
  };
}

/** Compute the news impact score modifier (-5 to +5) to add to the opportunity score. */
export function newsImpactScoreModifier(assessment: NewsRiskAssessment | null): number {
  if (!assessment) return 0; // no data, neutral
  // Scale newsImpact (-10 to +10) to a score modifier (-5 to +5)
  return Math.round((assessment.newsImpact / 10) * 5 * 10) / 10;
}
