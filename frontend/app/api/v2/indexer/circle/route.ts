import { NextRequest, NextResponse } from "next/server";
import { normalizeCircleWebhook, type CircleContractEventWebhook } from "@/lib/v2-event-adapters";
import { ingestV2Events } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.INDEXER_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-indexer-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CircleContractEventWebhook | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid Circle webhook payload." }, { status: 400 });
  }

  const events = normalizeCircleWebhook(body);
  if (events.length === 0) {
    return NextResponse.json({ status: "ignored", accepted: 0, inserted: 0, skipped: 0 });
  }

  return NextResponse.json(await ingestV2Events(events));
}
