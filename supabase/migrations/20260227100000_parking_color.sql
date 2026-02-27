-- Add optional color field to parking reservations
ALTER TABLE parking_reservations
  ADD COLUMN color text;
