import { NextResponse } from "next/server";
import { runAgentTick } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One autonomous agent tick: scan -> analyze -> score -> risk check ->
 * auto paper-trade if approved -> monitor positions -> auto exit.
 */
export async function POST(req: Request) {
  try {
    let body: { autoEnter?: boolean } = {};
    try {
      body = (await req.json()) as { autoEnter?: boolean };
    } catch {
      /* empty body is fine */
    }
    const result = await runAgentTick({ autoEnter: body.autoEnter !== false, autoExit: true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
