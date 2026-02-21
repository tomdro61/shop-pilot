-- Fleet accounts and payment tracking
-- Remove "paid" as a job status (payment is a separate concern)

-- New enums
CREATE TYPE customer_type AS ENUM ('retail', 'fleet');
CREATE TYPE payment_method AS ENUM ('stripe', 'cash', 'check', 'ach');
CREATE TYPE payment_status AS ENUM ('unpaid', 'invoiced', 'paid', 'waived');

-- Customers: fleet support
ALTER TABLE customers
  ADD COLUMN customer_type customer_type NOT NULL DEFAULT 'retail',
  ADD COLUMN fleet_account text;

-- Jobs: payment tracking + mileage
ALTER TABLE jobs
  ADD COLUMN payment_method payment_method,
  ADD COLUMN payment_status payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN mileage_in integer;

-- Migrate existing "paid" jobs -> complete + payment_status: paid
UPDATE jobs SET status = 'complete', payment_status = 'paid', payment_method = 'stripe'
  WHERE status = 'paid';

-- Remove "paid" from job_status enum (PostgreSQL can't drop values directly)
-- Must drop default before casting, then re-add after
ALTER TABLE jobs ALTER COLUMN status DROP DEFAULT;
ALTER TYPE job_status RENAME TO job_status_old;
CREATE TYPE job_status AS ENUM ('not_started', 'waiting_for_parts', 'in_progress', 'complete');
ALTER TABLE jobs ALTER COLUMN status TYPE job_status USING status::text::job_status;
DROP TYPE job_status_old;
ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'not_started'::job_status;
