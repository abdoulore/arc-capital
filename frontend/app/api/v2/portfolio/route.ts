import { NextRequest, NextResponse } from "next/server";
import { getV2Portfolio } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? request.nextUrl.searchParams.get("address");
  return NextResponse.json(await getV2Portfolio(wallet));
}
