import { NextResponse } from "next/server";
import { getSettings, setSettings } from "@/lib/admin-store";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(request: Request) {
  const body = await request.json();
  return NextResponse.json(await setSettings(body));
}
