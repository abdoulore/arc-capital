import { NextResponse } from "next/server";
import { getV2BackendStatus } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getV2BackendStatus());
}
