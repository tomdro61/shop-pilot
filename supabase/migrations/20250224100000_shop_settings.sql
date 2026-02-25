-- Shop settings: configurable tax rate, shop supplies fee, environmental/hazmat fee
CREATE TABLE shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_rate numeric(6,5) NOT NULL DEFAULT 0.06250,
  shop_supplies_enabled boolean NOT NULL DEFAULT false,
  shop_supplies_method text NOT NULL DEFAULT 'percent_of_labor'
    CHECK (shop_supplies_method IN ('percent_of_labor', 'percent_of_parts', 'percent_of_total', 'flat')),
  shop_supplies_rate numeric(8,4) NOT NULL DEFAULT 0.0500,
  shop_supplies_cap numeric(8,2),
  hazmat_enabled boolean NOT NULL DEFAULT false,
  hazmat_amount numeric(8,2) NOT NULL DEFAULT 3.00,
  hazmat_label text NOT NULL DEFAULT 'Environmental Fee',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER set_shop_settings_updated_at
  BEFORE UPDATE ON shop_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read shop_settings"
  ON shop_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only managers can update
CREATE POLICY "Managers can update shop_settings"
  ON shop_settings FOR UPDATE
  USING (is_manager())
  WITH CHECK (is_manager());

-- Seed one row with defaults
INSERT INTO shop_settings DEFAULT VALUES;
