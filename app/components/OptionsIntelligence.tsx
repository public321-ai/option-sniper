"use client";

import type { OptionsIntelligence } from "@/lib/types";

function GreekRow({ label, value, fmt }: { label: string; value: number | null; fmt?: "pct" | "raw" }) {
  const display = value !== null
    ? fmt === "pct" ? `${(value * 100).toFixed(1)}%` : value.toFixed(4)
    : "N/A";
  return (
    <div className="flex justify-between">
      <dt className="text-txt-muted">{label}</dt>
      <dd className="font-mono font-semibold text-txt">{display}</dd>
    </div>
  );
}

function QualityBadge({ quality }: { quality: number }) {
  const color = quality >= 80 ? "text-emerald-soft" : quality >= 60 ? "text-amber-soft" : "text-coral";
  return <span className={`font-mono font-black text-lg ${color}`}>{quality}<span className="text-xs text-txt-dim">/100</span></span>;
}

function RatingBadge({ rating }: { rating: string }) {
  const styles =
    rating === "GOOD" ? "bg-emerald-dim text-emerald-soft" :
    rating === "FAIR" ? "bg-[rgba(210,153,34,0.1)] text-amber-soft" :
    "bg-coral-dim text-coral";
  return <span className={`rounded-[var(--radius-badge)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles}`}>{rating}</span>;
}

export default function OptionsIntelligencePanel({ intelligence }: { intelligence: OptionsIntelligence | null }) {
  if (!intelligence) {
    return (
      <div className="soft-card p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-txt-muted">Options Intelligence</h2>
        <p className="text-sm text-txt-muted">Run a scan to analyze options Greeks &amp; liquidity.</p>
      </div>
    );
  }

  return (
    <div className="soft-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">
          Options Intelligence — <span className="text-[#a78bfa]">{intelligence.symbol}</span>
        </h2>
        <QualityBadge quality={intelligence.optionsQuality} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Greeks */}
        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#a78bfa]">Greeks</h3>
          <dl className="space-y-1.5 text-sm">
            <GreekRow label="IV" value={intelligence.greeks.iv} fmt="pct" />
            <GreekRow label="Delta" value={intelligence.greeks.delta} fmt="raw" />
            <GreekRow label="Gamma" value={intelligence.greeks.gamma} fmt="raw" />
            <GreekRow label="Theta" value={intelligence.greeks.theta} fmt="raw" />
            <GreekRow label="Vega" value={intelligence.greeks.vega} fmt="raw" />
          </dl>
        </div>

        {/* Market Data */}
        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-cyan-soft">Market Data</h3>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-txt-muted">Option Volume</dt>
              <dd className="font-mono font-semibold text-txt">{intelligence.optionVolume.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-muted">Open Interest</dt>
              <dd className="font-mono font-semibold text-txt">{intelligence.openInterest.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-muted">Bid/Ask Spread</dt>
              <dd className="font-mono font-semibold text-txt">{intelligence.bidAskSpreadPct.toFixed(1)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-muted">Expiry</dt>
              <dd className="font-mono text-txt-secondary">{intelligence.expiry}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-txt-muted">Strike Distance</dt>
              <dd className="font-mono text-txt-secondary">{intelligence.strikeDistancePct > 0 ? `${intelligence.strikeDistancePct.toFixed(1)}% OTM` : intelligence.strikeDistancePct < 0 ? `${Math.abs(intelligence.strikeDistancePct).toFixed(1)}% ITM` : "ATM"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Ratings */}
      <div className="mt-3 flex items-center gap-3 border-t border-bdr pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-txt-dim">Liquidity:</span>
          <RatingBadge rating={intelligence.liquidityRating} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-txt-dim">Volatility:</span>
          <RatingBadge rating={intelligence.volatilityRating} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-txt-dim">Options Quality:</span>
          <span className="font-mono text-sm font-bold text-txt">{intelligence.optionsQuality}</span>
        </div>
      </div>
    </div>
  );
}
