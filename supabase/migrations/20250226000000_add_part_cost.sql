-- Add wholesale cost tracking for part line items
-- Nullable: existing rows get NULL (cost unknown), labor rows stay NULL
ALTER TABLE job_line_items ADD COLUMN cost numeric(10, 2) DEFAULT NULL;
