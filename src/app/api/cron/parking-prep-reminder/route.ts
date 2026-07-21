import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { toE164 } from "@/lib/quo/format";
import { sendSMS, isQuoConfigured } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { requireCronSecret } from "@/lib/cron/auth";
import { parkingPrepReminderInternalSMS } from "@/lib/messaging/templates";
import { findUnpreppedCarsForTonight } from "@/lib/parking/prep-reminder";

/**
 * Nightly check: text the owners if any Broadway Motors car is due for pickup
 * while the shop is closed (5 PM–9 AM) but isn't staged in a lockbox with the
 * code sent. Stays silent when everything's handled.
 *
 * Auth: the shared CRON_SECRET check in `requireCronSecret` — see
 * src/lib/cron/auth.ts for why it must fail closed on an unset secret.
 *
 * Schedule: a single vercel.json entry at 23:00 UTC — 7 PM ET in summer (EDT),
 * 6 PM ET in winter (EST). Vercel cron is UTC-only, so a fixed time drifts an
 * hour across DST; a 6 PM winter run is still after close, so we accept the
 * drift rather than gate on the exact ET hour. The old design used two entries
 * + an `=== 19` hour gate to hold 7 PM year-round, but that gate skipped
 * whenever Vercel's cron delivery drifted out of the 7 PM hour, and the second
 * entry pushed us over the Hobby plan's 2-cron cap. One entry, no gate, runs
 * whenever it fires.
 */
const SENTRY_SOURCE = "cron-parking-prep-reminder";

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  // safety-removed: dropped the `nowET().getHours() === 19` gate — it only
  // existed to dedupe the old two-entry DST straddle and skipped whenever cron
  // delivery drifted out of the 7 PM ET hour. Single entry now, nothing to
  // dedupe; DST tradeoff documented above.
  const result = await findUnpreppedCarsForTonight();
  if (!result.ok) {
    // Never collapse a query failure into a silent "all clear" — that's the
    // exact failure this reminder exists to prevent. Fail loud in BOTH the
    // Vercel runtime logs (console) and Sentry — Sentry warnings aren't
    // reliably queryable here, so console is the operator's real signal.
    console.error("[parking-prep-reminder] ran — query failed:", result.error);
    Sentry.captureException(new Error(result.error), {
      tags: { source: SENTRY_SOURCE },
    });
    return NextResponse.json({ ok: false, error: "query-failed" }, { status: 500 });
  }

  const { cars } = result;
  if (cars.length === 0) {
    // Log even the silent path so Vercel runtime logs prove it ran — a
    // successful run otherwise leaves no trace, which is what made "did it
    // even fire?" hard to answer.
    console.log("[parking-prep-reminder] ran — nothing to flag");
    return NextResponse.json({ ok: true, flagged: 0 });
  }

  // We have cars to flag, so a text MUST go out. If Quo isn't configured,
  // sendSMS would return test-mode success without sending — a false all-clear,
  // the exact failure this reminder guards against. Fail loud instead.
  if (!isQuoConfigured()) {
    console.error(
      `[parking-prep-reminder] ran — flagged ${cars.length} but QUO_API_KEY unset; nothing sent`
    );
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
    console.warn(
      `[parking-prep-reminder] dropped ${configured.length - recipients.length} unparseable recipient(s) — ${recipients.length}/${configured.length} valid`
    );
    Sentry.captureMessage("parking_prep_reminder_unparseable_recipient", {
      level: "warning",
      tags: { source: SENTRY_SOURCE },
      extra: { configured: configured.length, resolved: recipients.length },
    });
  }

  if (recipients.length === 0) {
    // We have cars to flag but nowhere to send. Log loudly — this must NOT read
    // as a clean run in the Vercel logs the operator checks, and a warning-level
    // Sentry event alone isn't reliably queryable here.
    console.error(
      `[parking-prep-reminder] ran — flagged ${cars.length} but NO valid recipients (INTERNAL_NOTIFICATION_PHONES unset/empty); no one was texted`
    );
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
    console.error(
      "[parking-prep-reminder] ran — shop line unset:",
      err instanceof Error ? err.message : err
    );
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

  const notified = recipients.length - smsErrors;
  console.log(
    `[parking-prep-reminder] ran — flagged ${cars.length}, notified ${notified}/${recipients.length}`
  );
  return NextResponse.json({ ok: true, flagged: cars.length, notified, smsErrors });
}
