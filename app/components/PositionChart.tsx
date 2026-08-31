"use client";

import { useEffect, useRef, useCallback } from "react";
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

/** Strike zone overlay — horizontal lines at long/short strikes with shaded profit zone */
function StrikeZoneOverlay({ spread }: { spread: SpreadPosition }) {
  const longStrike = spread.longStrike;
  const shortStrike = spread.shortStrike;
  const breakeven = longStrike + spread.entryDebit;
  const range = shortStrike - longStrike || 1;
  const padding = range * 0.5;

  // SVG coordinate system: x=0..300 maps to price longStrike-padding .. shortStrike+padding
  const priceMin = longStrike - padding;
  const priceMax = shortStrike + padding;
  const priceToY = (p: number) => ((priceMax - p) / (priceMax - priceMin)) * 60;
  const priceToX = (p: number) => ((p - priceMin) / (priceMax - priceMin)) * 300;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center pt-1">
      <svg width="100%" height="62" viewBox="0 0 300 60" preserveAspectRatio="none" className="opacity-60">
        {/* Profit zone shading between long strike and short strike */}
        <rect
          x={priceToX(longStrike)}
          y={priceToY(shortStrike)}
          width={priceToX(shortStrike) - priceToX(longStrike)}
          height={priceToY(longStrike) - priceToY(shortStrike)}
          fill="rgba(0, 212, 170, 0.06)"
        />
        {/* Long strike line */}
        <line x1={priceToX(longStrike)} y1="0" x2={priceToX(longStrike)} y2="60" stroke="#00d4aa" strokeWidth="1" strokeDasharray="3,3" />
        {/* Short strike line */}
        <line x1={priceToX(shortStrike)} y1="0" x2={priceToX(shortStrike)} y2="60" stroke="#ff6b6b" strokeWidth="1" strokeDasharray="3,3" />
        {/* Breakeven line */}
        <line x1={priceToX(breakeven)} y1="0" x2={priceToX(breakeven)} y2="60" stroke="#fbbf24" strokeWidth="1" strokeDasharray="2,4" />
        {/* Strike labels */}
        <text x={priceToX(longStrike) + 3} y="10" fill="#00d4aa" fontSize="7" fontFamily="monospace">L ${longStrike}</text>
        <text x={priceToX(shortStrike) + 3} y="10" fill="#ff6b6b" fontSize="7" fontFamily="monospace">S ${shortStrike}</text>
        <text x={priceToX(breakeven) + 3} y="20" fill="#fbbf24" fontSize="7" fontFamily="monospace">BE ${breakeven.toFixed(1)}</text>
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
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetLoaded = useRef(false);
  const isClosing = closing === spread.id;

  const loadWidget = useCallback(() => {
    if (!containerRef.current || widgetLoaded.current) return;
    widgetLoaded.current = true;

    const container = containerRef.current;
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.style.height = "280px";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const TV = (window as any).TradingView;
      if (TV && TV.widget) {
        new TV.widget({
          symbol: tvSymbol(spread.underlying),
          interval: "15",
          autosize: true,
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0a0a0f",
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          hide_side_toolbar: true,
          allow_symbol_change: false,
          background_color: "#0a0a0f",
          gridColor: "rgba(30,30,40,0.5)",
          container_id: widgetDiv,
          studies: ["MASimple@tv-basicstudies"],
          show_popup_button: true,
          popup_width: "1000",
          popup_height: "650",
        });
      }
    } catch {
      widgetDiv.innerHTML = `<div class="flex h-full items-center justify-center text-xs text-slate-500">Chart unavailable — TradingView script not loaded</div>`;
    }
  }, [spread.underlying]);

  useEffect(() => {
    // Load TradingView library if not already present
    if (typeof window !== "undefined" && !(window as any).TradingView) {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = () => loadWidget();
      document.head.appendChild(script);
    } else {
      loadWidget();
    }

    return () => {
      widgetLoaded.current = false;
    };
  }, [loadWidget]);

  const pnlColor = spread.pnl >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlBg = spread.pnl >= 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
      {/* Chart area with strike zone overlay */}
      <div className="relative min-h-[280px]">
        <StrikeZoneOverlay spread={spread} />
        <div ref={containerRef} className="h-full w-full min-h-[280px]" />
      </div>

      {/* Position details */}
      <div className="border-t border-slate-800 px-4 py-3">
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
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

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-slate-500">Qty</div>
            <div className="font-mono text-slate-200">{spread.qty}x</div>
          </div>
          <div>
            <div className="text-slate-500">DTE</div>
            <div className={`font-mono ${spread.dte <= 7 ? "text-red-400" : "text-slate-200"}`}>{spread.dte}</div>
          </div>
          <div>
            <div className="text-slate-500">Entry</div>
            <div className="font-mono text-slate-200">{fmtMoney(spread.entryDebit)}</div>
          </div>
          <div>
            <div className="text-slate-500">Value</div>
            <div className="font-mono text-slate-200">{fmtMoney(spread.currentValue)}</div>
          </div>
        </div>

        {/* P&L bar */}
        <div className={`mt-2 flex items-center justify-between rounded-lg border px-3 py-1.5 ${pnlBg}`}>
          <span className="text-[11px] text-slate-400">P&L</span>
          <span className={`font-mono text-sm font-bold ${pnlColor}`}>
            {fmtMoney(spread.pnl)} <span className="text-xs font-normal">({fmtPct(spread.pnlPct)})</span>
          </span>
        </div>

        {/* Strike zone legend */}
        <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "#00d4aa" }} /> Long
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "#ff6b6b" }} /> Short
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-px w-3" style={{ background: "#fbbf24" }} /> Breakeven
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "rgba(0,212,170,0.2)" }} /> Profit zone
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
    <div className="grid gap-4 md:grid-cols-2">
      {positions.map((s) => (
        <PositionCard key={s.id} spread={s} onClose={onClose} closing={closing} />
      ))}
    </div>
  );
}
