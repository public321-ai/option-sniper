"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type {
  AccountView,
  AgentLogEntry,
  ClosedTrade,
  Decision,
  MarketDiscovery,
  NewsRiskAssessment,
  Opportunity,
  OptionsIntelligence,
  ScanRow,
  SpreadPosition,
  TickResult,
} from "@/lib/types";
import { DecisionBadge, fmtMoney, fmtPct, LogPanel, ScoreBar, TrendBadge } from "./components/ui";
import { PositionCharts } from "./components/PositionChart";
import { saveAnalysisData } from "@/lib/analysisStore";
import ClosedTradesPanel from "./components/ClosedTradesPanel";
import AlpacaMonitor from "./components/AlpacaMonitor";

const POLL_INTERVAL_MS = 60_000;

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="soft-stat">
      <p className="text-[10px] uppercase tracking-wider text-txt-muted">{label}</p>
      <p className={`font-mono text-sm font-semibold ${accent ?? "text-txt"}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { authenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace("/login");
    }
  }, [authenticated, loading, router]);

  if (loading || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian text-txt-muted">
        Authenticating…
      </div>
    );
  }

  return <DashboardContent />;
}

function DashboardContent() {
  const { logout } = useAuth();
  const [account, setAccount] = useState<AccountView | null>(null);
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [best, setBest] = useState<Opportunity | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [positions, setPositions] = useState<SpreadPosition[]>([]);
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [running, setRunningState] = useState(false);
  const [busy, setBusy] = useState<"scan" | "tick" | "submit" | "refresh" | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoEnter, setAutoEnterState] = useState(true);
  const [discovery, setDiscovery] = useState<MarketDiscovery | null>(null);
  const [intelligence, setIntelligence] = useState<OptionsIntelligence | null>(null);
  const [newsRisk, setNewsRisk] = useState<NewsRiskAssessment | null>(null);
  const isMock = account?.mock ?? false;

  const setRunning = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setRunningState((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      try { sessionStorage.setItem("sniper-agent-running", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  const setAutoEnter = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setAutoEnterState((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      try { sessionStorage.setItem("sniper-auto-enter", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const r = sessionStorage.getItem("sniper-agent-running");
      const a = sessionStorage.getItem("sniper-auto-enter");
      if (r === "1") setRunningState(true);
      if (a === "0") setAutoEnterState(false);
    } catch {}
  }, []);

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
      setDiscovery(data.discovery ?? null);
      setIntelligence(data.intelligence ?? null);
      setNewsRisk(data.newsRisk ?? null);
      setError(null);
      appendLog(data.log);
      saveAnalysisData({ discovery: data.discovery ?? null, intelligence: data.intelligence ?? null, newsRisk: data.newsRisk ?? null });
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

  const fetchClosedTrades = useCallback(async () => {
    try {
      const data = await runApi("/api/positions/closed");
      setClosedTrades(data.closed ?? []);
    } catch {
      // best-effort
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
      const data = await runApi("/api/trade", { candidate: best.candidate, score: best.score, breakdown: best.breakdown });
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
        await fetchClosedTrades();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setClosingId(null);
      }
    },
    [runApi, appendLog, refresh, fetchClosedTrades]
  );

  useEffect(() => {
    void refresh();
    void fetchClosedTrades();
  }, [refresh, fetchClosedTrades]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const data = await runApi("/api/account");
        setAccount(data.account);
        setPositions(data.positions ?? []);
      } catch {
        // best-effort silent refresh
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [runApi]);

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
      discovery={discovery} intelligence={intelligence} newsRisk={newsRisk}
      closedTrades={closedTrades}
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
  closedTrades: ClosedTrade[];
  running: boolean;
  setRunning: (fn: (r: boolean) => boolean) => void;
  busy: string | null;
  closingId: string | null;
  error: string | null;
  autoEnter: boolean;
  setAutoEnter: (v: boolean) => void;
  isMock: boolean;
  discovery: MarketDiscovery | null;
  intelligence: OptionsIntelligence | null;
  newsRisk: NewsRiskAssessment | null;
  onScan: () => void;
  onRefresh: () => void;
  onSubmit: () => void;
  onClose: (id: string) => void;
  onLogout: () => void;
}) {
  const { best, decision } = props;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* ── Premium Header ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-bdr-accent bg-charcoal">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-emerald-soft" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-txt">
              OPTIONS <span className="text-emerald-soft">SNIPER</span>
            </h1>
            <p className="text-[11px] text-txt-muted">Autonomous Bull Call Spread Agent · Alpaca Options Alpha</p>
          </div>
        </div>
        <div className="soft-card-inner flex items-center gap-2.5 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-amber-soft" />
          <div>
            <p className="text-[11px] font-bold tracking-widest text-amber-soft">PAPER TRADING</p>
            <p className="text-[10px] text-txt-muted">
              {props.isMock ? "Demo data mode" : "Alpaca paper API"} · no real money
            </p>
          </div>
        </div>
        <button
          onClick={props.onLogout}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          Log out
        </button>
      </div>

      {/* ── Error banner ── */}
      {props.error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-coral/30 bg-coral-dim px-4 py-3 text-sm text-coral">
          <strong>Error:</strong> {props.error}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="mb-5 soft-card flex flex-wrap items-center gap-3 p-4">
        <button
          onClick={() => props.setRunning((r) => !r)}
          className={`rounded-[var(--radius-badge)] px-4 py-2 text-sm font-bold tracking-wide transition-all ${
            props.running
              ? "bg-coral-muted text-white hover:bg-coral"
              : "btn-primary"
          }`}
        >
          {props.running ? "■ STOP AGENT" : "▶ START AGENT"}
        </button>
        <button
          onClick={props.onScan}
          disabled={props.busy !== null}
          className="btn-ghost px-4 py-2 text-sm font-bold tracking-wide text-cyan-soft border-cyan-muted/30 hover:border-cyan-muted/60 hover:text-cyan-soft disabled:opacity-40"
        >
          {props.busy === "scan" ? "SCANNING…" : "🔍 SCAN NOW"}
        </button>
        <button
          onClick={props.onRefresh}
          disabled={props.busy !== null}
          className="btn-ghost px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          ⟳ REFRESH
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-txt-muted">
          <input type="checkbox" checked={props.autoEnter} onChange={(e) => props.setAutoEnter(e.target.checked)} className="h-4 w-4 accent-emerald-soft rounded" />
          Auto-submit approved trades
        </label>
        <a
          href="/analysis"
          className="btn-ghost px-4 py-2 text-sm font-semibold"
        >
          📊 Analysis
        </a>
        {props.running && (
          <span className="flex items-center gap-2 text-xs font-semibold text-emerald-soft">
            <span className="pulse-soft h-2 w-2 rounded-full bg-emerald-soft" />
            AGENT RUNNING · tick every {POLL_INTERVAL_MS / 1000}s
          </span>
        )}
      </div>

      {/* ── Alpaca Integration Monitor ── */}
      <AlpacaMonitor
        decision={props.decision}
        positionsCount={props.positions.length}
        mock={props.isMock}
        discovery={props.discovery}
        intelligence={props.intelligence}
        newsRisk={props.newsRisk}
      />

      {/* ── Closed Trades ── */}
      <div className="mb-5">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-txt-muted">Closed Trades — Last 10 P&amp;L</h2>
        <ClosedTradesPanel trades={props.closedTrades} />
      </div>

      {/* ── Open Positions ── */}
      <div className="mb-5">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-txt-muted">Open Positions &amp; P&amp;L</h2>
        <PositionCharts positions={props.positions} onClose={props.onClose} closing={props.closingId} />
      </div>

      {/* ── Account + Best opportunity ── */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="soft-card p-4">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-txt-muted">
            Alpaca Account {props.isMock && <span className="text-amber-soft">(demo)</span>}
          </h2>
          {props.account ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-txt-secondary">Equity</dt><dd className="font-mono font-bold text-emerald-soft">{fmtMoney(props.account.equity)}</dd></div>
              <div className="flex justify-between"><dt className="text-txt-secondary">Buying Power</dt><dd className="font-mono text-txt">{fmtMoney(props.account.buyingPower)}</dd></div>
              <div className="flex justify-between"><dt className="text-txt-secondary">Cash</dt><dd className="font-mono text-txt">{fmtMoney(props.account.cash)}</dd></div>
              <div className="flex justify-between"><dt className="text-txt-secondary">Open Positions</dt><dd className="font-mono text-txt">{props.positions.length}{(() => { const unique = new Set(props.positions.map(p => p.groupId || p.id)); return unique.size < props.positions.length ? ` (${unique.size} spreads)` : ''; })()}</dd></div>
              <div className="flex justify-between text-xs"><dt className="text-txt-dim">Acct #</dt><dd className="font-mono text-txt-dim">{props.account.accountNumber} · {props.account.status}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-txt-muted">Loading account…</p>
          )}
        </div>

        <div className="soft-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Best Opportunity</h2>
            <DecisionBadge decision={decision} />
          </div>
          {best?.candidate ? (
            <div>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-lg font-bold text-txt">
                  {best.candidate.underlying} {best.candidate.longStrike}/{best.candidate.shortStrike} Bull Call Spread
                </span>
                <span className="text-sm text-txt-muted">exp {best.candidate.expiry} · {best.candidate.dte} DTE</span>
                <span className="ml-auto text-2xl font-black text-emerald-soft">{best.score.toFixed(1)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Debit" value={fmtMoney(best.candidate.debit)} />
                <Stat label="Width" value={fmtMoney(best.candidate.width)} />
                <Stat label="Max Profit" value={fmtMoney(best.candidate.maxProfit)} accent="text-emerald-soft" />
                <Stat label="Max Loss" value={fmtMoney(best.candidate.maxLoss)} accent="text-coral" />
                <Stat label="R:R" value={`${best.candidate.riskReward.toFixed(2)}:1`} />
                <Stat label="OI (L/S)" value={`${best.candidate.longLeg.openInterest}/${best.candidate.shortLeg.openInterest}`} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-xs text-txt-muted">
                  Legs: BUY {best.candidate.longLeg.symbol} @ {fmtMoney(best.candidate.longLeg.ask)} · SELL {best.candidate.shortLeg.symbol} @ {fmtMoney(best.candidate.shortLeg.bid)}
                </p>
                {decision?.action === "ENTER" && (
                  <button
                    onClick={props.onSubmit}
                    disabled={props.busy !== null}
                    className="btn-primary ml-auto px-4 py-2 text-sm disabled:opacity-40"
                  >
                    {props.busy === "submit" ? "SUBMITTING…" : `SUBMIT TRADE${decision.suggestedQty ? ` (${decision.suggestedQty}x)` : ""}`}
                  </button>
                )}
              </div>
              {decision && <p className="mt-2 text-xs text-txt-muted">{decision.reason}</p>}
            </div>
          ) : (
            <p className="text-sm text-txt-muted">{decision?.reason ?? "Run a scan to find opportunities."}</p>
          )}
        </div>
      </div>

      {/* ── Scanner table ── */}
      <div className="mb-5">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-txt-muted">
          Market Scanner — {props.scan.length ? props.scan.map((r) => r.symbol).join(" · ") : "No symbols scanned yet"}
        </h2>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-bdr">
          <table className="soft-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>20MA</th>
                <th>50MA</th>
                <th>RSI-14</th>
                <th>Momentum</th>
                <th>Trend</th>
                <th>Best Spread</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {props.scan.length === 0 ? (
                <tr><td colSpan={9} className="py-4 text-center text-txt-muted">No scan yet — press SCAN NOW.</td></tr>
              ) : (
                props.scan.map((row) => (
                  <tr key={row.symbol} className={row.indicators.trend === "bullish" ? "bg-emerald-dim/40" : ""}>
                    <td className="font-bold text-txt">{row.symbol}</td>
                    <td className="font-mono">{row.indicators.price ? fmtMoney(row.indicators.price) : "—"}</td>
                    <td className="font-mono text-txt-muted">{row.indicators.ma20 ? row.indicators.ma20.toFixed(2) : "—"}</td>
                    <td className="font-mono text-txt-muted">{row.indicators.ma50 ? row.indicators.ma50.toFixed(2) : "—"}</td>
                    <td className={`font-mono ${row.indicators.rsi !== null && row.indicators.rsi > 70 ? "text-amber-soft" : row.indicators.rsi !== null && row.indicators.rsi < 30 ? "text-coral" : ""}`}>
                      {row.indicators.rsi !== null ? row.indicators.rsi.toFixed(1) : "—"}
                    </td>
                    <td className={`font-mono ${(row.indicators.momentum ?? 0) >= 0 ? "pnl-positive" : "pnl-negative"}`}>
                      {row.indicators.momentum !== null ? fmtPct(row.indicators.momentum / 100) : "—"}
                    </td>
                    <td><TrendBadge trend={row.indicators.trend} /></td>
                    <td className="font-mono text-xs text-txt-secondary">
                      {row.candidate
                        ? `${row.candidate.longStrike}/${row.candidate.shortStrike}C ${row.candidate.expiry} · ${fmtMoney(row.candidate.debit)} DB`
                        : row.error
                          ? <span className="text-coral" title={row.error}>error</span>
                          : <span className="text-txt-dim">—</span>}
                    </td>
                    <td>{row.candidateScore !== null ? <ScoreBar score={Math.min(100, row.candidateScore)} /> : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Agent Log ── */}
      <div>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-txt-muted">Agent Activity Log</h2>
        <LogPanel log={props.log} />
      </div>

      <footer className="mt-8 border-t border-bdr pt-4 text-center text-[11px] text-txt-dim">
        Options Sniper · Alpaca Options Alpha Agents hackathon · Paper trading only — not investment advice.
      </footer>
    </main>
  );
}
