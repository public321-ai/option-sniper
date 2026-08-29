"use client";

import type { NewsRiskAssessment } from "@/lib/types";

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const styles =
    sentiment === "Positive" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" :
    sentiment === "Negative" ? "bg-red-500/15 text-red-400 border-red-500/40" :
    "bg-slate-500/15 text-slate-400 border-slate-500/40";
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold tracking-wide ${styles}`}>
      {sentiment === "Positive" ? "📈" : sentiment === "Negative" ? "📉" : "➖"} {sentiment}
    </span>
  );
}

function CorpActionBadge({ status }: { status: string }) {
  const styles =
    status === "Clear" ? "bg-emerald-500/15 text-emerald-400" :
    "bg-amber-500/15 text-amber-400";
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles}`}>{status === "Clear" ? "✓ Clear" : "⚠ Warning"}</span>;
}

export default function NewsRiskPanel({ newsRisk }: { newsRisk: NewsRiskAssessment | null }) {
  if (!newsRisk) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          📰 News &amp; Corporate Actions
        </h2>
        <p className="text-sm text-slate-500">Run a scan to check news &amp; corporate action risk.</p>
      </div>
    );
  }

  const impactColor = newsRisk.newsImpact > 0 ? "text-emerald-400" : newsRisk.newsImpact < 0 ? "text-red-400" : "text-slate-400";
  const impactSign = newsRisk.newsImpact > 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
          📰 News &amp; Corporate Actions — <span className="text-amber-400">{newsRisk.symbol}</span>
        </h2>
        {newsRisk.riskWarning && (
          <span className="rounded bg-red-500/15 px-2.5 py-1 text-[10px] font-bold text-red-400 border border-red-500/30">
            ⚠ {newsRisk.riskWarning}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent News */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Recent News</h3>
            <SentimentBadge sentiment={newsRisk.sentiment} />
          </div>
          {newsRisk.recentNews.length === 0 ? (
            <p className="text-xs text-slate-500">No recent news found.</p>
          ) : (
            <ul className="space-y-1.5">
              {newsRisk.recentNews.map((n, i) => {
                const sentColor = n.sentiment === "positive" ? "text-emerald-400" : n.sentiment === "negative" ? "text-red-400" : "text-slate-500";
                const sentIcon = n.sentiment === "positive" ? "▲" : n.sentiment === "negative" ? "▼" : "◆";
                return (
                  <li key={i} className="text-xs">
                    <div className="flex items-start gap-1.5">
                      <span className={`shrink-0 mt-0.5 text-[10px] ${sentColor}`}>{sentIcon}</span>
                      <div className="min-w-0">
                        <p className="text-slate-300 leading-tight">{n.headline}</p>
                        <p className="text-slate-600 text-[10px]">{n.source} · {new Date(n.ts).toLocaleTimeString("en-US", { hour12: false })}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Corporate Actions + Impact */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Corporate Actions</h3>
            <CorpActionBadge status={newsRisk.corporateActionStatus} />
          </div>
          {newsRisk.corporateActions.length === 0 ? (
            <p className="text-xs text-slate-500 mb-3">No recent corporate actions.</p>
          ) : (
            <ul className="space-y-1.5 mb-3">
              {newsRisk.corporateActions.map((ca, i) => {
                const isWarn = ca.type === "merger" || ca.type === "split" || (ca.type === "earnings" && Math.ceil((new Date(ca.date).getTime() - Date.now()) / 86400000) <= 7);
                return (
                  <li key={i} className={`text-xs flex items-start gap-1.5 ${isWarn ? "text-amber-300" : "text-slate-400"}`}>
                    <span className="shrink-0 mt-0.5">{isWarn ? "⚠" : "•"}</span>
                    <div>
                      <p>{ca.description}</p>
                      <p className="text-[10px] text-slate-600">{ca.type} · {ca.date}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Impact Summary */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Risk Assessment</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">News Sentiment</dt>
                <dd><SentimentBadge sentiment={newsRisk.sentiment} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Corporate Action</dt>
                <dd><CorpActionBadge status={newsRisk.corporateActionStatus} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">News Impact</dt>
                <dd className={`font-mono font-bold ${impactColor}`}>{impactSign}{newsRisk.newsImpact}</dd>
              </div>
              {newsRisk.riskWarning && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Risk Warning</dt>
                  <dd className="font-mono text-xs text-red-400 max-w-[200px] text-right">{newsRisk.riskWarning}</dd>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
