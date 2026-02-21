-- Job presets: reusable templates for common job types with pre-filled line items

create table job_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  line_items jsonb not null default '[]',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table job_presets enable row level security;

create policy "Authenticated users can manage presets"
  on job_presets for all using (auth.role() = 'authenticated');

create trigger set_updated_at before update on job_presets
  for each row execute function update_updated_at();

-- Seed data: 6 common presets for Broadway Motors
insert into job_presets (name, category, line_items, sort_order) values
  ('Oil Change', 'Oil Change', '[{"type":"labor","description":"Oil Change Labor","quantity":0.5,"unit_cost":130},{"type":"part","description":"Oil Filter & Oil","quantity":1,"unit_cost":45}]', 1),
  ('Brake Service', 'Brake Service', '[{"type":"labor","description":"Brake Service Labor","quantity":1.5,"unit_cost":130},{"type":"part","description":"Brake Pads","quantity":1,"unit_cost":65}]', 2),
  ('Tire Rotation', 'Tire Service', '[{"type":"labor","description":"Tire Rotation Labor","quantity":0.5,"unit_cost":130}]', 3),
  ('State Inspection', 'Inspection', '[{"type":"labor","description":"State Inspection","quantity":1,"unit_cost":35}]', 4),
  ('Battery Replacement', 'Electrical', '[{"type":"labor","description":"Battery Replacement Labor","quantity":0.5,"unit_cost":130},{"type":"part","description":"Battery","quantity":1,"unit_cost":150}]', 5),
  ('Diagnostic', 'Diagnostic', '[{"type":"labor","description":"Diagnostic Labor","quantity":1,"unit_cost":130}]', 6);
