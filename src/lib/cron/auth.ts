import { NextResponse } from "next/server";

/**
 * Verify a Vercel Cron request. Vercel auto-injects CRON_SECRET when crons are
 * declared in vercel.json and sends `Authorization: Bearer ${CRON_SECRET}` on
 * every scheduled invocation — you don't set it manually. Returns a 401
 * response to short-circuit with, or null when the request is authorized:
 *
 *   const unauthorized = requireCronSecret(request);
 *   if (unauthorized) return unauthorized;
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return null;
}
