-- Online booking now collects a required "License Plate or VIN" field. A 17-char
-- VIN already lands in snapshot_vehicle_vin (and is NHTSA-decoded); a plate had
-- nowhere to go. Add a snapshot column for it so the manager sees the plate on
-- the appointment even when no vehicle row was linked.
--
-- Plain text, no CHECK: plate formats vary by state and the value is validated at
-- the Zod boundary. Matches the no-CHECK treatment of snapshot_vehicle_vin.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS snapshot_vehicle_plate text;
