import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Pipeline-proving cron endpoint. Vercel calls this on the schedule in
 * vercel.json. Real cron jobs live in sibling /api/cron/* routes.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` to every
 * scheduled invocation. The CRON_SECRET env var is **auto-generated and
 * auto-injected by Vercel** when crons are declared in vercel.json — you
 * don't set it manually in the Vercel dashboard or .env.local. Without the
 * guard, anyone with the URL could trigger the endpoint manually.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

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
