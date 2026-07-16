import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { nowET } from "@/lib/utils";
import { toE164 } from "@/lib/quo/format";
import { sendSMS, isQuoConfigured } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { requireCronSecret } from "@/lib/cron/auth";
import { parkingPrepReminderInternalSMS } from "@/lib/messaging/templates";
import { findUnpreppedCarsForTonight } from "@/lib/parking/prep-reminder";

/**
 * 7 PM nightly check: text the owners if any Broadway Motors car is due for
 * pickup while the shop is closed (5 PM–9 AM) but isn't staged in a lockbox
 * with the code sent. Stays silent when everything's handled.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`, auto-injected by Vercel — same
 * as /api/cron/health.
 *
 * Timezone: Vercel cron fires in UTC. vercel.json registers TWO entries (23:00
 * & 00:00 UTC) that straddle 7 PM ET across DST; this handler re-anchors to
 * Eastern and only does work when it's actually 7 PM there, so exactly one of
 * the two firings runs and the other early-returns.
 */
const SENTRY_SOURCE = "cron-parking-prep-reminder";
const SEND_HOUR_ET = 19; // 7 PM Eastern

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const etHour = nowET().getHours();
  if (etHour !== SEND_HOUR_ET) {
    return NextResponse.json({ ok: true, skipped: "not-7pm-et", etHour });
  }

  const result = await findUnpreppedCarsForTonight();
  if (!result.ok) {
    // Never collapse a query failure into a silent "all clear" — that's the
    // exact failure this reminder exists to prevent. Fail loud.
    Sentry.captureException(new Error(result.error), {
      tags: { source: SENTRY_SOURCE },
    });
    return NextResponse.json({ ok: false, error: "query-failed" }, { status: 500 });
  }

  const { cars } = result;
  if (cars.length === 0) {
    return NextResponse.json({ ok: true, flagged: 0 });
  }

  // We have cars to flag, so a text MUST go out. If Quo isn't configured,
  // sendSMS would return test-mode success without sending — a false all-clear,
  // the exact failure this reminder guards against. Fail loud instead.
  if (!isQuoConfigured()) {
    Sentry.captureException(
      new Error("QUO_API_KEY not set — parking prep reminder could not send"),
      { tags: { source: SENTRY_SOURCE }, extra: { flagged: cars.length } }
    );
    return NextResponse.json(
      { ok: false, error: "sms-not-configured", flagged: cars.length },
      { status: 500 }
    );
  }

  const raw = process.env.INTERNAL_NOTIFICATION_PHONES;
  const configured = raw
    ? raw.split(",").map((p) => p.trim()).filter(Boolean)
    : [];
  const recipients = configured
    .map((p) => toE164(p))
    .filter((p): p is string => p != null);

  // A configured number that won't parse is silently dropped by toE164 — for an
  // alert whose job is to reach the right people, surface the partial drop.
  if (recipients.length < configured.length) {
    Sentry.captureMessage("parking_prep_reminder_unparseable_recipient", {
      level: "warning",
      tags: { source: SENTRY_SOURCE },
      extra: { configured: configured.length, resolved: recipients.length },
    });
  }

  if (recipients.length === 0) {
    // We have cars to flag but nowhere to send. Surface it so an unset/empty
    // env var is visible instead of silently reaching no one.
    Sentry.captureMessage("parking_prep_reminder_no_recipients", {
      level: "warning",
      tags: { source: SENTRY_SOURCE },
      extra: { flagged: cars.length },
    });
    return NextResponse.json({ ok: true, flagged: cars.length, notified: 0 });
  }

  let from: string;
  try {
    from = getPhoneNumber("shop");
  } catch (err) {
    Sentry.captureException(err, { tags: { source: SENTRY_SOURCE } });
    return NextResponse.json({ ok: false, error: "shop-line-unset" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const body = parkingPrepReminderInternalSMS(
    cars,
    appUrl ? `${appUrl}/parking` : undefined
  );

  let smsErrors = 0;
  await Promise.all(
    recipients.map((to) =>
      sendSMS({ to, body, from }).catch((err) => {
        smsErrors++;
        console.error(
          `[parking-prep-reminder] alert to ${to} failed:`,
          err instanceof Error ? err.message : err
        );
        Sentry.captureException(err, {
          level: "warning",
          tags: { source: SENTRY_SOURCE, path: "internal-notify-fanout" },
          extra: { to },
        });
      })
    )
  );

  return NextResponse.json({
    ok: true,
    flagged: cars.length,
    notified: recipients.length - smsErrors,
    smsErrors,
  });
}
