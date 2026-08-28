import { NextResponse } from "next/server";
import { runAgentTick } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** SCAN NOW: full pipeline but never auto-enters or auto-exits. */
export async function POST() {
  try {
    const result = await runAgentTick({ autoEnter: false, autoExit: false });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
