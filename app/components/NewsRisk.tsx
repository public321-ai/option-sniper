"use client";

import type { NewsRiskAssessment } from "@/lib/types";

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const styles =
    sentiment === "Positive" ? "bg-emerald-dim text-emerald-soft border-bdr-accent" :
    sentiment === "Negative" ? "bg-coral-dim text-coral border-bdr-accent" :
    "bg-charcoal text-txt-muted border-bdr";
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-badge)] border px-2.5 py-1 text-xs font-bold tracking-wide ${styles}`}>
      {sentiment === "Positive" ? "📈" : sentiment === "Negative" ? "📉" : "➖"} {sentiment}
    </span>
  );
}

function CorpActionBadge({ status }: { status: string }) {
  const styles =
    status === "Clear" ? "bg-emerald-dim text-emerald-soft" :
    "bg-[rgba(210,153,34,0.1)] text-amber-soft";
  return <span className={`rounded-[var(--radius-badge)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles}`}>{status === "Clear" ? "✓ Clear" : "⚠ Warning"}</span>;
}

export default function NewsRiskPanel({ newsRisk }: { newsRisk: NewsRiskAssessment | null }) {
  if (!newsRisk) {
    return (
      <div className="soft-card p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-txt-muted">News &amp; Corporate Actions</h2>
        <p className="text-sm text-txt-muted">Run a scan to check news &amp; corporate action risk.</p>
      </div>
    );
  }

  const impactColor = newsRisk.newsImpact > 0 ? "pnl-positive" : newsRisk.newsImpact < 0 ? "pnl-negative" : "text-txt-muted";
  const impactSign = newsRisk.newsImpact > 0 ? "+" : "";

  return (
    <div className="soft-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">
          News &amp; Corporate Actions — <span className="text-amber-soft">{newsRisk.symbol}</span>
        </h2>
        {newsRisk.riskWarning && (
          <span className="rounded-[var(--radius-badge)] border border-coral/30 bg-coral-dim px-2.5 py-1 text-[10px] font-bold text-coral">
            ⚠ {newsRisk.riskWarning}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent News */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-cyan-soft">Recent News</h3>
            <SentimentBadge sentiment={newsRisk.sentiment} />
          </div>
          {newsRisk.recentNews.length === 0 ? (
            <p className="text-xs text-txt-muted">No recent news found.</p>
          ) : (
            <ul className="space-y-1.5">
              {newsRisk.recentNews.map((n, i) => {
                const sentColor = n.sentiment === "positive" ? "pnl-positive" : n.sentiment === "negative" ? "pnl-negative" : "text-txt-dim";
                const sentIcon = n.sentiment === "positive" ? "▲" : n.sentiment === "negative" ? "▼" : "◆";
                return (
                  <li key={i} className="text-xs">
                    <div className="flex items-start gap-1.5">
                      <span className={`shrink-0 mt-0.5 text-[10px] ${sentColor}`}>{sentIcon}</span>
                      <div className="min-w-0">
                        <p className="text-txt-secondary leading-tight">{n.headline}</p>
                        <p className="text-txt-dim text-[10px]">{n.source} · {new Date(n.ts).toLocaleTimeString("en-US", { hour12: false })}</p>
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
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-soft">Corporate Actions</h3>
            <CorpActionBadge status={newsRisk.corporateActionStatus} />
          </div>
          {newsRisk.corporateActions.length === 0 ? (
            <p className="text-xs text-txt-muted mb-3">No recent corporate actions.</p>
          ) : (
            <ul className="space-y-1.5 mb-3">
              {newsRisk.corporateActions.map((ca, i) => {
                const isWarn = ca.type === "merger" || ca.type === "split" || (ca.type === "earnings" && Math.ceil((new Date(ca.date).getTime() - Date.now()) / 86400000) <= 7);
                return (
                  <li key={i} className={`text-xs flex items-start gap-1.5 ${isWarn ? "text-amber-soft" : "text-txt-muted"}`}>
                    <span className="shrink-0 mt-0.5">{isWarn ? "⚠" : "•"}</span>
                    <div>
                      <p>{ca.description}</p>
                      <p className="text-[10px] text-txt-dim">{ca.type} · {ca.date}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Impact Summary */}
          <div className="soft-card-inner p-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-txt-dim mb-2">Risk Assessment</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-txt-muted">News Sentiment</dt>
                <dd><SentimentBadge sentiment={newsRisk.sentiment} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-txt-muted">Corporate Action</dt>
                <dd><CorpActionBadge status={newsRisk.corporateActionStatus} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-txt-muted">News Impact</dt>
                <dd className={`font-mono font-bold ${impactColor}`}>{impactSign}{newsRisk.newsImpact}</dd>
              </div>
              {newsRisk.riskWarning && (
                <div className="flex justify-between">
                  <dt className="text-txt-muted">Risk Warning</dt>
                  <dd className="font-mono text-xs text-coral max-w-[200px] text-right">{newsRisk.riskWarning}</dd>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
