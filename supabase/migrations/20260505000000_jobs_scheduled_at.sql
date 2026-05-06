-- Add a nullable scheduled_at to jobs for customer-provided drop-off times.
--
-- Most jobs leave this null (walk-ins, "drop it off this week"). When set,
-- it carries the full datetime the customer agreed to bring the vehicle in.
-- date_received stays as the workflow-tracking date column; scheduled_at
-- is the planning column the dashboard surfaces.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Partial index for the dashboard "Scheduled Today" query — only the rows
-- with a value, so the index stays cheap even as the jobs table grows.
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at
  ON jobs(scheduled_at)
  WHERE scheduled_at IS NOT NULL;
