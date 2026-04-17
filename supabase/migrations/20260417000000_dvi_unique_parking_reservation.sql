-- Clean up duplicate active DVIs per parking reservation (keep the oldest one).
DELETE FROM dvi_inspections
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY parking_reservation_id ORDER BY created_at ASC) AS rn
    FROM dvi_inspections
    WHERE parking_reservation_id IS NOT NULL
      AND status IN ('in_progress', 'completed')
  ) dupes
  WHERE rn > 1
);

-- Prevent multiple active DVIs for the same parking reservation.
-- Only one in_progress or completed DVI per reservation is allowed.
-- Sent DVIs are excluded (a new DVI could be started after one is sent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_dvi_inspections_unique_parking_reservation
  ON dvi_inspections (parking_reservation_id)
  WHERE parking_reservation_id IS NOT NULL
    AND status IN ('in_progress', 'completed');
