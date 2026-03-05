import { NextResponse } from "next/server";
import { logInboundSMS } from "@/lib/actions/messages";
import type { PhoneLine } from "@/lib/quo/routing";

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
        to?: string;
        body?: string;
        content?: string;
      };
    } | undefined;

    const from = data?.object?.from;
    const to = data?.object?.to;
    const body = data?.object?.body || data?.object?.content;

    // Determine which phone line received this message
    let phoneLine: PhoneLine | undefined;
    if (to) {
      const shopNumber = process.env.QUO_SHOP_PHONE_NUMBER;
      const parkingNumber = process.env.QUO_PHONE_NUMBER;
      if (shopNumber && to === shopNumber) phoneLine = "shop";
      else if (parkingNumber && to === parkingNumber) phoneLine = "parking";
    }

    if (from && body) {
      await logInboundSMS({ customerPhone: from, body: String(body), phoneLine });
    }
  }

  return NextResponse.json({ received: true });
}
