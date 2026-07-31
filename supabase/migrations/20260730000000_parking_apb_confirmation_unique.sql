-- Partial unique index on parking_reservations.confirmation_number for
-- APB-pushed reservations only.
--
-- The APB parking push (POST /api/webhooks/apb-parking) sends confirmation
-- numbers of the form APB_##### derived from bookings.display_id (which is
-- UNIQUE on the APB side), so they are globally unique. This index makes the
-- endpoint's dedup ATOMIC (INSERT that hits the index raises 23505, which the
-- endpoint maps to "duplicate"), so two concurrent Stripe webhook deliveries for
-- the same booking cannot create duplicate reservation rows.
--
-- PARTIAL (only APB-pushed rows) because pre-existing form/Wix rows can share
-- blank or duplicate confirmation numbers; a global unique index would fail to
-- build. No APB_ rows exist yet, so this builds cleanly.
--
-- The predicate escapes the underscore (LIKE 'APB\_%', backslash = the default
-- LIKE escape char) so it matches the LITERAL prefix "APB_" and nothing else.
-- Do NOT "simplify" this to 'APB_%' — there the underscore is a single-char
-- wildcard, which technically also covers "APBx…" strings. Harmless today (no
-- such rows) but wrong-reading and a future footgun.

CREATE UNIQUE INDEX IF NOT EXISTS parking_reservations_apb_confirmation_unique
  ON parking_reservations (confirmation_number)
  WHERE confirmation_number LIKE 'APB\_%';
