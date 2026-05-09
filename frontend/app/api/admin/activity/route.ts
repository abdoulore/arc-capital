import { NextResponse } from "next/server";
import { addActivity, getActivity } from "@/lib/admin-store";

export async function GET() {
  return NextResponse.json(await getActivity());
}

export async function POST(request: Request) {
  const body = await request.json();
  const entry = await addActivity({
    operator: body.operator,
    action: body.action ?? "Admin action",
    summary: body.summary ?? "",
    hash: body.hash,
  });
  return NextResponse.json(entry);
}
