-- Fix RLS security issues flagged by Supabase Security Advisor
-- 1. Enable RLS on lock_boxes (was missing entirely)
-- 2. Tighten quote_requests policies (was open to all authenticated)
-- 3. Tighten daily_inspection_counts policy (was open to all authenticated)

-- ============================================================
-- 1. lock_boxes — enable RLS + add policies
-- ============================================================
ALTER TABLE lock_boxes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (techs need this for checkout)
CREATE POLICY "Authenticated users can read lock_boxes"
  ON lock_boxes FOR SELECT
  TO authenticated
  USING (true);

-- Only managers can modify lock boxes
CREATE POLICY "Managers can manage lock_boxes"
  ON lock_boxes FOR ALL
  TO authenticated
  USING (is_manager())
  WITH CHECK (is_manager());

-- ============================================================
-- 2. quote_requests — replace permissive policies with proper ones
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read quote_requests" ON quote_requests;
DROP POLICY IF EXISTS "Authenticated users can insert quote_requests" ON quote_requests;
DROP POLICY IF EXISTS "Authenticated users can update quote_requests" ON quote_requests;

-- All authenticated users can read (techs may see the dashboard count)
CREATE POLICY "Authenticated users can read quote_requests"
  ON quote_requests FOR SELECT
  TO authenticated
  USING (true);

-- Only managers can insert/update/delete
CREATE POLICY "Managers can insert quote_requests"
  ON quote_requests FOR INSERT
  TO authenticated
  WITH CHECK (is_manager());

CREATE POLICY "Managers can update quote_requests"
  ON quote_requests FOR UPDATE
  TO authenticated
  USING (is_manager());

CREATE POLICY "Managers can delete quote_requests"
  ON quote_requests FOR DELETE
  TO authenticated
  USING (is_manager());

-- (service_role policy already exists — no change needed)

-- ============================================================
-- 3. daily_inspection_counts — replace permissive policy
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage inspection counts" ON daily_inspection_counts;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read inspection counts"
  ON daily_inspection_counts FOR SELECT
  TO authenticated
  USING (true);

-- Only managers can modify
CREATE POLICY "Managers can manage inspection counts"
  ON daily_inspection_counts FOR ALL
  TO authenticated
  USING (is_manager())
  WITH CHECK (is_manager());
