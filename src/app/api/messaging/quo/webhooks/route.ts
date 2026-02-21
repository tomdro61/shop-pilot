import { NextResponse } from "next/server";
import { logInboundSMS } from "@/lib/actions/messages";

export async function POST(request: Request) {
  // Verify webhook secret if configured
  const webhookSecret = process.env.QUO_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = request.headers.get("x-openphone-signature");
    if (signature !== webhookSecret) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.type as string | undefined;

  if (eventType === "message.received") {
    const data = payload.data as {
      object?: {
        from?: string;
        body?: string;
        content?: string;
      };
    } | undefined;

    const from = data?.object?.from;
    const body = data?.object?.body || data?.object?.content;

    if (from && body) {
      await logInboundSMS({ customerPhone: from, body: String(body) });
    }
  }

  return NextResponse.json({ received: true });
}
