// In-memory, server-side monitor of every Alpaca API call.
// No database: kept in module memory only (resets on cold start).
// NEVER stores API keys/secrets — only endpoints, status, latency and a
// truncated, sanitized response body.
import "server-only";

export type ApiCategory = "account" | "market" | "options" | "trading";

export interface ApiCallRecord {
  id: number;
  ts: number;
  op: string; // e.g. "GET /v2/account", "GET market bars", "POST /v2/orders"
  category: ApiCategory;
  method: string;
  path: string;
  status: number | null; // null when the request never reached Alpaca
  ok: boolean;
  durationMs: number;
  responseSnippet: string | null; // formatted JSON, truncated
  error: string | null;
  mock: boolean;
}

const MAX_RECORDS = 250;
const MAX_SNIPPET_CHARS = 700;

const records: ApiCallRecord[] = [];
let nextId = 1;

const counters = {
  total: 0,
  ok: 0,
  fail: 0,
  account: 0,
  market: 0,
  options: 0,
  trading: 0,
};

export function recordApiCall(rec: {
  op: string;
  category: ApiCategory;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  responseSnippet?: string | null;
  error?: string | null;
  mock?: boolean;
}): void {
  counters.total += 1;
  if (rec.ok) counters.ok += 1;
  else counters.fail += 1;
  counters[rec.category] += 1;
  records.push({
    id: nextId++,
    ts: Date.now(),
    op: rec.op,
    category: rec.category,
    method: rec.method,
    path: rec.path,
    status: rec.status,
    ok: rec.ok,
    durationMs: rec.durationMs,
    responseSnippet: rec.responseSnippet ?? null,
    error: rec.error ?? null,
    mock: rec.mock ?? false,
  });
  if (records.length > MAX_RECORDS) records.shift();
}

export interface ApiLogSnapshot {
  records: ApiCallRecord[];
  counters: {
    total: number;
    ok: number;
    fail: number;
    account: number;
    market: number;
    options: number;
    trading: number;
  };
  latest: ApiCallRecord | null;
}

export function getApiLog(): ApiLogSnapshot {
  return {
    records: [...records].reverse(), // newest first
    counters: { ...counters },
    latest: records.length ? records[records.length - 1] : null,
  };
}

/** Pretty-print + truncate a response body for safe display. */
export function makeSnippet(text: string): string | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2).slice(0, MAX_SNIPPET_CHARS);
  } catch {
    return text.slice(0, MAX_SNIPPET_CHARS);
  }
}