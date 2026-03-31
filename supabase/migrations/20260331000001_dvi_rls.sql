-- ============================================================
-- DVI — Row Level Security Policies
-- ============================================================

-- Enable RLS on all DVI tables
ALTER TABLE dvi_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dvi_template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE dvi_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dvi_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE dvi_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE dvi_photos ENABLE ROW LEVEL SECURITY;

-- ── Templates: all authenticated can read, managers can modify ──

CREATE POLICY "authenticated_read_templates"
  ON dvi_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "managers_manage_templates"
  ON dvi_templates FOR ALL
  USING (is_manager())
  WITH CHECK (is_manager());

CREATE POLICY "authenticated_read_template_categories"
  ON dvi_template_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "managers_manage_template_categories"
  ON dvi_template_categories FOR ALL
  USING (is_manager())
  WITH CHECK (is_manager());

CREATE POLICY "authenticated_read_template_items"
  ON dvi_template_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "managers_manage_template_items"
  ON dvi_template_items FOR ALL
  USING (is_manager())
  WITH CHECK (is_manager());

-- ── Inspections + results + photos: all authenticated can CRUD ──

CREATE POLICY "authenticated_all_inspections"
  ON dvi_inspections FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_all_results"
  ON dvi_results FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_all_photos"
  ON dvi_photos FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Tech job visibility for DVI job list ──
-- Existing techs_read_assigned_jobs only shows assigned jobs.
-- Techs need to see ALL active jobs in the DVI portal.
-- Supabase ORs SELECT policies, so this adds to the existing policy.

CREATE POLICY "techs_read_active_jobs_for_dvi"
  ON jobs FOR SELECT
  USING (
    get_user_role() = 'tech'
    AND status IN ('not_started', 'waiting_for_parts', 'in_progress')
  );

-- ── Storage policies for dvi-photos bucket ──

CREATE POLICY "authenticated_upload_dvi_photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'dvi-photos');

CREATE POLICY "authenticated_read_dvi_photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'dvi-photos');

CREATE POLICY "authenticated_delete_dvi_photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'dvi-photos');
