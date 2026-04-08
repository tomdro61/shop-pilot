-- Create sentinel "Walk-In" customer for Quick Pay jobs
INSERT INTO customers (id, first_name, last_name, phone, email, customer_type, notes)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Walk-In',
  'Customer',
  NULL,
  NULL,
  'retail',
  'Sentinel record for Quick Pay / walk-in counter payments. Do not delete.'
)
ON CONFLICT (id) DO NOTHING;
