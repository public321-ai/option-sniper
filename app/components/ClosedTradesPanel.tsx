"use client";

import type { ClosedTrade } from "@/lib/types";
import { fmtMoney, fmtPct } from "./ui";

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; }
}
function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

export default function ClosedTradesPanel({ trades }: { trades: ClosedTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="soft-card px-4 py-6 text-center">
        <p className="text-sm text-txt-muted">No closed trades yet. Closed positions will appear here with realized P&amp;L.</p>
      </div>
    );
  }

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-inner)] border border-bdr bg-graphite px-4 py-2.5 text-xs">
        <span className="text-txt-muted">
          {trades.length} closed trade{trades.length !== 1 ? "s" : ""}
        </span>
        <span className="text-txt-dim">|</span>
        <span className={totalPnl >= 0 ? "pnl-positive" : "pnl-negative"}>
          Total P&amp;L: {fmtMoney(totalPnl)}
        </span>
        <span className="text-txt-dim">|</span>
        <span className="pnl-positive">{wins}W</span>
        <span className="pnl-negative">{losses}L</span>
        <span className="text-txt-dim">|</span>
        <span className="text-txt-secondary">Win rate: {winRate.toFixed(0)}%</span>
      </div>

      {/* Trades table */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-bdr">
        <table className="soft-table">
          <thead>
            <tr>
              <th>Underlying</th>
              <th>Spread</th>
              <th>Expiry</th>
              <th>Qty</th>
              <th>Entry Debit</th>
              <th>Exit Credit</th>
              <th>Entry Date</th>
              <th>Exit Date</th>
              <th className="text-right">P&amp;L ($)</th>
              <th className="text-right">P&amp;L (%)</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const pnlColor = t.pnl > 0 ? "pnl-positive" : t.pnl < 0 ? "pnl-negative" : "text-txt-muted";
              const rowBg = t.pnl > 0 ? "bg-emerald-dim/30" : t.pnl < 0 ? "bg-coral-dim/30" : "";
              return (
                <tr key={t.id} className={rowBg}>
                  <td className="font-bold text-txt">{t.underlying}</td>
                  <td className="font-mono text-txt-secondary">{t.longStrike}/{t.shortStrike}C</td>
                  <td className="font-mono text-txt-muted">{t.expiry}</td>
                  <td className="font-mono text-txt-secondary">{t.qty}x</td>
                  <td className="font-mono text-txt-secondary">{fmtMoney(t.entryDebit)}</td>
                  <td className="font-mono text-txt-secondary">{fmtMoney(t.exitCredit)}</td>
                  <td className="text-txt-muted">
                    <span>{formatDate(t.entryDate)}</span>
                    <span className="ml-1 text-[10px] text-txt-dim">{formatTime(t.entryDate)}</span>
                  </td>
                  <td className="text-txt-muted">
                    <span>{formatDate(t.exitDate)}</span>
                    <span className="ml-1 text-[10px] text-txt-dim">{formatTime(t.exitDate)}</span>
                  </td>
                  <td className={`text-right font-mono font-bold ${pnlColor}`}>
                    {t.pnl >= 0 ? "+" : ""}{fmtMoney(t.pnl)}
                  </td>
                  <td className={`text-right font-mono ${pnlColor}`}>
                    {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
