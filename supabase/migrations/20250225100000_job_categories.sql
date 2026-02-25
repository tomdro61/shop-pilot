-- Add configurable job categories to shop_settings
ALTER TABLE shop_settings
ADD COLUMN job_categories jsonb NOT NULL DEFAULT '["Oil Change","Brake Service","Engine Repair","Transmission","Electrical","Suspension","Exhaust","A/C & Heating","Tire Service","Inspection","Diagnostic","Body Work","General Maintenance","Other"]'::jsonb;

-- Populate existing row(s) with default
UPDATE shop_settings SET job_categories = DEFAULT;
