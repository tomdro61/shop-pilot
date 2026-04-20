-- Track which valet is handling the arrival (drop-off) and departure (pick-up)
-- legs of a valet reservation. Nullable — only meaningful for parking_type = 'valet'.
ALTER TABLE parking_reservations
  ADD COLUMN arrival_valet text,
  ADD COLUMN departure_valet text;
