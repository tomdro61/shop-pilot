-- Lower the appointment description minimum from 20 to 10 characters so the DB
-- CHECK matches the Zod validator + the website booking form (both now require
-- 10). The original table migration (20260601000001) set this inline CHECK at 20;
-- without lowering it here a 10–19 char description passes the client AND Zod but
-- fails at insert with a check_violation (→ 500). Loosening a CHECK is
-- backward-compatible — existing rows (all >= 20) still satisfy >= 10.
-- DROP ... IF EXISTS keeps it idempotent against constraint-name drift.
alter table appointments
  drop constraint if exists appointments_description_check;

alter table appointments
  add constraint appointments_description_check
  check (length(btrim(description)) >= 10);
