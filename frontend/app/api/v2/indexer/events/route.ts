import { NextRequest, NextResponse } from "next/server";
import { ingestV2Events, type V2IndexedEventInput } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

type EventRequestBody = {
  events?: V2IndexedEventInput[];
};

export async function POST(request: NextRequest) {
  const secret = process.env.INDEXER_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-indexer-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as EventRequestBody | null;
  const events = Array.isArray(body?.events) ? body.events : [];
  const validationError = validateEvents(events);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  return NextResponse.json(await ingestV2Events(events));
}

function validateEvents(events: V2IndexedEventInput[]) {
  if (events.length === 0) return "No events supplied.";
  if (events.length > 250) return "Batch size exceeds 250 events.";

  for (const event of events) {
    if (!isAddressLike(event.contractAddress)) return "Invalid contract address.";
    if (!event.eventName) return "Missing event name.";
    if (!/^0x[a-fA-F0-9]{64}$/.test(event.txHash)) return "Invalid transaction hash.";
    if (!Number.isInteger(event.logIndex) || event.logIndex < 0) return "Invalid log index.";
    if (event.blockNumber === undefined || event.blockNumber === null) return "Missing block number.";
  }

  return undefined;
}

function isAddressLike(value?: string) {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}
