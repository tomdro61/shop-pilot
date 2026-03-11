-- Allow invoices to be linked to parking reservations (not just jobs)
ALTER TABLE invoices ALTER COLUMN job_id DROP NOT NULL;

-- Add parking reservation FK
ALTER TABLE invoices
  ADD COLUMN parking_reservation_id uuid REFERENCES parking_reservations(id) ON DELETE SET NULL;

-- Exactly one source per invoice: job XOR parking reservation
ALTER TABLE invoices
  ADD CONSTRAINT invoices_source_check
  CHECK ((job_id IS NOT NULL) != (parking_reservation_id IS NOT NULL));

-- Index for parking reservation lookups
CREATE INDEX idx_invoices_parking_reservation_id
  ON invoices (parking_reservation_id)
  WHERE parking_reservation_id IS NOT NULL;
