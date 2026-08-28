"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type {
  AccountView,
  AgentLogEntry,
  Decision,
  Opportunity,
  ScanRow,
  SpreadPosition,
  TickResult,
} from "@/lib/types";
import { DecisionBadge, fmtMoney, fmtPct, LogPanel, PositionsTable, ScoreBar, TrendBadge } from "./components/ui";
import AlpacaMonitor from "./components/AlpacaMonitor";

const POLL_INTERVAL_MS = 60_000; // agent tick cadence while running

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-slate-800/50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`font-mono text-sm font-semibold ${accent ?? "text-slate-200"}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { authenticated, loading, logout } = useAuth();
  const router = useRouter();

  // Gate the dashboard behind authentication.
  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace("/login");
    }
  }, [authenticated, loading, router]);

  if (loading || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Authenticating…
      </div>
    );
  }

  const [account, setAccount] = useState<AccountView | null>(null);
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [best, setBest] = useState<Opportunity | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [positions, setPositions] = useState<SpreadPosition[]>([]);
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<"scan" | "tick" | "submit" | "refresh" | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoEnter, setAutoEnter] = useState(true);
  const isMock = account?.mock ?? false;

  const appendLog = useCallback((entries: AgentLogEntry[] | undefined) => {
    if (entries?.length) setLog((prev) => [...entries, ...prev].slice(0, 300));
  }, []);

  const applyTick = useCallback(
    (data: TickResult) => {
      setAccount(data.account);
      setScan(data.scan ?? []);
      setBest(data.best);
      setDecision(data.decision);
      setPositions(data.positions ?? []);
      setError(null);
      appendLog(data.log);
    },
    [appendLog]
  );

  const runApi = useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setBusy("refresh");
    try {
      const data = await runApi("/api/account");
      setAccount(data.account);
      setPositions(data.positions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [runApi]);

  const scanNow = useCallback(async () => {
    setBusy("scan");
    try {
      applyTick(await runApi("/api/agent/scan", {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [runApi, applyTick]);

  const agentTick = useCallback(async () => {
    setBusy("tick");
    try {
      applyTick(await runApi("/api/agent/tick", { autoEnter }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [runApi, applyTick, autoEnter]);

  const submitTrade = useCallback(async () => {
    if (!best) return;
    setBusy("submit");
    try {
      const data = await runApi("/api/trade", { candidate: best.candidate });
      setDecision(data.decision);
      appendLog(data.log);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [best, runApi, appendLog, refresh]);

  const closePosition = useCallback(
    async (id: string) => {
      setClosingId(id);
      try {
        appendLog((await runApi("/api/positions/close", { spreadId: id })).log);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setClosingId(null);
      }
    },
    [runApi, appendLog, refresh]
  );

  // initial load + agent loop (client-driven polling keeps the app serverless)
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!running) return;
    void agentTick();
    const id = setInterval(() => void agentTick(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running, agentTick]);

  return (
    <DashboardBody
      account={account} scan={scan} best={best} decision={decision} positions={positions}
      log={log} running={running} setRunning={setRunning} busy={busy} closingId={closingId}
      error={error} autoEnter={autoEnter} setAutoEnter={setAutoEnter} isMock={isMock}
      onScan={scanNow} onRefresh={refresh} onSubmit={submitTrade} onClose={closePosition}
      onLogout={logout}
    />
  );
}

function DashboardBody(props: {
  account: AccountView | null;
  scan: ScanRow[];
  best: Opportunity | null;
  decision: Decision | null;
  positions: SpreadPosition[];
  log: AgentLogEntry[];
  running: boolean;
  setRunning: (fn: (r: boolean) => boolean) => void;
  busy: string | null;
  closingId: string | null;
  error: string | null;
  autoEnter: boolean;
  setAutoEnter: (v: boolean) => void;
    isMock: boolean;
  onScan: () => void;
  onRefresh: () => void;
  onSubmit: () => void;
  onClose: (id: string) => void;
  onLogout: () => void;
}) {
  const { best, decision } = props;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            🎯 Options <span className="text-emerald-400">Sniper</span>
          </h1>
          <p className="text-sm text-slate-400">Autonomous Bull Call Spread agent · Alpaca Options Alpha Agents</p>
        </div>
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-center">
          <p className="text-sm font-black tracking-widest text-amber-400">⚠️ PAPER TRADING ONLY</p>
          <p className="text-[11px] text-amber-300/80">
            Alpaca paper account · no real money · {props.isMock ? "DEMO DATA MODE" : "live paper API"}
          </p>
        </div>
        <button
          onClick={props.onLogout}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-500/50 hover:text-red-300"
          title="Log out and return to the login screen"
        >
          🚪 Log out
        </button>
      </div>

      {props.error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <strong>Error:</strong> {props.error}
        </div>
      )}

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <button
          onClick={() => props.setRunning((r) => !r)}
          className={`rounded-lg px-4 py-2 text-sm font-bold tracking-wide transition ${
            props.running ? "bg-red-500/90 text-white hover:bg-red-500" : "bg-emerald-500/90 text-slate-950 hover:bg-emerald-500"
          }`}
        >
          {props.running ? "■ STOP AGENT" : "▶ START AGENT"}
        </button>
        <button
          onClick={props.onScan}
          disabled={props.busy !== null}
          className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-bold tracking-wide text-sky-400 hover:bg-sky-500/20 disabled:opacity-50"
        >
          {props.busy === "scan" ? "SCANNING…" : "🔍 SCAN NOW"}
        </button>
        <button
          onClick={props.onRefresh}
          disabled={props.busy !== null}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          ⟳ REFRESH
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={props.autoEnter} onChange={(e) => props.setAutoEnter(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          Auto-submit approved trades (score ≥ 75, risk ≤ 1%)
        </label>
        {props.running && (
          <span className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            AGENT RUNNING · tick every {POLL_INTERVAL_MS / 1000}s
          </span>
        )}
      </div>

      {/* Alpaca Integration Monitor */}
      <AlpacaMonitor decision={props.decision} positionsCount={props.positions.length} mock={props.isMock} />

      {/* Account + Best opportunity */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Alpaca Account {props.isMock && <span className="text-amber-400">(demo data)</span>}
          </h2>
          {props.account ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Equity</dt><dd className="font-mono font-bold text-emerald-400">{fmtMoney(props.account.equity)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Buying Power</dt><dd className="font-mono">{fmtMoney(props.account.buyingPower)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Cash</dt><dd className="font-mono">{fmtMoney(props.account.cash)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Open Positions</dt><dd className="font-mono">{props.positions.length}</dd></div>
              <div className="flex justify-between text-xs"><dt className="text-slate-500">Acct #</dt><dd className="font-mono text-slate-500">{props.account.accountNumber} · {props.account.status}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Loading account…</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Best Opportunity</h2>
            <DecisionBadge decision={decision} />
          </div>
          {best?.candidate ? (
            <div>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-xl font-bold">
                  {best.candidate.underlying} {best.candidate.longStrike}/{best.candidate.shortStrike} Bull Call Spread
                </span>
                <span className="text-sm text-slate-400">exp {best.candidate.expiry} · {best.candidate.dte} DTE</span>
                <span className="ml-auto text-2xl font-black text-emerald-400">{best.score.toFixed(1)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Debit" value={fmtMoney(best.candidate.debit)} />
                <Stat label="Width" value={fmtMoney(best.candidate.width)} />
                <Stat label="Max Profit" value={fmtMoney(best.candidate.maxProfit)} accent="text-emerald-400" />
                <Stat label="Max Loss" value={fmtMoney(best.candidate.maxLoss)} accent="text-red-400" />
                <Stat label="R:R" value={`${best.candidate.riskReward.toFixed(2)}:1`} />
                <Stat label="OI (L/S)" value={`${best.candidate.longLeg.openInterest}/${best.candidate.shortLeg.openInterest}`} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-400">
                  Legs: BUY {best.candidate.longLeg.symbol} @ {fmtMoney(best.candidate.longLeg.ask)} · SELL {best.candidate.shortLeg.symbol} @ {fmtMoney(best.candidate.shortLeg.bid)}
                </p>
                {decision?.action === "ENTER" && (
                  <button
                    onClick={props.onSubmit}
                    disabled={props.busy !== null}
                    className="ml-auto rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {props.busy === "submit" ? "SUBMITTING…" : `SUBMIT TRADE${decision.suggestedQty ? ` (${decision.suggestedQty}x)` : ""}`}
                  </button>
                )}
              </div>
              {decision && <p className="mt-2 text-xs text-slate-400">{decision.reason}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{decision?.reason ?? "Run a scan to find opportunities."}</p>
          )}
        </div>
      </div>

      {/* Scanner table */}
      <div className="mb-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Market Scanner — SPY · QQQ · IWM · AAPL · MSFT · NVDA · TSLA</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">20MA</th>
                <th className="px-3 py-2">50MA</th>
                <th className="px-3 py-2">RSI-14</th>
                <th className="px-3 py-2">Momentum</th>
                <th className="px-3 py-2">Trend</th>
                <th className="px-3 py-2">Best Spread</th>
                <th className="px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/60">
              {props.scan.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-500">No scan yet — press SCAN NOW.</td></tr>
              ) : (
                props.scan.map((row) => (
                  <tr key={row.symbol} className={row.indicators.trend === "bullish" ? "bg-emerald-500/5" : ""}>
                    <td className="px-3 py-2 font-bold">{row.symbol}</td>
                    <td className="px-3 py-2 font-mono">{row.indicators.price ? fmtMoney(row.indicators.price) : "—"}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.indicators.ma20 ? row.indicators.ma20.toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{row.indicators.ma50 ? row.indicators.ma50.toFixed(2) : "—"}</td>
                    <td className={`px-3 py-2 font-mono ${row.indicators.rsi !== null && row.indicators.rsi > 70 ? "text-amber-400" : row.indicators.rsi !== null && row.indicators.rsi < 30 ? "text-red-400" : ""}`}>
                      {row.indicators.rsi !== null ? row.indicators.rsi.toFixed(1) : "—"}
                    </td>
                    <td className={`px-3 py-2 font-mono ${(row.indicators.momentum ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {row.indicators.momentum !== null ? fmtPct(row.indicators.momentum / 100) : "—"}
                    </td>
                    <td className="px-3 py-2"><TrendBadge trend={row.indicators.trend} /></td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">
                      {row.candidate
                        ? `${row.candidate.longStrike}/${row.candidate.shortStrike}C ${row.candidate.expiry} · ${fmtMoney(row.candidate.debit)} DB`
                        : row.error
                          ? <span className="text-red-400" title={row.error}>error</span>
                          : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2">{row.candidateScore !== null ? <ScoreBar score={row.candidateScore} /> : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Positions + Log */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Open Positions &amp; P&amp;L (Alpaca source of truth)</h2>
          <PositionsTable positions={props.positions} onClose={props.onClose} closing={props.closingId} />
        </div>
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Agent Activity Log</h2>
          <LogPanel log={props.log} />
        </div>
      </div>

      <footer className="mt-8 border-t border-slate-800 pt-4 text-center text-xs text-slate-600">
        Options Sniper · Alpaca Options Alpha Agents hackathon · Paper trading only — not investment advice.
      </footer>
    </main>
  );
}
