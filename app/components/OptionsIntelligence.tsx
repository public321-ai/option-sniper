"use client";

import type { OptionsIntelligence } from "@/lib/types";

function GreekRow({ label, value, fmt }: { label: string; value: number | null; fmt?: "pct" | "raw" }) {
  const display = value !== null
    ? fmt === "pct"
      ? `${(value * 100).toFixed(1)}%`
      : value.toFixed(4)
    : "N/A";
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-mono font-semibold text-slate-200">{display}</dd>
    </div>
  );
}

function QualityBadge({ quality }: { quality: number }) {
  const color = quality >= 80 ? "text-emerald-400" : quality >= 60 ? "text-amber-400" : "text-red-400";
  return <span className={`font-mono font-black text-lg ${color}`}>{quality}<span className="text-xs text-slate-400">/100</span></span>;
}

function RatingBadge({ rating }: { rating: string }) {
  const styles =
    rating === "GOOD" ? "bg-emerald-500/15 text-emerald-400" :
    rating === "FAIR" ? "bg-amber-500/15 text-amber-400" :
    "bg-red-500/15 text-red-400";
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles}`}>{rating}</span>;
}

export default function OptionsIntelligencePanel({ intelligence }: { intelligence: OptionsIntelligence | null }) {
  if (!intelligence) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          🔬 Options Intelligence
        </h2>
        <p className="text-sm text-slate-500">Run a scan to analyze options Greeks &amp; liquidity.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
          🔬 Options Intelligence — <span className="text-violet-400">{intelligence.symbol}</span>
        </h2>
        <QualityBadge quality={intelligence.optionsQuality} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Greeks */}
        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-violet-400">Greeks</h3>
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
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-sky-400">Market Data</h3>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Option Volume</dt>
              <dd className="font-mono font-semibold text-slate-200">{intelligence.optionVolume.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Open Interest</dt>
              <dd className="font-mono font-semibold text-slate-200">{intelligence.openInterest.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Bid/Ask Spread</dt>
              <dd className="font-mono font-semibold text-slate-200">{intelligence.bidAskSpreadPct.toFixed(1)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Expiry</dt>
              <dd className="font-mono text-slate-200">{intelligence.expiry}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Strike Distance</dt>
              <dd className="font-mono text-slate-200">{intelligence.strikeDistancePct > 0 ? `${intelligence.strikeDistancePct.toFixed(1)}% OTM` : intelligence.strikeDistancePct < 0 ? `${Math.abs(intelligence.strikeDistancePct).toFixed(1)}% ITM` : "ATM"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Ratings */}
      <div className="mt-3 flex items-center gap-3 border-t border-slate-800 pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Liquidity:</span>
          <RatingBadge rating={intelligence.liquidityRating} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Volatility:</span>
          <RatingBadge rating={intelligence.volatilityRating} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Options Quality:</span>
          <span className="font-mono text-sm font-bold text-slate-200">{intelligence.optionsQuality}</span>
        </div>
      </div>
    </div>
  );
}
