"use client";

import type { MarketDiscovery, MarketMover } from "@/lib/types";

function MoverRow({ m }: { m: MarketMover }) {
  const changeColor = m.changePct > 0 ? "text-emerald-400" : m.changePct < 0 ? "text-red-400" : "text-slate-400";
  const qualColor = m.qualified ? "text-emerald-400" : "text-slate-500";
  const arrow = m.changePct > 0 ? "+" : "";

  return (
    <tr className={m.qualified ? "bg-emerald-500/5" : ""}>
      <td className="px-2 py-1.5 font-bold text-sm">{m.symbol}</td>
      <td className="px-2 py-1.5 text-xs text-slate-500 max-w-[120px] truncate" title={m.name}>{m.name}</td>
      <td className="px-2 py-1.5 font-mono text-sm">{m.price > 0 ? `$${m.price.toFixed(2)}` : "—"}</td>
      <td className={`px-2 py-1.5 font-mono text-sm font-semibold ${changeColor}`}>{arrow}{m.changePct.toFixed(1)}%</td>
      <td className="px-2 py-1.5 font-mono text-xs text-slate-400">{m.volume > 0 ? (m.volume / 1e6).toFixed(1) + "M" : "—"}</td>
      <td className={`px-2 py-1.5 text-xs font-semibold ${qualColor}`}>
        {m.qualified ? "✓ Qualified" : "✕ Rejected"}
      </td>
      <td className="px-2 py-1.5 text-xs text-slate-500">{m.qualificationReason}</td>
    </tr>
  );
}

function MoverSection({ title, movers, accent }: { title: string; movers: MarketMover[]; accent: string }) {
  if (movers.length === 0) return null;
  return (
    <div className="mb-3">
      <h3 className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${accent}`}>{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-1.5">Symbol</th>
              <th className="px-2 py-1.5">Name</th>
              <th className="px-2 py-1.5">Price</th>
              <th className="px-2 py-1.5">Change</th>
              <th className="px-2 py-1.5">Volume</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 bg-slate-950/60">
            {movers.map((m) => <MoverRow key={`${m.moverType}-${m.symbol}`} m={m} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MarketDiscoveryPanel({ discovery }: { discovery: MarketDiscovery | null }) {
  if (!discovery) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          📊 Market Discovery
        </h2>
        <p className="text-sm text-slate-500">Run a scan to discover market movers.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
          📊 Market Discovery
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            {discovery.qualifiedSymbols.length} Qualified
          </span>
          <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400">
            {discovery.sniperCandidates.length} Sniper Candidates
          </span>
        </div>
      </div>

      <MoverSection title="Top Gainers" movers={discovery.topGainers} accent="text-emerald-400" />
      <MoverSection title="Most Active" movers={discovery.mostActive} accent="text-sky-400" />
      <MoverSection title="Top Losers" movers={discovery.topLosers} accent="text-red-400" />

      {discovery.sniperCandidates.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Top Sniper Candidates</p>
          <p className="text-xs text-slate-300 font-mono">
            {discovery.sniperCandidates.join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
