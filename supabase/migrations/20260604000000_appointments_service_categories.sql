-- Add four bookable service categories — AC Service (ac_service), Detailing
-- (detailing), Battery / Electrical (battery_electrical), and Tune-Up (tune_up).
-- service_category is a text column with an inline CHECK constraint, so widen it:
-- drop the auto-named constraint and re-add it with the new values.
-- Backward-compatible — existing rows stay valid, and the new values simply
-- become allowed. Keep this list in sync with SERVICE_CATEGORIES in
-- src/lib/validators/appointments.ts and BOOKING_CATEGORIES on the website.
alter table appointments
  drop constraint if exists appointments_service_category_check;

alter table appointments
  add constraint appointments_service_category_check
  check (service_category in (
    'oil_change', 'brakes', 'tires', 'diagnostic',
    'exhaust', 'suspension', 'ac_service', 'detailing',
    'battery_electrical', 'tune_up', 'other'
  ));
