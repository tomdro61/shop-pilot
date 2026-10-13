-- Let a sent estimate be edited and resent without losing track of what the
-- customer has actually seen.
--
-- last_edited_at: stamped by the line-item, preset, and customer/vehicle edit
-- actions (not by the bulk copies that create an estimate). Compared against
-- the most recent send to show the manager an "edited since last sent" flag
-- so they know to resend.
--
-- last_sent_at: stamped by resendEstimate on each delivery. sent_at keeps the
-- ORIGINAL send date because the inbox ages open estimates from it — bumping
-- sent_at on a resend would make a quote that has been outstanding for two
-- weeks look brand new.
--
-- Both nullable, no backfill. Null means "not resent / not edited since this
-- column shipped" — the SMS-only resend predates it and left no timestamp.
alter table estimates
  add column if not exists last_edited_at timestamptz,
  add column if not exists last_sent_at timestamptz;
