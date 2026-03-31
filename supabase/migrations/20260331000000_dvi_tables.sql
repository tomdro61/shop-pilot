-- ============================================================
-- DVI (Digital Vehicle Inspection) — Tables, Enums, Indexes, Triggers, Storage
-- ============================================================

-- Enums
CREATE TYPE dvi_status AS ENUM ('in_progress', 'completed', 'sent');
CREATE TYPE dvi_condition AS ENUM ('good', 'monitor', 'attention');

-- ── Templates ──────────────────────────────────────────────

-- Parent template table (future-proofs for multiple inspection templates)
CREATE TABLE dvi_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one default template at a time
CREATE UNIQUE INDEX idx_dvi_templates_default ON dvi_templates(is_default) WHERE is_default = true;

-- Template categories (sections of the checklist, e.g. "Brakes", "Tires")
CREATE TABLE dvi_template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES dvi_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Template items (individual checklist items within a category)
CREATE TABLE dvi_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES dvi_template_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Inspections ────────────────────────────────────────────

-- One inspection per job
CREATE TABLE dvi_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  template_id uuid REFERENCES dvi_templates(id) ON DELETE SET NULL,
  tech_id uuid NOT NULL REFERENCES users(id),
  status dvi_status NOT NULL DEFAULT 'in_progress',
  approval_token text UNIQUE,
  send_mode text,                    -- 'informational' | 'recommendations'
  completed_at timestamptz,          -- set by completeInspection()
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id)                     -- one DVI per job
);

-- Results: one row per template item per inspection (pre-populated on start)
CREATE TABLE dvi_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES dvi_inspections(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES dvi_template_items(id) ON DELETE SET NULL,
  category_name text NOT NULL,       -- denormalized snapshot (stable if template changes)
  item_name text NOT NULL,           -- denormalized snapshot
  condition dvi_condition,           -- null = not yet rated
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  is_recommended boolean NOT NULL DEFAULT false,
  recommended_description text,
  recommended_price numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Photos: attached to results (up to 3 per item, enforced in app)
CREATE TABLE dvi_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES dvi_results(id) ON DELETE CASCADE,
  storage_path text NOT NULL,        -- path in Supabase Storage 'dvi-photos' bucket
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────

CREATE INDEX idx_dvi_template_categories_template ON dvi_template_categories(template_id, sort_order);
CREATE INDEX idx_dvi_template_items_category ON dvi_template_items(category_id, sort_order);
CREATE INDEX idx_dvi_inspections_job_id ON dvi_inspections(job_id);
CREATE INDEX idx_dvi_inspections_status ON dvi_inspections(status);
CREATE INDEX idx_dvi_results_inspection ON dvi_results(inspection_id, sort_order);
CREATE INDEX idx_dvi_photos_result ON dvi_photos(result_id);

-- ── Triggers ───────────────────────────────────────────────
-- Reuses existing update_updated_at() from 20250101000000_initial_schema.sql

CREATE TRIGGER set_updated_at BEFORE UPDATE ON dvi_template_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON dvi_template_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON dvi_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON dvi_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Storage ────────────────────────────────────────────────
-- Private bucket — all access via signed URLs

INSERT INTO storage.buckets (id, name, public)
VALUES ('dvi-photos', 'dvi-photos', false);
