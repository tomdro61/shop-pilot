-- Backfill date_finished for complete jobs that are missing it.
-- Uses date_received as the best available approximation.
UPDATE jobs
SET date_finished = date_received
WHERE status = 'complete'
  AND date_finished IS NULL;
