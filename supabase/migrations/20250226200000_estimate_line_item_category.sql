-- Add category column to estimate_line_items to match job_line_items
ALTER TABLE estimate_line_items
  ADD COLUMN category text DEFAULT NULL;
