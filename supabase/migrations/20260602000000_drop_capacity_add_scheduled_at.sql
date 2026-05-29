-- V1 scope cut: remove the per-day capacity subsystem and add the manager-assigned
-- appointment-time column. Per BOOKING_TECHNICAL_PLAN.md §3.2 (revised 2026-05-28).
--
-- The capacity tables / trigger / function shipped in commits 525f9f1 + a69939c are
-- deferred to V1.5+ when there's actual booking volume to design against. V1 ships
-- with a plain date picker (Sundays + Saturday-afternoon disabled), a simple
-- `/appointments` inbox, and a read-only `/appointments/calendar`. The manager
-- assigns a specific time at confirm — stored in the new `scheduled_at` column.

-- Drop trigger first (depends on the function).
drop trigger if exists appointments_capacity_check on appointments;
drop function if exists enforce_appointment_capacity();

-- Drop the override table — deferred to V1.5+.
drop table if exists daily_capacity_overrides;

-- Add the manager-assigned appointment time. Set when status flips to confirmed.
-- Mirrors jobs.scheduled_at (added in 20260505000000_jobs_scheduled_at.sql) — same
-- semantic ("when this thing is scheduled to happen"), same TZ handling expected.
alter table appointments add column scheduled_at timestamptz;

create index idx_appointments_scheduled_at
  on appointments (scheduled_at)
  where scheduled_at is not null;

-- The status ↔ timestamp pairing CHECK from 20260601000001 already covers
-- 'confirmed' → confirmed_at; scheduled_at is the appointment time and is set
-- AT confirm time so the pairing isn't violated. No new CHECK needed.
