import { NextResponse } from "next/server";
import { buildSpreadPositions, exitSpread, logEntry } from "@/lib/agent";
import { getPositions, IS_MOCK } from "@/lib/alpaca";
import { mockGetPositions } from "@/lib/mock";
import type { AgentLogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** CLOSE POSITION: close all legs of a spread (body: { spreadId }). */
export async function POST(req: Request) {
  const log: AgentLogEntry[] = [];
  try {
    const body = (await req.json()) as { spreadId?: string };
    if (!body.spreadId) {
      return NextResponse.json({ error: "spreadId required" }, { status: 400 });
    }
    const raw = IS_MOCK ? mockGetPositions() : await getPositions();
    const spreads = await buildSpreadPositions(raw);
    const spread = spreads.find((s) => s.id === body.spreadId);
    if (!spread) {
      return NextResponse.json({ error: `Spread ${body.spreadId} not found among open positions` }, { status: 404 });
    }
    const ok = await exitSpread(spread, "Manual close from dashboard", log);
    return NextResponse.json({ success: ok, log });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), log },
      { status: 500 }
    );
  }
}
