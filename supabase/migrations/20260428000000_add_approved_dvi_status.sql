-- Add "approved" to dvi_status enum.
-- Customer recommendation approval flips inspection.status sent → approved
-- so a double-tap can't insert duplicate line items into the job.
ALTER TYPE dvi_status ADD VALUE IF NOT EXISTS 'approved';
