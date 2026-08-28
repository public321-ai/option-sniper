"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Decision } from "@/lib/types";

// Local mirror of the server record shape (no server-only imports in client code)
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
}: {
  decision: Decision | null;
  positionsCount: number;
  mock: boolean;
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
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const records = data?.log.records ?? [];
  const counters = data?.log.counters;
  const latest = data?.log.latest ?? null;
  const env = data?.env;

  const status = useMemo(() => {
    if (!latest) return { label: "IDLE", cls: "bg-slate-500/15 text-slate-400 border-slate-500/40" };
    if (latest.ok) return { label: "CONNECTED", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" };
    return { label: "ERROR", cls: "bg-red-500/15 text-red-400 border-red-500/40" };
  }, [latest]);

  const avgLatency = records.length
    ? records.reduce((a, r) => a + r.durationMs, 0) / records.length
    : 0;

  return (
    <section className="mb-5 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">
          📡 Alpaca Integration Monitor{" "}
          <span className="ml-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            in-memory · no database · live
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <ConnectionBadge status={status} ok={latest?.ok ?? null} />
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-black tracking-wider ${
              env?.live
                ? "border-red-500/50 bg-red-500/10 text-red-400"
                : env
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-400"
                  : ""
            }`}
          >
            {env?.live ? "⚠ LIVE" : env ? "PAPER" : "…"}
          </span>
          <span className="hidden text-[11px] text-slate-500 sm:block">{env?.baseUrl ?? "—"}</span>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-red-400">Monitor error: {error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="API latency (last)" value={latest ? `${latest.durationMs.toFixed(0)}ms` : "—"} sub={`avg ${avgLatency.toFixed(0)}ms`} />
        <MiniStat label="Last API call" value={latest ? latest.op : "—"} sub={latest ? timeStr(latest.ts) : "no calls yet"} span />
        <MiniStat label="Total API calls" value={counters ? String(counters.total) : "0"} sub={mock ? "demo data" : "Alpaca paper API"} />
        <MiniStat label="Success / Failed" value={counters ? `${counters.ok}/${counters.fail}` : "0/0"} sub="ok / fail" />
        <MiniStat label="Market-data calls" value={counters ? String(counters.market) : "0"} sub="bars & quotes" />
        <MiniStat label="Options-data calls" value={counters ? String(counters.options) : "0"} sub="snapshots / chain" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Real-time API activity timeline
            {counters
              ? ` · ${counters.account} account · ${counters.market} market · ${counters.options} options · ${counters.trading} trading`
              : ""}
          </h3>
          <TimelineTable records={records} openId={openId} setOpenId={setOpenId} />
        </div>

        <AgentPipeline
          decision={decision}
          positionsCount={positionsCount}
          accountRec={records.find((r) => r.category === "account") ?? null}
          marketRec={records.find((r) => r.category === "market") ?? null}
          optionsRec={records.find((r) => r.category === "options") ?? null}
          orderRec={records.find((r) => r.op === "POST /v2/orders") ?? null}
          positionsRec={records.find((r) => r.op === "GET /v2/positions") ?? null}
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
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${status.cls}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          ok === null ? "bg-slate-500" : ok ? "animate-pulse bg-emerald-400" : "bg-red-400"
        }`}
      />
      {status.label}
    </span>
  );
}

function MiniStat({ label, value, sub, span }: { label: string; value: string; sub: string; span?: boolean }) {
  return (
    <div className={`rounded-lg bg-slate-800/50 px-2.5 py-2 ${span ? "col-span-2 sm:col-span-1" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="truncate font-mono text-sm font-semibold text-slate-200" title={value}>{value}</p>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}

const CAT_COLORS: Record<string, string> = {
  account: "bg-slate-500/15 text-slate-300",
  market: "bg-sky-500/15 text-sky-300",
  options: "bg-violet-500/15 text-violet-300",
  trading: "bg-emerald-500/15 text-emerald-300",
};

function TimelineTable({
  records,
  openId,
  setOpenId,
}: {
  records: ApiRec[];
  openId: number | null;
  setOpenId: (id: number | null) => void;
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 p-3 text-xs text-slate-500">
        No Alpaca calls yet — press SCAN NOW or START AGENT to see live API activity. 🔴 No secrets
        are ever shown: only endpoints, status, latency and sanitized response bodies.
      </div>
    );
  }
  return (
    <div className="log-scroll max-h-80 overflow-y-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-2 py-1.5">Time</th>
            <th className="px-2 py-1.5">Operation</th>
            <th className="px-2 py-1.5">Category</th>
            <th className="px-2 py-1.5">Status</th>
            <th className="px-2 py-1.5">Latency</th>
            <th className="px-2 py-1.5 text-right">Response</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {records.map((r) => {
            const rowOpen = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="align-top hover:bg-slate-800/30">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-slate-500">{timeStr(r.ts)}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-slate-200">{r.op}</span>
                    <span className="block text-[10px] text-slate-500">
                      {r.method} {r.path}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CAT_COLORS[r.category] ?? "bg-slate-500/15 text-slate-300"}`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className={`font-semibold ${r.ok ? "text-emerald-400" : "text-red-400"}`}>
                      {r.ok ? "SUCCESS" : "FAIL"}
                    </span>
                    {r.status ? <span className="ml-1 font-mono text-[10px] text-slate-500">[{r.status}]</span> : null}
                    {r.error && <span className="block max-w-[180px] truncate text-[10px] text-red-400" title={r.error}>{r.error}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-slate-400">{r.durationMs.toFixed(0)}ms</td>
                  <td className="px-2 py-1.5 text-right">
                    {r.responseSnippet ? (
                      <button
                        onClick={() => setOpenId(rowOpen ? null : r.id)}
                        className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-700"
                      >
                        {rowOpen ? "HIDE" : "VIEW"} RESPONSE
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-600">—</span>
                    )}
                  </td>
                </tr>
                {rowOpen && r.responseSnippet && (
                  <tr key={`${r.id}-resp`}>
                    <td colSpan={6} className="bg-slate-950/40 px-3 py-2">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
                        Latest Alpaca response · {r.op} · {timeStr(r.ts)}
                      </p>
                      <pre className="max-h-64 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[10px] leading-relaxed text-emerald-200/90 whitespace-pre-wrap">
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
  decision,
  positionsCount,
  accountRec,
  marketRec,
  optionsRec,
  orderRec,
  positionsRec,
}: {
  decision: Decision | null;
  positionsCount: number;
  accountRec: ApiRec | null;
  marketRec: ApiRec | null;
  optionsRec: ApiRec | null;
  orderRec: ApiRec | null;
  positionsRec: ApiRec | null;
}) {
  const steps = [
    {
      label: "AGENT reads account",
      detail: accountRec ? `${accountRec.op} · ${accountRec.durationMs.toFixed(0)}ms` : "waiting…",
      state: accountRec ? (accountRec.ok ? "ok" : "fail") : "idle",
    },
    {
      label: "ALPACA market data",
      detail: marketRec ? `${marketRec.op.replace("GET ", "")} · ${marketRec.durationMs.toFixed(0)}ms` : "waiting…",
      state: marketRec ? (marketRec.ok ? "ok" : "fail") : "idle",
    },
    {
      label: "ALPACA options chain",
      detail: optionsRec ? `${optionsRec.op.replace("GET ", "")} · ${optionsRec.durationMs.toFixed(0)}ms` : "waiting…",
      state: optionsRec ? (optionsRec.ok ? "ok" : "fail") : "idle",
    },
    {
      label: "AGENT decision",
      detail: decision ? `${decision.action}${decision.score !== undefined ? ` · score ${decision.score}` : ""} — ${decision.reason}` : "run a scan…",
      state: decision ? (decision.action === "ENTER" ? "ok" : decision.action === "EXIT" ? "fail" : "warn") : "idle",
    },
    {
      label: "ALPACA paper order",
      detail: orderRec
        ? `${orderRec.op} · ${orderRec.ok ? "SUCCESS" : "FAIL"} · ${orderRec.durationMs.toFixed(0)}ms`
        : decision?.action === "ENTER"
          ? "submitting…"
          : "awaiting ENTER signal",
      state: orderRec ? (orderRec.ok ? "ok" : "fail") : "idle",
    },
    {
      label: "ALPACA monitor positions",
      detail: positionsRec
        ? `${positionsRec.op} · ${positionsCount} open spread(s) · ${positionsRec.durationMs.toFixed(0)}ms`
        : "waiting…",
      state: positionsRec ? (positionsRec.ok ? "ok" : "fail") : "idle",
    },
  ];
  return (
    <div className="rounded-lg border border-slate-800 p-3">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Agent → Alpaca → Decision → Order
      </h3>
      <ol className="relative space-y-3 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-slate-700">
        {steps.map((s, i) => (
          <li key={i} className="relative pl-7">
            <span
              className={`absolute left-0 top-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border text-[10px] font-bold ${
                s.state === "ok"
                  ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-400"
                  : s.state === "fail"
                    ? "border-red-500/60 bg-red-500/20 text-red-400"
                    : s.state === "warn"
                      ? "border-amber-500/60 bg-amber-500/20 text-amber-400"
                      : "border-slate-600 bg-slate-800 text-slate-500"
              }`}
            >
              {s.state === "ok" ? "✓" : s.state === "fail" ? "✕" : i + 1}
            </span>
            <p className="text-xs font-semibold text-slate-200">{s.label}</p>
            <p className="truncate text-[10px] text-slate-500" title={s.detail}>{s.detail}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
        🔒 No API keys or secrets are ever sent to the browser — all Alpaca calls stay server-side.
      </p>
    </div>
  );
}
