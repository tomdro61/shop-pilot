import * as Sentry from "@sentry/nextjs";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";

// Texts every number in INTERNAL_NOTIFICATION_PHONES from the shop line. These
// alerts need a human, so a send failure is reported at error level.
export async function notifyOwners(body: string, source: string): Promise<number> {
  let sent = 0;
  try {
    const raw = process.env.INTERNAL_NOTIFICATION_PHONES;
    const phones = (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    const from = getPhoneNumber("shop");
    await Promise.all(
      phones.map(async (phone) => {
        try {
          await sendSMS({ to: phone, body, from });
          sent++;
        } catch (err) {
          Sentry.captureException(err, {
            level: "error",
            tags: { source, path: "notify-owners" },
            extra: { phone, body },
          });
        }
      })
    );
  } catch (err) {
    // Missing shop line config. The alert is still the point, so it must not
    // take the caller (a webhook, a payment route) down with it.
    Sentry.captureException(err, {
      level: "error",
      tags: { source, path: "notify-owners-config" },
      extra: { body },
    });
  }
  if (sent === 0) {
    Sentry.captureMessage("owner_alert_reached_nobody", {
      level: "error",
      tags: { source, path: "notify-owners" },
      extra: { body },
    });
  }
  return sent;
}
