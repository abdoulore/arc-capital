import { NextRequest, NextResponse } from "next/server";
import { getV2IndexerDebug } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.INDEXER_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-indexer-secret") ?? request.nextUrl.searchParams.get("secret");
  if (secret && providedSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getV2IndexerDebug());
}
