-- Online bookings now create/update a Quo (OpenPhone) contact on submit, mirroring
-- the parking and estimate flows. Store the resulting contact id so the appointment
-- detail page can deep-link to the contact in Quo ("Open in Quo"), matching the
-- Quote Requests card. Nullable: a Quo failure is best-effort and never blocks the
-- booking, so the id may be absent.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS quo_contact_id text;
