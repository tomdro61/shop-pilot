-- Daily inspection counts table (replaces job-based inspection tracking)
CREATE TABLE daily_inspection_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  state_count integer NOT NULL DEFAULT 0,
  tnc_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE daily_inspection_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage inspection counts"
  ON daily_inspection_counts FOR ALL
  USING (auth.role() = 'authenticated');
