import { NextResponse } from "next/server";
import { getV2Treasury } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getV2Treasury());
}
