import { NextResponse } from "next/server";

/**
 * Verify a Vercel Cron request. Vercel sends `Authorization: Bearer
 * ${CRON_SECRET}` on scheduled invocations ONLY when a `CRON_SECRET` env var
 * exists on the project — Vercel does not generate one for you. With the var
 * unset, cron requests arrive with no Authorization header at all.
 *
 * That unset case is why this must fail closed. Comparing against a template
 * literal alone yields the string "Bearer undefined", which both rejects every
 * real cron invocation — 401 before any handler code, so whatever the route was
 * supposed to do silently doesn't happen — and authorizes any public caller who
 * sends that literal value. Both halves shipped to production for a week; see
 * PROGRESS.md Session 67.
 *
 *   const unauthorized = requireCronSecret(request);
 *   if (unauthorized) return unauthorized;
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  // Misconfiguration, not an intrusion — log it separately so a cron that never
  // runs is diagnosable from the runtime logs instead of looking like a clean
  // 401. An HTTP status alone left this invisible for a week.
  if (!secret) {
    console.error(
      "[cron-auth] CRON_SECRET is not set — rejecting cron request; no scheduled job can run until it is configured in Vercel"
    );
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("[cron-auth] rejected request with missing/invalid bearer token");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return null;
}
