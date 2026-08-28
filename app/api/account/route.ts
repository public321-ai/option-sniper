import { NextResponse } from "next/server";
import { buildSpreadPositions, getAccountView } from "@/lib/agent";
import { getPositions, IS_MOCK } from "@/lib/alpaca";
import { mockGetPositions } from "@/lib/mock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const account = await getAccountView();
    const raw = IS_MOCK ? mockGetPositions() : await getPositions();
    const positions = await buildSpreadPositions(raw);
    return NextResponse.json({ account, positions, mock: IS_MOCK });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
