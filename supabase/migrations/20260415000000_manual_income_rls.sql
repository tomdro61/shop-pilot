-- Enable RLS on manual_income (was missing from 20260409000000_manual_income.sql)
ALTER TABLE manual_income ENABLE ROW LEVEL SECURITY;

-- Managers: full access
CREATE POLICY "managers_all_manual_income"
  ON manual_income FOR ALL
  USING (is_manager())
  WITH CHECK (is_manager());

-- Techs: read-only (can view revenue data but not modify)
CREATE POLICY "techs_read_manual_income"
  ON manual_income FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Service role: full access (for API routes using admin client)
CREATE POLICY "service_role_manual_income"
  ON manual_income FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
