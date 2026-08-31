import type {
  MarketDiscovery,
  NewsRiskAssessment,
  OptionsIntelligence,
} from "@/lib/types";

export interface AnalysisData {
  discovery: MarketDiscovery | null;
  intelligence: OptionsIntelligence | null;
  newsRisk: NewsRiskAssessment | null;
}

const STORAGE_KEY = "sniper-analysis-data";

export function saveAnalysisData(data: AnalysisData) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded or private browsing */
  }
}

export function loadAnalysisData(): AnalysisData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
