-- Let a sent estimate be edited and resent without losing track of what the
-- customer has actually seen.
--
-- last_edited_at: stamped whenever line items, the vehicle, or the customer on
-- an estimate change. Compared against the most recent send to show the
-- manager an "edited since last sent" flag so they know to resend.
--
-- last_sent_at: stamped by resendEstimate on each delivery. sent_at keeps the
-- ORIGINAL send date because the inbox ages open estimates from it — bumping
-- sent_at on a resend would make a quote that has been outstanding for two
-- weeks look brand new.
--
-- Both nullable, no backfill. Null last_sent_at means "never resent"; null
-- last_edited_at means "not edited since this column shipped".
alter table estimates
  add column if not exists last_edited_at timestamptz,
  add column if not exists last_sent_at timestamptz;
