-- Every job gets a stable, unguessable receipt token from creation so the shop
-- can share a public itemized-receipt link (/receipt/[token]) for a completed,
-- paid job without exposing internal job IDs.
--
-- The token is DB-default-generated (not app-generated) on purpose: if the send
-- action minted the token, two rapid "Send Receipt" clicks could each generate a
-- different token, persist one, and text a link pointing at the other — a dead
-- link. A column default gives every job one stable token from creation, so the
-- send path never writes to jobs and the link is always valid.
--
-- Idempotent (IF NOT EXISTS) because this was first applied via the Supabase MCP,
-- which stamped its own version; the guards make a later `supabase db push` a
-- safe no-op instead of erroring on "column already exists".
alter table jobs
  add column if not exists receipt_token uuid not null default gen_random_uuid();

create unique index if not exists jobs_receipt_token_key on jobs (receipt_token);
