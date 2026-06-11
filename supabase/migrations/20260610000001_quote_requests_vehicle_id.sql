-- The estimate form now collects a required "License Plate or VIN" field. Add
-- columns to store whichever the customer supplied so the manager can identify
-- the vehicle from the Quote Requests page.
--
-- Plain text, no CHECK: validated at the Zod boundary (quoteRequestSubmitSchema).
-- A DB CHECK on the VIN would have to stay in lockstep with the Zod regex, and
-- that drift is a known footgun — kept consistent with appointments' snapshot_*.

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS vehicle_vin text,
  ADD COLUMN IF NOT EXISTS license_plate text;
