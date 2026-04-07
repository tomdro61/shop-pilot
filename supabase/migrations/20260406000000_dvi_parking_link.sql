-- Link DVI inspections to parking reservations for standalone parking DVIs
ALTER TABLE dvi_inspections
  ADD COLUMN IF NOT EXISTS parking_reservation_id uuid
  REFERENCES parking_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dvi_inspections_parking_reservation
  ON dvi_inspections(parking_reservation_id);

-- Unique constraint for findOrCreateParkingVehicle upsert (prevents race-condition duplicates)
-- Uses lower() for case-insensitive matching on make/model
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_customer_make_model
  ON vehicles(customer_id, lower(make), lower(model));

-- Atomic append to services_completed array (avoids read-modify-write race conditions)
CREATE OR REPLACE FUNCTION append_service_completed(reservation_id uuid, service_value text)
RETURNS void AS $$
  UPDATE parking_reservations
  SET services_completed = array_append(
    COALESCE(services_completed, ARRAY[]::text[]),
    service_value
  )
  WHERE id = reservation_id
    AND NOT (COALESCE(services_completed, ARRAY[]::text[]) @> ARRAY[service_value]);
$$ LANGUAGE sql;
