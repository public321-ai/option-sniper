"use client";

import type { AgentLogEntry, Decision, SpreadPosition } from "@/lib/types";

export const fmtMoney = (v: number, digits = 2) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const fmtPct = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

export function DecisionBadge({ decision }: { decision: Decision | null }) {
  if (!decision) return null;
  const styles =
    decision.action === "ENTER"
      ? "bg-emerald-dim text-emerald-soft border-bdr-accent"
      : decision.action === "EXIT"
        ? "bg-coral-dim text-coral border-bdr-accent"
        : "bg-[rgba(210,153,34,0.1)] text-amber-soft border-bdr-accent";
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-badge)] border px-2.5 py-1 text-xs font-bold tracking-wide ${styles}`}>
      {decision.action}
    </span>
  );
}

export function TrendBadge({ trend }: { trend: string }) {
  const styles =
    trend === "bullish"
      ? "bg-emerald-dim text-emerald-soft"
      : trend === "bearish"
        ? "bg-coral-dim text-coral"
        : "bg-charcoal text-txt-muted";
  return (
    <span className={`rounded-[var(--radius-badge)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles}`}>
      {trend}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-soft" : score >= 50 ? "bg-amber-soft" : "bg-txt-dim";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-xs text-txt-secondary">{score.toFixed(1)}</span>
    </div>
  );
}

const LOG_COLORS: Record<AgentLogEntry["level"], string> = {
  info: "text-txt-secondary",
  success: "text-emerald-soft",
  warn: "text-amber-soft",
  error: "text-coral",
  trade: "text-cyan-soft",
};

export function LogPanel({ log }: { log: AgentLogEntry[] }) {
  return (
    <div className="log-scroll h-72 overflow-y-auto rounded-[var(--radius-card)] border border-bdr bg-graphite p-3 font-mono text-xs">
      {log.length === 0 ? (
        <p className="text-txt-muted">No agent activity yet — press SCAN NOW or START AGENT.</p>
      ) : (
        log.map((e, i) => (
          <div key={i} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-txt-dim">
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
    return <p className="soft-card p-4 text-sm text-txt-muted">No open positions. Alpaca is the source of truth.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-bdr">
      <table className="soft-table">
        <thead>
          <tr>
            <th>Spread</th>
            <th>Qty</th>
            <th>DTE</th>
            <th>Entry Debit</th>
            <th>Value</th>
            <th>P&amp;L</th>
            <th>Exit Signal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((s) => (
            <tr key={s.id}>
              <td className="font-medium text-txt">
                {s.underlying} {s.longStrike}/{s.shortStrike}C
                <span className="ml-1 text-xs text-txt-muted">{s.expiry}</span>
              </td>
              <td className="font-mono">{s.qty}</td>
              <td className="font-mono">{s.dte}</td>
              <td className="font-mono">{fmtMoney(s.entryDebit)}</td>
              <td className="font-mono">{fmtMoney(s.currentValue)}</td>
              <td className={`font-mono font-semibold ${s.pnl >= 0 ? "pnl-positive" : "pnl-negative"}`}>
                {fmtMoney(s.pnl)} ({fmtPct(s.pnlPct)})
              </td>
              <td>
                {s.exitSignal ? (
                  <span className="rounded-[var(--radius-badge)] bg-coral-dim px-2 py-0.5 text-[11px] font-semibold text-coral">{s.exitSignal}</span>
                ) : (
                  <span className="text-xs text-txt-dim">—</span>
                )}
              </td>
              <td className="text-right">
                <button
                  onClick={() => onClose(s.id)}
                  disabled={closing === s.id}
                  className="btn-danger px-2.5 py-1 text-[11px]"
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
