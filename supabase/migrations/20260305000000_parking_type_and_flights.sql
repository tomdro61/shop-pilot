-- Add parking_type and flight number fields to parking_reservations
ALTER TABLE parking_reservations
  ADD COLUMN parking_type text DEFAULT 'self_park',
  ADD COLUMN departing_flight text,
  ADD COLUMN arriving_flight text;
