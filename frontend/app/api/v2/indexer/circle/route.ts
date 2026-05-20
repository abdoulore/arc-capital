import { NextRequest, NextResponse } from "next/server";
import { normalizeCircleWebhook, type CircleContractEventWebhook } from "@/lib/v2-event-adapters";
import { ingestV2Events } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function HEAD(request: NextRequest) {
  if (!isAuthorizedCircleRequest(request)) {
    return new Response(null, { status: 401 });
  }

  return new Response(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCircleRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CircleContractEventWebhook | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid Circle webhook payload." }, { status: 400 });
  }

  if (body.notificationType === "webhooks.test") {
    return NextResponse.json({ status: "ready", accepted: 0, inserted: 0, skipped: 0 });
  }

  const events = normalizeCircleWebhook(body);
  if (events.length === 0) {
    return NextResponse.json({ status: "ignored", accepted: 0, inserted: 0, skipped: 0 });
  }

  return NextResponse.json(await ingestV2Events(events));
}

function isAuthorizedCircleRequest(request: NextRequest) {
  const secret = process.env.INDEXER_WEBHOOK_SECRET;
  if (!secret) return true;
  const providedSecret = request.headers.get("x-indexer-secret") ?? request.nextUrl.searchParams.get("secret");
  return providedSecret === secret;
}
