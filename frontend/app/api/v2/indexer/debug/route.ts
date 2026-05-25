import { NextRequest, NextResponse } from "next/server";
import { getV2IndexerDebug, repairV2MonthlyShareDecimals, reprojectV2StoredEvents } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.INDEXER_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-indexer-secret") ?? request.nextUrl.searchParams.get("secret");
  if (secret && providedSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getV2IndexerDebug());
}

export async function POST(request: NextRequest) {
  const secret = process.env.INDEXER_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-indexer-secret") ?? request.nextUrl.searchParams.get("secret");
  if (secret && providedSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "repair-monthly-shares") {
    if (body?.action === "reproject-events") {
      return NextResponse.json(await reprojectV2StoredEvents());
    }
    return NextResponse.json({ error: "Unsupported debug action." }, { status: 400 });
  }

  return NextResponse.json(await repairV2MonthlyShareDecimals());
}
