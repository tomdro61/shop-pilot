-- ============================================================
-- DVI — Middle ground: tie inspections to vehicle + customer directly
-- job_id becomes nullable with SET NULL (inspection survives job deletion)
-- ============================================================

-- Add direct vehicle and customer links
ALTER TABLE dvi_inspections ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;
ALTER TABLE dvi_inspections ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE dvi_inspections ADD COLUMN IF NOT EXISTS customer_note text;

-- Drop existing job_id constraints
ALTER TABLE dvi_inspections DROP CONSTRAINT IF EXISTS dvi_inspections_job_id_fkey;
ALTER TABLE dvi_inspections DROP CONSTRAINT IF EXISTS dvi_inspections_job_id_key;

-- Make job_id nullable, re-add FK with SET NULL instead of CASCADE
ALTER TABLE dvi_inspections ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE dvi_inspections ADD CONSTRAINT dvi_inspections_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE dvi_inspections ADD CONSTRAINT dvi_inspections_job_id_key UNIQUE (job_id);

-- Backfill existing inspections from their jobs
UPDATE dvi_inspections di
SET vehicle_id = j.vehicle_id, customer_id = j.customer_id
FROM jobs j
WHERE di.job_id = j.id
  AND di.vehicle_id IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dvi_inspections_vehicle_id ON dvi_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dvi_inspections_customer_id ON dvi_inspections(customer_id);
