"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { loadAnalysisData, type AnalysisData } from "@/lib/analysisStore";
import MarketDiscoveryPanel from "@/app/components/MarketDiscovery";
import OptionsIntelligencePanel from "@/app/components/OptionsIntelligence";
import NewsRiskPanel from "@/app/components/NewsRisk";

export default function AnalysisPage() {
  const { authenticated, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    if (!loading && !authenticated) router.replace("/login");
  }, [authenticated, loading, router]);

  useEffect(() => { setData(loadAnalysisData()); }, []);

  if (loading || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian text-txt-muted">
        Authenticating…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-4 bg-obsidian px-4 text-center">
        <h1 className="text-xl font-bold text-txt">Market Analysis</h1>
        <p className="text-sm text-txt-muted">No scan data available yet. Run a scan from the dashboard first.</p>
        <button onClick={() => router.push("/")} className="btn-ghost px-4 py-2 text-sm font-semibold">← Back to Dashboard</button>
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-txt">Market Analysis</h1>
          <p className="text-xs text-txt-dim">Detailed market discovery, options intelligence &amp; news risk from the latest scan</p>
        </div>
        <button onClick={() => router.push("/")} className="btn-ghost px-4 py-2 text-sm font-semibold">← Dashboard</button>
      </div>

      <div className="mb-6">
        <MarketDiscoveryPanel discovery={data.discovery} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OptionsIntelligencePanel intelligence={data.intelligence} />
        <NewsRiskPanel newsRisk={data.newsRisk} />
      </div>
    </main>
  );
}
