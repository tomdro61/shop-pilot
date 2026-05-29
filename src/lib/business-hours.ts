// Shop-pilot-side business-hours / closed-state helper.
//
// Mirrors broadway-motors-web's src/lib/business-hours.ts (BOOKING_TECHNICAL_PLAN
// §9.3). The two files are intentional duplicates — the projects share no code —
// so if a DST edge is fixed in one, fix it in the other too. Used by the booking
// acknowledgment SMS (decide "within the hour" vs a next-open-morning promise)
// and, later, by booking metrics' after-hours share (§15).
//
// "Closed" here is the SMS-copy / after-hours boundary, NOT the literal lock-up
// time: the Saturday cutoff is 1pm (shop closes 2pm) and the weekday cutoff is
// 6pm (shop closes 5pm) so we never promise "within the hour" right before close.

export type BusinessClosedState =
  | { closed: false }
  | { closed: true; reason: "evening" | "saturday-afternoon" | "sunday" };

export function getBusinessClosedState(now = new Date()): BusinessClosedState {
  // Re-anchor to ET wall-clock. Matches nowET() in src/lib/utils.ts — Vercel
  // runs UTC, so reading getDay()/getHours() off a raw `new Date()` would be wrong.
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0 = Sunday
  const hour = et.getHours();

  if (day === 0) return { closed: true, reason: "sunday" };
  // Saturday: shop closes 2pm; copy flips at 1pm so we don't promise a fast
  // turnaround 15 minutes before close.
  if (day === 6 && hour >= 13) return { closed: true, reason: "saturday-afternoon" };
  // Weekday: shop closes 5pm; copy flips at 6pm for a wind-down buffer.
  if (day >= 1 && day <= 5 && hour >= 18) return { closed: true, reason: "evening" };
  return { closed: false };
}

export function isShopClosed(now = new Date()): boolean {
  return getBusinessClosedState(now).closed;
}
