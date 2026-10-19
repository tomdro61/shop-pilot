import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logInboundSMS } from "@/lib/actions/messages";
import { QUO_SIGNATURE_HEADER, verifyQuoSignatureAny } from "@/lib/quo/signature";
import type { PhoneLine } from "@/lib/quo/routing";

export async function POST(request: Request) {
  // Fail closed: with no signing key configured every delivery is refused, and
  // Sentry says why, rather than accepting unsigned requests.
  const secrets = process.env.QUO_WEBHOOK_SECRET;
  if (!secrets) {
    Sentry.captureMessage("quo_webhook_secret_missing", {
      level: "error",
      tags: { source: "quo-webhook" },
    });
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const header =
    request.headers.get(QUO_SIGNATURE_HEADER) ?? request.headers.get(`x-${QUO_SIGNATURE_HEADER}`);
  if (!verifyQuoSignatureAny(rawBody, header, secrets)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
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
      const apbNumber = process.env.QUO_APB_PHONE_NUMBER;
      if (shopNumber && to === shopNumber) phoneLine = "shop";
      else if (parkingNumber && to === parkingNumber) phoneLine = "parking";
      else if (apbNumber && to === apbNumber) phoneLine = "apb";
    }

    if (from && body) {
      await logInboundSMS({ customerPhone: from, body: String(body), phoneLine });
    }
  }

  return NextResponse.json({ received: true });
}
