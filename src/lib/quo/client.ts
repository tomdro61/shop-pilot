const QUO_API_BASE = "https://api.openphone.com/v1";

export function isQuoConfigured(): boolean {
  return !!process.env.QUO_API_KEY;
}

interface SendSMSParams {
  to: string;
  body: string;
}

interface SendSMSResult {
  success: boolean;
  testMode: boolean;
  messageId?: string;
}

export async function sendSMS({ to, body }: SendSMSParams): Promise<SendSMSResult> {
  if (!isQuoConfigured()) {
    console.log("[Quo Test Mode] SMS to:", to);
    console.log("[Quo Test Mode] Body:", body);
    return { success: true, testMode: true };
  }

  const from = process.env.QUO_PHONE_NUMBER;
  if (!from) {
    throw new Error("QUO_PHONE_NUMBER is not set");
  }

  const res = await fetch(`${QUO_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.QUO_API_KEY}`,
    },
    body: JSON.stringify({
      content: body,
      from,
      to: [to],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Quo API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { success: true, testMode: false, messageId: data.id };
}
