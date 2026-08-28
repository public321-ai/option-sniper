import { NextResponse } from "next/server";
import { getApiLog } from "@/lib/apiMonitor";
import { IS_MOCK } from "@/lib/alpaca";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Alpaca Integration Monitor: live API activity log (in-memory, no DB). */
export async function GET() {
  const base = process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  const isLive = !base.includes("paper-api");
  let host = "";
  try {
    host = new URL(base).host;
  } catch {
    host = base;
  }
  return NextResponse.json({
    log: getApiLog(),
    env: {
      mock: IS_MOCK,
      live: isLive,
      label: isLive ? "LIVE (blocked by app guard)" : "PAPER",
      baseUrl: host,
    },
    updatedAt: Date.now(),
  });
}