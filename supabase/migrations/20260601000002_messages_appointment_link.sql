-- Link outbound messages to the appointment that triggered them.
-- Per BOOKING_TECHNICAL_PLAN.md §3.4.
--
-- The dashboard's pending-appointments strip surfaces failed acknowledgments via
--   select * from messages where status = 'failed' and related_appointment_id is not null
-- so the manager can manually follow up. Without this column we can't tell which
-- message belonged to which appointment.

alter table messages
  add column related_appointment_id uuid references appointments(id) on delete set null;

create index idx_messages_related_appointment
  on messages(related_appointment_id)
  where related_appointment_id is not null;
