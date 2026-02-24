-- Add sequential RO (repair order) numbers to jobs
CREATE SEQUENCE ro_number_seq START 1;

ALTER TABLE jobs ADD COLUMN ro_number integer UNIQUE;

ALTER TABLE jobs ALTER COLUMN ro_number SET DEFAULT nextval('ro_number_seq');

-- Backfill existing jobs in creation order
UPDATE jobs SET ro_number = sub.rn
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM jobs) sub
WHERE jobs.id = sub.id;

-- Advance the sequence past the backfilled max
SELECT setval('ro_number_seq', COALESCE((SELECT MAX(ro_number) FROM jobs), 0));
