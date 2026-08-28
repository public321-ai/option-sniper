import { NextResponse } from "next/server";
import { buildSpreadPositions, evaluateAndEnter, getAccountView, logEntry } from "@/lib/agent";
import { getPositions, IS_MOCK } from "@/lib/alpaca";
import { mockGetPositions } from "@/lib/mock";
import type { AgentLogEntry, Decision, SpreadCandidate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Submit an approved trade (the dashboard's ENTER action) to Alpaca paper trading. */
export async function POST(req: Request) {
  const log: AgentLogEntry[] = [];
  try {
    const body = (await req.json()) as { candidate?: SpreadCandidate };
    const cand = body.candidate;
    if (!cand?.underlying || !cand.longLeg?.symbol || !cand.shortLeg?.symbol) {
      return NextResponse.json({ error: "candidate with longLeg/shortLeg symbols required" }, { status: 400 });
    }

    const account = await getAccountView();
    const raw = IS_MOCK ? mockGetPositions() : await getPositions();
    const existing = await buildSpreadPositions(raw);

    const fakeBest = {
      candidate: cand,
      score: 100,
      breakdown: { trend: 0, rsi: 0, momentum: 0, liquidity: 0, riskReward: 0 },
    };
    const decision: Decision = await evaluateAndEnter(fakeBest, account, existing, true, log);
    logEntry("info", `Manual submit for ${cand.underlying} spread: ${decision.reason}`, log);
    return NextResponse.json({ decision, log });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), log },
      { status: 500 }
    );
  }
}

