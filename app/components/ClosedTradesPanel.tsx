"use client";

import type { ClosedTrade } from "@/lib/types";
import { fmtMoney, fmtPct } from "./ui";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ClosedTradesPanel({ trades }: { trades: ClosedTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-6 text-center">
        <p className="text-sm text-slate-500">No closed trades yet. Closed positions will appear here with realized P&amp;L.</p>
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
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-xs">
        <span className="text-slate-400">
          {trades.length} closed trade{trades.length !== 1 ? "s" : ""}
        </span>
        <span className="text-slate-600">|</span>
        <span className={totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
          Total P&amp;L: {fmtMoney(totalPnl)}
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-emerald-400">{wins}W</span>
        <span className="text-red-400">{losses}L</span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-300">Win rate: {winRate.toFixed(0)}%</span>
      </div>

      {/* Trades table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">Underlying</th>
              <th className="px-3 py-2">Spread</th>
              <th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Entry Debit</th>
              <th className="px-3 py-2">Exit Credit</th>
              <th className="px-3 py-2">Entry Date</th>
              <th className="px-3 py-2">Exit Date</th>
              <th className="px-3 py-2 text-right">P&amp;L ($)</th>
              <th className="px-3 py-2 text-right">P&amp;L (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/60">
            {trades.map((t) => {
              const pnlColor = t.pnl > 0 ? "text-emerald-400" : t.pnl < 0 ? "text-red-400" : "text-slate-400";
              const rowBg = t.pnl > 0 ? "bg-emerald-500/[0.03]" : t.pnl < 0 ? "bg-red-500/[0.03]" : "";
              return (
                <tr key={t.id} className={rowBg}>
                  <td className="px-3 py-2 font-bold text-white">{t.underlying}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">
                    {t.longStrike}/{t.shortStrike}C
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">{t.expiry}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{t.qty}x</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmtMoney(t.entryDebit)}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmtMoney(t.exitCredit)}</td>
                  <td className="px-3 py-2 text-slate-400">
                    <span>{formatDate(t.entryDate)}</span>
                    <span className="ml-1 text-[10px] text-slate-600">{formatTime(t.entryDate)}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    <span>{formatDate(t.exitDate)}</span>
                    <span className="ml-1 text-[10px] text-slate-600">{formatTime(t.exitDate)}</span>
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${pnlColor}`}>
                    {t.pnl >= 0 ? "+" : ""}{fmtMoney(t.pnl)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${pnlColor}`}>
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
