import { NextResponse } from "next/server";
import { buildClosedTrades } from "@/lib/agent";
import { IS_MOCK } from "@/lib/alpaca";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const closed = await buildClosedTrades();
    return NextResponse.json({ closed, mock: IS_MOCK });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
