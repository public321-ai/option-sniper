"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Decision, MarketDiscovery, NewsRiskAssessment, OptionsIntelligence } from "@/lib/types";

interface ApiRec {
  id: number;
  ts: number;
  op: string;
  category: string;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  responseSnippet: string | null;
  error: string | null;
  mock: boolean;
}

interface MonitorData {
  log: {
    records: ApiRec[];
    counters: {
      total: number;
      ok: number;
      fail: number;
      account: number;
      market: number;
      options: number;
      trading: number;
    };
    latest: ApiRec | null;
  };
  env: { mock: boolean; live: boolean; label: string; baseUrl: string };
  updatedAt: number;
}

const POLL_MS = 5000;

export default function AlpacaMonitor({
  decision,
  positionsCount,
  mock,
  discovery,
  intelligence,
  newsRisk,
}: {
  decision: Decision | null;
  positionsCount: number;
  mock: boolean;
  discovery: MarketDiscovery | null;
  intelligence: OptionsIntelligence | null;
  newsRisk: NewsRiskAssessment | null;
}) {
  const [data, setData] = useState<MonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/alpaca/monitor", { cache: "no-store" });
        const d = (await res.json()) as MonitorData;
        if (!cancelled) { setData(d); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const records = data?.log.records ?? [];
  const counters = data?.log.counters;
  const latest = data?.log.latest ?? null;
  const env = data?.env;

  const status = useMemo(() => {
    if (!latest) return { label: "IDLE", cls: "bg-charcoal text-txt-muted border-bdr" };
    if (latest.ok) return { label: "CONNECTED", cls: "bg-emerald-dim text-emerald-soft border-bdr-accent" };
    return { label: "ERROR", cls: "bg-coral-dim text-coral border-bdr-accent" };
  }, [latest]);

  const avgLatency = records.length ? records.reduce((a, r) => a + r.durationMs, 0) / records.length : 0;
  const moversCalls = records.filter((r) => r.op.includes("movers") || r.op.includes("gainers") || r.op.includes("losers") || r.op.includes("active")).length;
  const newsCalls = records.filter((r) => r.op.includes("news")).length;
  const corpActionsCalls = records.filter((r) => r.op.includes("corporate actions")).length;

  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const marketClosed = dayOfWeek === 0 || dayOfWeek === 6;

  return (
    <section className="mb-5 soft-card p-4">
      {marketClosed && (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-inner)] border border-amber-soft/30 bg-[rgba(210,153,34,0.08)] px-3 py-2 text-xs text-amber-soft">
          <span className="text-base">⏸</span>
          <span>
            <strong>Market closed</strong> — {dayOfWeek === 0 ? "Sunday" : "Saturday"}: Movers/screener APIs return empty data. Scans fall back to the default watchlist.
          </span>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-txt-secondary">
          Alpaca Integration Monitor{" "}
          <span className="ml-1 rounded-[var(--radius-badge)] bg-charcoal px-2 py-0.5 text-[10px] font-medium text-txt-dim">
            in-memory · live
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <ConnectionBadge status={status} ok={latest?.ok ?? null} />
          <span
            className={`inline-flex items-center rounded-[var(--radius-badge)] border px-2.5 py-1 text-[11px] font-bold tracking-wider ${
              env?.live
                ? "border-coral/40 bg-coral-dim text-coral"
                : env
                  ? "border-cyan-muted/30 bg-[rgba(57,210,192,0.08)] text-cyan-soft"
                  : ""
            }`}
          >
            {env?.live ? "⚠ LIVE" : env ? "PAPER" : "…"}
          </span>
          <span className="hidden text-[11px] text-txt-dim sm:block">{env?.baseUrl ?? "—"}</span>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-coral">Monitor error: {error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="API latency (last)" value={latest ? `${latest.durationMs.toFixed(0)}ms` : "—"} sub={`avg ${avgLatency.toFixed(0)}ms`} />
        <MiniStat label="Last API call" value={latest ? latest.op : "—"} sub={latest ? timeStr(latest.ts) : "no calls yet"} span />
        <MiniStat label="Total API calls" value={counters ? String(counters.total) : "0"} sub={mock ? "demo data" : "Alpaca paper API"} />
        <MiniStat label="Success / Failed" value={counters ? `${counters.ok}/${counters.fail}` : "0/0"} sub="ok / fail" />
        <MiniStat label="Market-data calls" value={counters ? String(counters.market) : "0"} sub={`${moversCalls} movers · ${newsCalls} news · ${corpActionsCalls} CA`} />
        <MiniStat label="Options-data calls" value={counters ? String(counters.options) : "0"} sub="snapshots / chain" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-txt-dim">
            Real-time API activity timeline
            {counters ? ` · ${counters.account} account · ${counters.market} market · ${counters.options} options · ${counters.trading} trading` : ""}
          </h3>
          <TimelineTable records={records} openId={openId} setOpenId={setOpenId} />
        </div>

        <AgentPipeline
          decision={decision} positionsCount={positionsCount} discovery={discovery}
          intelligence={intelligence} newsRisk={newsRisk}
          accountRec={[...records].reverse().find((r) => r.category === "account") ?? null}
          marketRec={[...records].reverse().find((r) => r.category === "market") ?? null}
          optionsRec={[...records].reverse().find((r) => r.category === "options") ?? null}
          orderRec={[...records].reverse().find((r) => r.op === "POST /v2/orders") ?? null}
          positionsRec={[...records].reverse().find((r) => r.op === "GET /v2/positions") ?? null}
          moversRec={[...records].reverse().find((r) => r.op.includes("movers") || r.op.includes("gainers")) ?? null}
          newsRec={[...records].reverse().find((r) => r.op.includes("news") && !r.op.includes("movers")) ?? null}
          corpActionsRec={[...records].reverse().find((r) => r.op.includes("corporate actions")) ?? null}
        />
      </div>
    </section>
  );
}

function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

function ConnectionBadge({ status, ok }: { status: { label: string; cls: string }; ok: boolean | null }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[var(--radius-badge)] border px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>
      <span className={`h-2 w-2 rounded-full ${ok === null ? "bg-txt-dim" : ok ? "pulse-soft bg-emerald-soft" : "bg-coral"}`} />
      {status.label}
    </span>
  );
}

function MiniStat({ label, value, sub, span }: { label: string; value: string; sub: string; span?: boolean }) {
  return (
    <div className={`soft-stat ${span ? "col-span-2 sm:col-span-1" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-txt-dim">{label}</p>
      <p className="truncate font-mono text-sm font-semibold text-txt" title={value}>{value}</p>
      <p className="text-[10px] text-txt-dim">{sub}</p>
    </div>
  );
}

const CAT_COLORS: Record<string, string> = {
  account: "bg-charcoal text-txt-secondary",
  market: "bg-[rgba(57,210,192,0.1)] text-cyan-soft",
  options: "bg-[rgba(139,92,246,0.1)] text-[#a78bfa]",
  trading: "bg-emerald-dim text-emerald-soft",
};

function TimelineTable({ records, openId, setOpenId }: { records: ApiRec[]; openId: number | null; setOpenId: (id: number | null) => void }) {
  if (records.length === 0) {
    return (
      <div className="soft-card-inner p-3 text-xs text-txt-muted">
        No Alpaca calls yet — press SCAN NOW or START AGENT to see live API activity. 🔒 No secrets are ever shown.
      </div>
    );
  }
  return (
    <div className="log-scroll max-h-80 overflow-y-auto rounded-[var(--radius-inner)] border border-bdr">
      <table className="soft-table text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th>Time</th>
            <th>Operation</th>
            <th>Category</th>
            <th>Status</th>
            <th>Latency</th>
            <th className="text-right">Response</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const rowOpen = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="align-top hover:bg-raised/40">
                  <td className="whitespace-nowrap font-mono text-txt-dim">{timeStr(r.ts)}</td>
                  <td>
                    <span className="font-mono text-txt">{r.op}</span>
                    <span className="block text-[10px] text-txt-dim">{r.method} {r.path}</span>
                  </td>
                  <td>
                    <span className={`rounded-[var(--radius-badge)] px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CAT_COLORS[r.category] ?? "bg-charcoal text-txt-secondary"}`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={`font-semibold ${r.ok ? "text-emerald-soft" : "text-coral"}`}>
                      {r.ok ? "OK" : "FAIL"}
                    </span>
                    {r.status ? <span className="ml-1 font-mono text-[10px] text-txt-dim">[{r.status}]</span> : null}
                    {r.error && <span className="block max-w-[180px] truncate text-[10px] text-coral" title={r.error}>{r.error}</span>}
                  </td>
                  <td className="whitespace-nowrap font-mono text-txt-muted">{r.durationMs.toFixed(0)}ms</td>
                  <td className="text-right">
                    {r.responseSnippet ? (
                      <button
                        onClick={() => setOpenId(rowOpen ? null : r.id)}
                        className="btn-ghost px-1.5 py-0.5 text-[10px]"
                      >
                        {rowOpen ? "HIDE" : "VIEW"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-txt-dim">—</span>
                    )}
                  </td>
                </tr>
                {rowOpen && r.responseSnippet && (
                  <tr key={`${r.id}-resp`}>
                    <td colSpan={6} className="bg-obsidian/60 px-3 py-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-txt-dim">
                        Response · {r.op} · {timeStr(r.ts)}
                      </p>
                      <pre className="max-h-64 overflow-auto rounded-[var(--radius-inner)] border border-bdr bg-obsidian p-2 font-mono text-[10px] leading-relaxed text-emerald-soft/80 whitespace-pre-wrap">
                        {r.responseSnippet}
                        {r.responseSnippet.length >= 700 ? "\n… (truncated)" : ""}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgentPipeline({
  decision, positionsCount, discovery, intelligence, newsRisk,
  accountRec, marketRec, optionsRec, orderRec, positionsRec, moversRec, newsRec, corpActionsRec,
}: {
  decision: Decision | null; positionsCount: number;
  discovery: MarketDiscovery | null; intelligence: OptionsIntelligence | null; newsRisk: NewsRiskAssessment | null;
  accountRec: ApiRec | null; marketRec: ApiRec | null; optionsRec: ApiRec | null;
  orderRec: ApiRec | null; positionsRec: ApiRec | null; moversRec: ApiRec | null; newsRec: ApiRec | null; corpActionsRec: ApiRec | null;
}) {
  const scanComplete = decision !== null;
  const noBullishCandidate = scanComplete && !intelligence && !newsRisk;

  const steps = [
    { label: "AGENT reads account", detail: accountRec ? `${accountRec.op} · ${accountRec.durationMs.toFixed(0)}ms` : scanComplete ? "completed" : "waiting…", state: accountRec ? (accountRec.ok ? "ok" : "fail") : (scanComplete ? "ok" : "idle") },
    { label: "ALPACA market discovery", detail: moversRec ? `${moversRec.op} · ${moversRec.durationMs.toFixed(0)}ms` + (discovery ? ` · ${discovery.qualifiedSymbols.length} qualified` : "") : discovery ? `${discovery.qualifiedSymbols.length} qualified` : noBullishCandidate ? "no movers data" : "waiting…", state: moversRec ? (moversRec.ok ? "ok" : "fail") : (discovery ? "ok" : (noBullishCandidate ? "warn" : "idle")) },
    { label: "ALPACA news & corp actions", detail: newsRec || corpActionsRec ? [newsRec && `news ${newsRec.durationMs.toFixed(0)}ms`, corpActionsRec && `CA ${corpActionsRec.durationMs.toFixed(0)}ms`].filter(Boolean).join(" · ") + (newsRisk ? ` · ${newsRisk.sentiment}` : "") : newsRisk ? `sentiment ${newsRisk.sentiment}` : noBullishCandidate ? "skipped" : "waiting…", state: (newsRec || corpActionsRec) ? ((newsRec?.ok ?? true) && (corpActionsRec?.ok ?? true) ? "ok" : "fail") : (newsRisk ? "ok" : (noBullishCandidate ? "warn" : "idle")) },
    { label: "ALPACA options chain", detail: optionsRec ? `${optionsRec.op.replace("GET ", "")} · ${optionsRec.durationMs.toFixed(0)}ms` + (intelligence ? ` · Q:${intelligence.optionsQuality}` : "") : intelligence ? `Q:${intelligence.optionsQuality}` : noBullishCandidate ? "skipped" : "waiting…", state: optionsRec ? (optionsRec.ok ? "ok" : "fail") : (intelligence ? "ok" : (noBullishCandidate ? "warn" : "idle")) },
    { label: "AGENT decision", detail: decision ? `${decision.action}${decision.score !== undefined ? ` · score ${decision.score}` : ""} — ${decision.reason}` : "run a scan…", state: decision ? (decision.action === "ENTER" ? "ok" : decision.action === "EXIT" ? "fail" : "warn") : "idle" },
    { label: "ALPACA paper order", detail: orderRec ? `${orderRec.op} · ${orderRec.ok ? "OK" : "FAIL"} · ${orderRec.durationMs.toFixed(0)}ms` : decision?.action === "ENTER" ? "submitting…" : noBullishCandidate ? "skipped" : "awaiting ENTER signal", state: orderRec ? (orderRec.ok ? "ok" : "fail") : (noBullishCandidate ? "warn" : "idle") },
    { label: "ALPACA monitor positions", detail: positionsRec ? `${positionsRec.op} · ${positionsCount} position(s) · ${positionsRec.durationMs.toFixed(0)}ms` : scanComplete ? `${positionsCount} position(s)` : "waiting…", state: positionsRec ? (positionsRec.ok ? "ok" : "fail") : (scanComplete ? "ok" : "idle") },
  ];

  return (
    <div className="soft-card-inner p-3">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-txt-dim">
        Agent → Alpaca → Decision → Order
      </h3>
      <ol className="relative space-y-3 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-bdr-accent">
        {steps.map((s, i) => (
          <li key={i} className="relative pl-7">
            <span
              className={`absolute left-0 top-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border text-[10px] font-bold ${
                s.state === "ok"
                  ? "border-emerald-soft/40 bg-emerald-dim text-emerald-soft"
                  : s.state === "fail"
                    ? "border-coral/40 bg-coral-dim text-coral"
                    : s.state === "warn"
                      ? "border-amber-soft/40 bg-[rgba(210,153,34,0.12)] text-amber-soft"
                      : "border-bdr bg-charcoal text-txt-dim"
              }`}
            >
              {s.state === "ok" ? "✓" : s.state === "fail" ? "✕" : i + 1}
            </span>
            <p className="text-xs font-semibold text-txt">{s.label}</p>
            <p className="truncate text-[10px] text-txt-dim" title={s.detail}>{s.detail}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-bdr pt-2 text-[10px] text-txt-dim">
        🔒 No API keys or secrets are ever sent to the browser.
      </p>
    </div>
  );
}
