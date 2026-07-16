import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireCronSecret } from "@/lib/cron/auth";

/**
 * Pipeline-proving cron endpoint. Vercel calls this on the schedule in
 * vercel.json. Real cron jobs live in sibling /api/cron/* routes. Auth is the
 * shared CRON_SECRET check in requireCronSecret.
 */
export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const ranAt = new Date().toISOString();

  // Captured as info-level so we can verify the cron fired without it
  // lighting up the Sentry error feed. `source` is route-specific
  // (kebab-case) to match the project convention — future cron routes
  // should use `cron-<route-name>`.
  Sentry.captureMessage("cron_health_ok", {
    level: "info",
    tags: { source: "cron-health" },
    extra: { ranAt },
  });

  return NextResponse.json({ ok: true, ranAt });
}
