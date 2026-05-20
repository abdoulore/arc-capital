import { NextResponse } from "next/server";
import { getV2Deals, updateV2DealStatus, upsertV2DealMetadata } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getV2Deals());
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json(await upsertV2DealMetadata(body));
}

export async function PATCH(request: Request) {
  const body = await request.json();
  return NextResponse.json(await updateV2DealStatus(body));
}
