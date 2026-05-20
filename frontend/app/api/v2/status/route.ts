import { NextResponse } from "next/server";
import { getV2Health } from "@/lib/v2-health";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getV2Health());
}
