import { NextResponse } from "next/server";
import { getV2AdminActivity, logV2AdminActivity } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "live", activity: await getV2AdminActivity() });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json(await logV2AdminActivity(body));
}
