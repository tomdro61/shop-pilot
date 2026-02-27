-- Link parking reservations to customers table

-- 1. Add 'parking' to the customer_type enum
ALTER TYPE customer_type ADD VALUE IF NOT EXISTS 'parking';

-- 2. Add customer_id FK to parking_reservations
ALTER TABLE parking_reservations
  ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- 3. Index on parking_reservations.customer_id for fast lookups
CREATE INDEX idx_parking_reservations_customer_id
  ON parking_reservations(customer_id)
  WHERE customer_id IS NOT NULL;

-- 4. Index on customers.email for dedup lookups
CREATE INDEX IF NOT EXISTS idx_customers_email
  ON customers(lower(email))
  WHERE email IS NOT NULL;
