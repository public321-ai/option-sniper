"use client";

import { useMemo } from "react";
import type { SpreadPosition } from "@/lib/types";
import { fmtMoney, fmtPct } from "./ui";

/** TradingView exchange prefix map for common underlyings */
const TV_EXCHANGE: Record<string, string> = {
  SPY: "AMEX",
  QQQ: "NASDAQ",
  IWM: "NYSE",
  AAPL: "NASDAQ",
  MSFT: "NASDAQ",
  NVDA: "NASDAQ",
  TSLA: "NASDAQ",
  AMZN: "NASDAQ",
  META: "NASDAQ",
  GOOGL: "NASDAQ",
  AMD: "NASDAQ",
  NFLX: "NASDAQ",
};

function tvSymbol(underlying: string) {
  const ex = TV_EXCHANGE[underlying.toUpperCase()] || "NASDAQ";
  return `${ex}:${underlying}`;
}

/** Build TradingView embed URL for a given symbol */
function tvEmbedUrl(underlying: string) {
  const symbol = encodeURIComponent(tvSymbol(underlying));
  const params = new URLSearchParams({
    frameElementId: `tv_${underlying}`,
    symbol,
    interval: "15",
    theme: "dark",
    style: "1",
    locale: "en",
    toolbar_bg: "#0a0a0f",
    enable_publishing: "false",
    hide_top_toolbar: "0",
    hide_legend: "0",
    hide_side_toolbar: "1",
    withdateranges: "1",
    show_popup_button: "1",
    popup_width: "1000",
    popup_height: "650",
    allow_symbol_change: "false",
    save_image: "false",
    backgroundColor: "rgba(10, 10, 15, 1)",
    gridColor: "rgba(30, 30, 40, 0.5)",
  });
  return `https://s.tradingview.com/widgetembed/?${params}`;
}

/** Chart overlay showing strike zone, stop loss, and profit target levels */
function ChartOverlay({ spread }: { spread: SpreadPosition }) {
  const longStrike = spread.longStrike;
  const shortStrike = spread.shortStrike;
  const breakeven = longStrike + spread.entryDebit;
  const range = shortStrike - longStrike || 1;
  const padding = range * 0.5;

  const priceMin = longStrike - padding;
  const priceMax = shortStrike + padding;
  const px = (p: number) => ((p - priceMin) / (priceMax - priceMin)) * 300;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center pt-1">
      <svg width="100%" height="62" viewBox="0 0 300 60" preserveAspectRatio="none" className="opacity-70">
        {/* Profit zone shading */}
        <rect x={px(longStrike)} y={0} width={px(shortStrike) - px(longStrike)} height={60} fill="rgba(0, 212, 170, 0.06)" />

        {/* Long strike — Stop loss zone */}
        <line x1={px(longStrike)} y1="0" x2={px(longStrike)} y2="60" stroke="#ff4444" strokeWidth="1.2" strokeDasharray="4,2" />
        <rect x={px(longStrike) - 1} y="0" width="52" height="11" rx="1.5" fill="rgba(255,68,68,0.25)" />
        <text x={px(longStrike) + 2} y="9" fill="#ff4444" fontSize="7" fontFamily="monospace" fontWeight="bold">STOP ${longStrike}</text>

        {/* Short strike — Target zone */}
        <line x1={px(shortStrike)} y1="0" x2={px(shortStrike)} y2="60" stroke="#00d4aa" strokeWidth="1.2" strokeDasharray="4,2" />
        <rect x={px(shortStrike) - 1} y="0" width="58" height="11" rx="1.5" fill="rgba(0,212,170,0.2)" />
        <text x={px(shortStrike) + 2} y="9" fill="#00d4aa" fontSize="7" fontFamily="monospace" fontWeight="bold">TARGET ${shortStrike}</text>

        {/* Breakeven */}
        <line x1={px(breakeven)} y1="0" x2={px(breakeven)} y2="60" stroke="#fbbf24" strokeWidth="0.8" strokeDasharray="2,4" />
        <text x={px(breakeven) + 2} y="22" fill="#fbbf24" fontSize="6.5" fontFamily="monospace">BE ${breakeven.toFixed(1)}</text>
      </svg>
    </div>
  );
}

/** Single position card with TradingView chart */
function PositionCard({
  spread,
  onClose,
  closing,
}: {
  spread: SpreadPosition;
  onClose: (id: string) => void;
  closing: string | null;
}) {
  const isClosing = closing === spread.id;
  const embedUrl = useMemo(() => tvEmbedUrl(spread.underlying), [spread.underlying]);

  const pnlColor = spread.pnl >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlBg = spread.pnl >= 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30";

  const startPct = 0;
  const stopPct = ((spread.stopLoss - spread.entryDebit) / spread.entryDebit) * 100;
  const targetPct = ((spread.profitTarget - spread.entryDebit) / spread.entryDebit) * 100;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
      {/* Chart area with overlay */}
      <div className="relative min-h-[300px]">
        <ChartOverlay spread={spread} />
        <iframe
          src={embedUrl}
          title={`${spread.underlying} chart`}
          className="h-full w-full border-0"
          style={{ minHeight: 300 }}
          loading="lazy"
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>

      {/* Position details */}
      <div className="border-t border-slate-800 px-4 py-3">
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${spread.entryDebit > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              {spread.entryDebit > 0 ? "BUY" : "SELL"}
            </span>
            <span className="text-sm font-bold text-white">{spread.underlying}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
              {spread.longStrike}/{spread.shortStrike}C
            </span>
            <span className="font-mono text-[11px] text-slate-500">{spread.expiry}</span>
          </div>
          <div className="flex items-center gap-2">
            {spread.exitSignal && (
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
                EXIT SIGNAL
              </span>
            )}
            <button
              onClick={() => onClose(spread.id)}
              disabled={isClosing}
              className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
            >
              {isClosing ? "CLOSING…" : "CLOSE"}
            </button>
          </div>
        </div>

        {/* Stats grid: Start / Stop / Target with market rate */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Start</div>
            <div className="font-mono text-sm font-bold text-white">{fmtMoney(spread.entryDebit)}</div>
            <div className="mt-0.5 font-mono text-[10px] text-slate-500">mkt {fmtMoney(spread.currentValue)}</div>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400/70">Stop Loss</div>
            <div className="font-mono text-sm font-bold text-red-400">{fmtMoney(spread.stopLoss)}</div>
            <div className="mt-0.5 font-mono text-[10px] text-red-400/60">{stopPct.toFixed(0)}% from start</div>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Target</div>
            <div className="font-mono text-sm font-bold text-emerald-400">{fmtMoney(spread.profitTarget)}</div>
            <div className="mt-0.5 font-mono text-[10px] text-emerald-400/60">{targetPct > 0 ? "+" : ""}{targetPct.toFixed(0)}% from start</div>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="mt-2 grid grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-slate-500">Qty</div>
            <div className="font-mono text-slate-200">{spread.qty}x</div>
          </div>
          <div>
            <div className="text-slate-500">DTE</div>
            <div className={`font-mono ${spread.dte <= 7 ? "text-red-400" : "text-slate-200"}`}>{spread.dte}</div>
          </div>
          <div>
            <div className="text-slate-500">Debit</div>
            <div className="font-mono text-slate-200">{fmtMoney(spread.entryDebit * 100 * spread.qty)}</div>
          </div>
          <div>
            <div className="text-slate-500">Width</div>
            <div className="font-mono text-slate-200">{fmtMoney(spread.shortStrike - spread.longStrike)}</div>
          </div>
        </div>

        {/* P&L bar */}
        <div className={`mt-2 flex items-center justify-between rounded-lg border px-3 py-1.5 ${pnlBg}`}>
          <span className="text-[11px] text-slate-400">P&L</span>
          <span className={`font-mono text-sm font-bold ${pnlColor}`}>
            {fmtMoney(spread.pnl)} <span className="text-xs font-normal">({fmtPct(spread.pnlPct)})</span>
          </span>
        </div>

        {/* Chart legend */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "#ff4444" }} /> Stop (long strike)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "#00d4aa" }} /> Target (short strike)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "#fbbf24" }} /> Breakeven
          </span>
        </div>
      </div>
    </div>
  );
}

/** Positions display with live TradingView charts */
export function PositionCharts({
  positions,
  onClose,
  closing,
}: {
  positions: SpreadPosition[];
  onClose: (id: string) => void;
  closing: string | null;
}) {
  if (positions.length === 0) {
    return (
      <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
        No open positions. Alpaca is the source of truth.
      </p>
    );
  }

  return (
    <div className={`grid gap-4 ${positions.length === 1 ? "grid-cols-1" : "lg:grid-cols-2"}`}>
      {positions.map((s) => (
        <PositionCard key={s.id} spread={s} onClose={onClose} closing={closing} />
      ))}
    </div>
  );
}
