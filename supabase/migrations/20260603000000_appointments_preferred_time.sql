-- The booking form now asks the customer for a specific requested hour
-- (9am–4pm weekdays, 10am–1pm Saturday) instead of just a morning/afternoon
-- window. Store it as a first-class field.
--
-- Nullable: pre-existing rows (if any) have no requested hour, and the manager
-- UI falls back to preferred_time_window for those. preferred_time_window is
-- kept and derived server-side from this hour (coarse grouping + the
-- Saturday-afternoon guard). HH:MM, 24h.
alter table appointments
  add column preferred_time text
    check (
      preferred_time is null
      or preferred_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );
