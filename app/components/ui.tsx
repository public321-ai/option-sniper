"use client";

import type { AgentLogEntry, Decision, SpreadPosition } from "@/lib/types";

export const fmtMoney = (v: number, digits = 2) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const fmtPct = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

export function DecisionBadge({ decision }: { decision: Decision | null }) {
  if (!decision) return null;
  const styles =
    decision.action === "ENTER"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
      : decision.action === "EXIT"
        ? "bg-red-500/15 text-red-400 border-red-500/40"
        : "bg-amber-500/15 text-amber-400 border-amber-500/40";
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-bold tracking-wide ${styles}`}>
      {decision.action}
    </span>
  );
}

export function TrendBadge({ trend }: { trend: string }) {
  const styles =
    trend === "bullish"
      ? "bg-emerald-500/15 text-emerald-400"
      : trend === "bearish"
        ? "bg-red-500/15 text-red-400"
        : "bg-slate-500/15 text-slate-400";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles}`}>
      {trend}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded bg-slate-700">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-xs text-slate-300">{score.toFixed(1)}</span>
    </div>
  );
}

const LOG_COLORS: Record<AgentLogEntry["level"], string> = {
  info: "text-slate-300",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
  trade: "text-sky-400",
};

export function LogPanel({ log }: { log: AgentLogEntry[] }) {
  return (
    <div className="log-scroll h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs">
      {log.length === 0 ? (
        <p className="text-slate-500">No agent activity yet — press SCAN NOW or START AGENT.</p>
      ) : (
        log.map((e, i) => (
          <div key={i} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-slate-500">
              {new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span className={LOG_COLORS[e.level]}>{e.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

export function PositionsTable({
  positions,
  onClose,
  closing,
}: {
  positions: SpreadPosition[];
  onClose: (id: string) => void;
  closing: string | null;
}) {
  if (positions.length === 0) {
    return <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">No open positions. Alpaca is the source of truth.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-3 py-2">Spread</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">DTE</th>
            <th className="px-3 py-2">Entry Debit</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">P&amp;L</th>
            <th className="px-3 py-2">Exit Signal</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/60">
          {positions.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 font-medium">
                {s.underlying} {s.longStrike}/{s.shortStrike}C
                <span className="ml-1 text-xs text-slate-500">{s.expiry}</span>
              </td>
              <td className="px-3 py-2 font-mono">{s.qty}</td>
              <td className="px-3 py-2 font-mono">{s.dte}</td>
              <td className="px-3 py-2 font-mono">{fmtMoney(s.entryDebit)}</td>
              <td className="px-3 py-2 font-mono">{fmtMoney(s.currentValue)}</td>
              <td className={`px-3 py-2 font-mono font-semibold ${s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtMoney(s.pnl)} ({fmtPct(s.pnlPct)})
              </td>
              <td className="px-3 py-2">
                {s.exitSignal ? (
                  <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">{s.exitSignal}</span>
                ) : (
                  <span className="text-xs text-slate-500">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => onClose(s.id)}
                  disabled={closing === s.id}
                  className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {closing === s.id ? "CLOSING…" : "CLOSE"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
