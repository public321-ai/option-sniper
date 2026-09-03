"use client";

import { useMemo } from "react";
import type { SpreadPosition } from "@/lib/types";
import { fmtMoney, fmtPct } from "./ui";

const TV_EXCHANGE: Record<string, string> = {
  SPY: "AMEX", QQQ: "NASDAQ", IWM: "NYSE", AAPL: "NASDAQ",
  MSFT: "NASDAQ", NVDA: "NASDAQ", TSLA: "NASDAQ", AMZN: "NASDAQ",
  META: "NASDAQ", GOOGL: "NASDAQ", AMD: "NASDAQ", NFLX: "NASDAQ",
};

function tvSymbol(underlying: string) {
  const ex = TV_EXCHANGE[underlying.toUpperCase()] || "NASDAQ";
  return `${ex}:${underlying}`;
}

function tvEmbedUrl(underlying: string) {
  const symbol = encodeURIComponent(tvSymbol(underlying));
  const params = new URLSearchParams({
    frameElementId: `tv_${underlying}`,
    symbol, interval: "15", theme: "dark", style: "1", locale: "en",
    toolbar_bg: "#0d1117", enable_publishing: "false",
    hide_top_toolbar: "0", hide_legend: "0", hide_side_toolbar: "1",
    withdateranges: "1", show_popup_button: "1",
    popup_width: "1000", popup_height: "650",
    allow_symbol_change: "false", save_image: "false",
    backgroundColor: "rgba(13,17,23,1)", gridColor: "rgba(30,40,54,0.5)",
  });
  return `https://s.tradingview.com/widgetembed/?${params}`;
}

/** P&L risk/reward progress bar */
function PnlBar({ spread }: { spread: SpreadPosition }) {
  const isPaired = spread.longStrike > 0 && spread.shortStrike > 0;
  if (!isPaired) {
    const isProfit = spread.pnl >= 0;
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-charcoal overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isProfit ? "bg-emerald-soft" : "bg-coral"}`}
            style={{ width: `${Math.min(100, Math.abs(spread.pnlPct))}%` }}
          />
        </div>
        <span className={`font-mono text-xs font-bold ${isProfit ? "text-emerald-soft" : "text-coral"}`}>
          {fmtMoney(spread.pnl)} ({fmtPct(spread.pnlPct)})
        </span>
      </div>
    );
  }

  // For paired spreads: show a risk bar from max-loss to max-profit
  const entryCost = spread.entryDebit;
  const maxLoss = entryCost; // debit spread max loss = debit paid
  const maxProfit = (spread.shortStrike - spread.longStrike) - entryCost; // width - debit
  const totalRange = maxLoss + maxProfit;
  if (totalRange <= 0) return null;

  // Current P&L per share relative to entry
  const currentPL = spread.currentValue - entryCost;
  const pnlPctOfRange = (currentPL + maxLoss) / totalRange; // 0 = max loss, 1 = max profit
  const clamped = Math.max(0, Math.min(1, pnlPctOfRange));

  // Marker position as percentage of the total range
  const lossZone = (maxLoss / totalRange) * 100;
  const profitZone = 100 - lossZone;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-coral font-mono">-{fmtMoney(maxLoss)}</span>
        <div className="flex-1 relative h-2.5 rounded-full overflow-hidden bg-charcoal">
          {/* Loss zone (left) */}
          <div className="absolute inset-y-0 left-0 bg-coral/20" style={{ width: `${lossZone}%` }} />
          {/* Profit zone (right) */}
          <div className="absolute inset-y-0 right-0 bg-emerald-soft/20" style={{ width: `${profitZone}%` }} />
          {/* Breakeven line */}
          <div className="absolute inset-y-0 bg-amber-soft/60" style={{ left: `${lossZone}%`, width: 1 }} />
          {/* Current position marker */}
          <div
            className="absolute top-0 bottom-0 w-1 -translate-x-0.5 rounded-full transition-all"
            style={{
              left: `${clamped * 100}%`,
              background: currentPL >= 0 ? "var(--color-emerald-soft)" : "var(--color-coral)",
              boxShadow: currentPL >= 0
                ? "0 0 6px rgba(63,185,80,0.5)"
                : "0 0 6px rgba(248,81,73,0.5)",
            }}
          />
        </div>
        <span className="text-emerald-soft font-mono">+{fmtMoney(maxProfit)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-txt-dim">Max Loss</span>
        <span className={`font-mono text-xs font-bold ${spread.pnl >= 0 ? "text-emerald-soft" : "text-coral"}`}>
          {fmtMoney(spread.pnl)} <span className="font-normal">({fmtPct(spread.pnlPct)})</span>
        </span>
        <span className="text-[10px] text-txt-dim">Max Profit</span>
      </div>
    </div>
  );
}

/** Chart overlay — solo vs paired */
function ChartOverlay({ spread }: { spread: SpreadPosition }) {
  const longStrike = spread.longStrike;
  const shortStrike = spread.shortStrike;
  const isPaired = shortStrike > 0 && longStrike > 0;

  if (!isPaired) {
    const strike = longStrike > 0 ? longStrike : shortStrike;
    const color = longStrike > 0 ? "var(--color-coral)" : "var(--color-emerald-soft)";
    const label = longStrike > 0 ? `STRIKE $${longStrike}` : `STRIKE $${shortStrike}`;
    const bgColor = longStrike > 0 ? "rgba(248,81,73,0.12)" : "rgba(63,185,80,0.10)";
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center pt-1">
        <svg width="100%" height="62" viewBox="0 0 300 60" preserveAspectRatio="none" className="opacity-70">
          <line x1="150" y1="0" x2="150" y2="60" stroke={color} strokeWidth="1.5" strokeDasharray="4,3" />
          <rect x="151" y="0" width="72" height="12" rx="2" fill={bgColor} />
          <text x="154" y="10" fill={color} fontSize="7" fontFamily="monospace" fontWeight="700">{label}</text>
        </svg>
      </div>
    );
  }

  const breakeven = longStrike + spread.entryDebit;
  const range = shortStrike - longStrike || 1;
  const padding = range * 0.5;
  const priceMin = longStrike - padding;
  const priceMax = shortStrike + padding;
  const px = (p: number) => ((p - priceMin) / (priceMax - priceMin)) * 300;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center pt-1">
      <svg width="100%" height="62" viewBox="0 0 300 60" preserveAspectRatio="none" className="opacity-70">
        {/* Profit zone fill */}
        <rect x={px(longStrike)} y={0} width={px(shortStrike) - px(longStrike)} height={60} fill="rgba(63,185,80,0.06)" />
        {/* Stop loss line */}
        <line x1={px(longStrike)} y1="0" x2={px(longStrike)} y2="60" stroke="var(--color-coral)" strokeWidth="1.5" strokeDasharray="4,3" />
        <rect x={px(longStrike) - 1} y="0" width="55" height="12" rx="2" fill="rgba(248,81,73,0.15)" />
        <text x={px(longStrike) + 2} y="10" fill="var(--color-coral)" fontSize="7" fontFamily="monospace" fontWeight="700">STOP ${longStrike}</text>
        {/* Target line */}
        <line x1={px(shortStrike)} y1="0" x2={px(shortStrike)} y2="60" stroke="var(--color-emerald-soft)" strokeWidth="1.5" strokeDasharray="4,3" />
        <rect x={px(shortStrike) - 1} y="0" width="60" height="12" rx="2" fill="rgba(63,185,80,0.12)" />
        <text x={px(shortStrike) + 2} y="10" fill="var(--color-emerald-soft)" fontSize="7" fontFamily="monospace" fontWeight="700">TGT ${shortStrike}</text>
        {/* Breakeven line */}
        <line x1={px(breakeven)} y1="0" x2={px(breakeven)} y2="60" stroke="var(--color-amber-soft)" strokeWidth="0.8" strokeDasharray="2,4" />
        <rect x={px(breakeven) - 1} y="14" width="52" height="10" rx="2" fill="rgba(210,153,34,0.10)" />
        <text x={px(breakeven) + 2} y="22" fill="var(--color-amber-soft)" fontSize="6.5" fontFamily="monospace" fontWeight="600">BE ${breakeven.toFixed(1)}</text>
      </svg>
    </div>
  );
}

/** Single position card */
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

  const isPaired = spread.longStrike > 0 && spread.shortStrike > 0;
  const stopPct = spread.entryDebit > 0 ? ((spread.stopLoss - spread.entryDebit) / spread.entryDebit) * 100 : 0;
  const targetPct = spread.entryDebit > 0 ? ((spread.profitTarget - spread.entryDebit) / spread.entryDebit) * 100 : 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-bdr bg-graphite shadow-sm" aria-label={`${spread.underlying} ${spread.side} position`}>
      {/* Chart area with overlay */}
      <div className="relative" style={{ height: 280 }}>
        <ChartOverlay spread={spread} />
        <iframe
          src={embedUrl}
          title={`${spread.underlying} price chart`}
          className="h-full w-full border-0"
          loading="lazy"
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>

      {/* Position details */}
      <div className="border-t border-bdr px-4 py-3 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`rounded-[var(--radius-badge)] px-1.5 py-0.5 text-[11px] font-bold ${
              spread.side === "long" ? "bg-emerald-dim text-emerald-soft" : "bg-coral-dim text-coral"
            }`}>
              {spread.side === "long" ? "BUY" : "SELL"}
            </span>
            <span className="text-sm font-bold text-txt">{spread.underlying}</span>
            <span className="rounded-[var(--radius-badge)] bg-charcoal px-1.5 py-0.5 font-mono text-[11px] text-txt-secondary">
              {spread.side === "long"
                ? (spread.shortStrike > 0 ? `${spread.longStrike}/${spread.shortStrike}C` : `${spread.longStrike}C`)
                : (spread.longStrike > 0 ? `${spread.longStrike}/${spread.shortStrike}C` : `${spread.shortStrike}C`)}
            </span>
            <time className="font-mono text-[11px] text-txt-muted" dateTime={spread.expiry}>{spread.expiry}</time>
            {spread.groupId && (
              <span className="rounded-[var(--radius-badge)] bg-[rgba(57,210,192,0.08)] px-1.5 py-0.5 text-[10px] text-cyan-soft">SPREAD</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {spread.exitSignal && (
              <span className="rounded-[var(--radius-badge)] bg-coral-dim px-2 py-0.5 text-[11px] font-semibold text-coral" role="alert">
                EXIT: {spread.exitSignal}
              </span>
            )}
            <button
              onClick={() => onClose(spread.id)}
              disabled={isClosing}
              className="btn-danger px-2.5 py-1 text-[11px]"
              type="button"
            >
              {isClosing ? "CLOSING…" : "CLOSE"}
            </button>
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="soft-stat">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted">Entry</div>
            <div className="font-mono text-sm font-bold text-txt">{fmtMoney(spread.entryDebit)}</div>
            <div className="font-mono text-[10px] text-txt-muted">mkt {fmtMoney(spread.currentValue)}</div>
          </div>
          {isPaired && spread.stopLoss > 0 ? (
            <div className="soft-stat border-coral/15 bg-coral-dim/40">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-coral/70">Stop Loss</div>
              <div className="font-mono text-sm font-bold text-coral">{fmtMoney(spread.stopLoss)}</div>
              <div className="font-mono text-[10px] text-coral/50">{stopPct.toFixed(0)}% from entry</div>
            </div>
          ) : (
            <div className="soft-stat">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted">Stop Loss</div>
              <div className="font-mono text-sm text-txt-dim">—</div>
            </div>
          )}
          {isPaired && spread.profitTarget > 0 ? (
            <div className="soft-stat border-emerald-soft/15 bg-emerald-dim/40">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-soft/70">Target</div>
              <div className="font-mono text-sm font-bold text-emerald-soft">{fmtMoney(spread.profitTarget)}</div>
              <div className="font-mono text-[10px] text-emerald-soft/50">{targetPct > 0 ? "+" : ""}{targetPct.toFixed(0)}% from entry</div>
            </div>
          ) : (
            <div className="soft-stat">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-txt-muted">Target</div>
              <div className="font-mono text-sm text-txt-dim">—</div>
            </div>
          )}
        </div>

        {/* P&L risk/reward bar */}
        <div className={`rounded-[var(--radius-inner)] border px-3 py-2 ${
          spread.pnl >= 0 ? "pnl-positive-bg" : "pnl-negative-bg"
        }`}>
          <PnlBar spread={spread} />
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-txt-muted">Qty</div>
            <div className="font-mono text-txt-secondary">{spread.qty}x</div>
          </div>
          <div>
            <div className="text-txt-muted">DTE</div>
            <div className={`font-mono ${spread.dte <= 7 ? "text-coral" : "text-txt-secondary"}`}>{spread.dte}</div>
          </div>
          <div>
            <div className="text-txt-muted">Value</div>
            <div className="font-mono text-txt-secondary">{fmtMoney(spread.entryDebit * 100 * spread.qty)}</div>
          </div>
          <div>
            <div className="text-txt-muted">{isPaired ? "Width" : "Strike"}</div>
            <div className="font-mono text-txt-secondary">
              {isPaired ? fmtMoney(spread.shortStrike - spread.longStrike) : fmtMoney(spread.side === "long" ? spread.longStrike : spread.shortStrike)}
            </div>
          </div>
        </div>

        {/* Chart legend */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-txt-dim">
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "var(--color-coral)" }} /> Stop (long strike)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "var(--color-emerald-soft)" }} /> Target (short strike)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "var(--color-amber-soft)" }} /> Breakeven
          </span>
        </div>
      </div>
    </article>
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
      <p className="soft-card p-4 text-sm text-txt-muted">
        No open positions. Alpaca is the source of truth.
      </p>
    );
  }

  return (
    <div className={`grid gap-4 ${positions.length === 1 ? "grid-cols-1" : "sm:grid-cols-2"}`}>
      {positions.map((s) => (
        <PositionCard key={s.id} spread={s} onClose={onClose} closing={closing} />
      ))}
    </div>
  );
}
