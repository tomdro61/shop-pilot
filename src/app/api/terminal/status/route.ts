import { NextRequest, NextResponse } from "next/server";
import { getPaymentIntentStatus } from "@/lib/stripe/terminal";

export async function GET(request: NextRequest) {
  const pi = request.nextUrl.searchParams.get("pi");

  if (!pi) {
    return NextResponse.json(
      { error: "pi query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const status = await getPaymentIntentStatus(pi);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
