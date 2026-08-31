"use client";

import type { MarketDiscovery, MarketMover } from "@/lib/types";

function MoverRow({ m }: { m: MarketMover }) {
  const changeColor = m.changePct > 0 ? "pnl-positive" : m.changePct < 0 ? "pnl-negative" : "text-txt-muted";
  const qualColor = m.qualified ? "text-emerald-soft" : "text-txt-dim";
  const arrow = m.changePct > 0 ? "+" : "";

  return (
    <tr className={m.qualified ? "bg-emerald-dim/20" : ""}>
      <td className="px-2 py-1.5 font-bold text-sm text-txt">{m.symbol}</td>
      <td className="px-2 py-1.5 text-xs text-txt-muted max-w-[120px] truncate" title={m.name}>{m.name}</td>
      <td className="px-2 py-1.5 font-mono text-sm text-txt-secondary">{m.price > 0 ? `$${m.price.toFixed(2)}` : "—"}</td>
      <td className={`px-2 py-1.5 font-mono text-sm font-semibold ${changeColor}`}>{arrow}{m.changePct.toFixed(1)}%</td>
      <td className="px-2 py-1.5 font-mono text-xs text-txt-muted">{m.volume > 0 ? (m.volume / 1e6).toFixed(1) + "M" : "—"}</td>
      <td className={`px-2 py-1.5 text-xs font-semibold ${qualColor}`}>
        {m.qualified ? "✓ Qualified" : "✕ Rejected"}
      </td>
      <td className="px-2 py-1.5 text-xs text-txt-dim">{m.qualificationReason}</td>
    </tr>
  );
}

function MoverSection({ title, movers, accent }: { title: string; movers: MarketMover[]; accent: string }) {
  if (movers.length === 0) return null;
  return (
    <div className="mb-3">
      <h3 className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${accent}`}>{title}</h3>
      <div className="overflow-x-auto rounded-[var(--radius-inner)] border border-bdr">
        <table className="soft-table text-xs">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>Price</th>
              <th>Change</th>
              <th>Volume</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
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
      <div className="soft-card p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-txt-muted">Market Discovery</h2>
        <p className="text-sm text-txt-muted">Run a scan to discover market movers.</p>
      </div>
    );
  }

  return (
    <div className="soft-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Market Discovery</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-[var(--radius-badge)] bg-emerald-dim px-2 py-0.5 text-[10px] font-bold text-emerald-soft">
            {discovery.qualifiedSymbols.length} Qualified
          </span>
          <span className="rounded-[var(--radius-badge)] bg-[rgba(57,210,192,0.08)] px-2 py-0.5 text-[10px] font-bold text-cyan-soft">
            {discovery.sniperCandidates.length} Sniper Candidates
          </span>
        </div>
      </div>

      <MoverSection title="Top Gainers" movers={discovery.topGainers} accent="text-emerald-soft" />
      <MoverSection title="Most Active" movers={discovery.mostActive} accent="text-cyan-soft" />
      <MoverSection title="Top Losers" movers={discovery.topLosers} accent="text-coral" />

      {discovery.sniperCandidates.length > 0 && (
        <div className="mt-3 rounded-[var(--radius-inner)] border border-emerald-soft/15 bg-emerald-dim/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-emerald-soft mb-1">Top Sniper Candidates</p>
          <p className="text-xs text-txt-secondary font-mono">
            {discovery.sniperCandidates.join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
