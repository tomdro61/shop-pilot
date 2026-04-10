-- Manual income entries for revenue not tied to jobs (contracts, parking, etc.)
CREATE TABLE manual_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  amount numeric(10,2) NOT NULL,
  shop_keep_pct numeric(5,2) NOT NULL DEFAULT 100,
  label text NOT NULL,
  category text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_manual_income_date ON manual_income(date);
