-- Parts & Labor Catalog — saved individual items with default pricing
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('labor', 'part')),
  description text not null,
  default_quantity numeric not null default 1,
  default_unit_cost numeric not null default 0,
  default_cost numeric,
  part_number text,
  category text,
  is_active boolean not null default true,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create extension if not exists pg_trgm;
create index idx_catalog_items_description on catalog_items using gin (description gin_trgm_ops);
create index idx_catalog_items_category on catalog_items (category);
create index idx_catalog_items_type on catalog_items (type);
create index idx_catalog_items_active on catalog_items (is_active) where is_active = true;

-- RLS
alter table catalog_items enable row level security;

create policy "Authenticated users can read catalog_items"
  on catalog_items for select
  to authenticated
  using (true);

create policy "Authenticated users can insert catalog_items"
  on catalog_items for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update catalog_items"
  on catalog_items for update
  to authenticated
  using (true);

create policy "Authenticated users can delete catalog_items"
  on catalog_items for delete
  to authenticated
  using (true);

create policy "Service role full access on catalog_items"
  on catalog_items for all
  to service_role
  using (true)
  with check (true);

-- Seed common auto repair catalog items
insert into catalog_items (type, description, default_quantity, default_unit_cost, category) values
  -- Oil Change
  ('labor', 'Oil Change Labor', 0.5, 130, 'Oil Change'),
  ('part', 'Oil Filter', 1, 12, 'Oil Change'),
  ('part', 'Conventional Motor Oil (5 qt)', 1, 35, 'Oil Change'),
  ('part', 'Synthetic Motor Oil (5 qt)', 1, 55, 'Oil Change'),
  -- Brake Service
  ('labor', 'Front Brake Job Labor', 1.5, 130, 'Brake Service'),
  ('labor', 'Rear Brake Job Labor', 1.5, 130, 'Brake Service'),
  ('part', 'Front Brake Pads', 1, 65, 'Brake Service'),
  ('part', 'Rear Brake Pads', 1, 60, 'Brake Service'),
  ('part', 'Front Rotors', 2, 55, 'Brake Service'),
  ('part', 'Rear Rotors', 2, 50, 'Brake Service'),
  ('part', 'Brake Hardware Kit', 1, 15, 'Brake Service'),
  -- Engine Repair
  ('labor', 'Alternator Replacement Labor', 1.5, 130, 'Engine Repair'),
  ('part', 'Alternator', 1, 180, 'Engine Repair'),
  ('labor', 'Starter Replacement Labor', 1.5, 130, 'Engine Repair'),
  ('part', 'Starter Motor', 1, 160, 'Engine Repair'),
  ('part', 'Spark Plugs (set of 4)', 1, 40, 'Engine Repair'),
  ('labor', 'Spark Plug Replacement Labor', 1, 130, 'Engine Repair'),
  -- Electrical
  ('labor', 'Battery Replacement Labor', 0.5, 130, 'Electrical'),
  ('part', 'Battery', 1, 150, 'Electrical'),
  -- Suspension
  ('labor', 'Strut Replacement Labor (pair)', 2, 130, 'Suspension'),
  ('part', 'Front Struts (pair)', 1, 200, 'Suspension'),
  -- General Maintenance
  ('labor', 'Coolant Flush Labor', 1, 130, 'General Maintenance'),
  ('part', 'Coolant (1 gal)', 1, 25, 'General Maintenance'),
  ('labor', 'Serpentine Belt Replacement Labor', 0.75, 130, 'General Maintenance'),
  ('part', 'Serpentine Belt', 1, 35, 'General Maintenance'),
  -- Tire Service
  ('labor', 'Tire Rotation', 0.5, 130, 'Tire Service'),
  ('labor', 'Tire Mount & Balance (per tire)', 1, 30, 'Tire Service'),
  -- Diagnostic
  ('labor', 'Diagnostic Labor', 1, 130, 'Diagnostic'),
  -- Inspection
  ('labor', 'State Inspection', 1, 35, 'Inspection'),
  ('labor', 'TNC Inspection', 1, 15, 'Inspection');
