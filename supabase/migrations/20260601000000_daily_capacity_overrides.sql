-- Daily capacity overrides — manager-set caps for specific dates.
-- Per BOOKING_TECHNICAL_PLAN.md §3.2 / §7.4.
--
-- Defaults live in code (8/8 weekday, 4/0 Saturday, 0/0 Sunday). This table only
-- holds per-day overrides — e.g., "Tom on vacation Wed, only 2 morning slots."
-- Read by the appointments capacity trigger AND by the booking form's GET capacity
-- endpoint (via API route using admin client — no anon SELECT here).

create table daily_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  morning_max int check (morning_max is null or morning_max >= 0),
  afternoon_max int check (afternoon_max is null or afternoon_max >= 0),
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger daily_capacity_overrides_updated_at
  before update on daily_capacity_overrides
  for each row execute function update_updated_at();

alter table daily_capacity_overrides enable row level security;

create policy "capacity_select_authenticated" on daily_capacity_overrides
  for select to authenticated using (true);

-- No anon policy: the public booking form reads capacity via the GET API endpoint
-- (which uses the admin client). Exposing this table to anon would leak manager
-- notes ("Tom on vacation") to anyone with the anon key.

create policy "capacity_insert_authenticated" on daily_capacity_overrides
  for insert to authenticated with check (true);

create policy "capacity_update_authenticated" on daily_capacity_overrides
  for update to authenticated using (true) with check (true);

create policy "capacity_delete_authenticated" on daily_capacity_overrides
  for delete to authenticated using (true);

create policy "capacity_service_role_all" on daily_capacity_overrides
  for all to service_role using (true) with check (true);

-- Document the null-vs-zero contract so future managers (and migrations) don't
-- conflate them. The capacity trigger reads `coalesce(override_cap, default_cap)`,
-- so the two values mean different things:
--   NULL  = no override; trigger falls through to the code-side weekday default
--   0     = explicit cap of zero; that slot is closed for this date
comment on column daily_capacity_overrides.morning_max is
  'null = use weekday default; 0 = closed; positive int = explicit cap';
comment on column daily_capacity_overrides.afternoon_max is
  'null = use weekday default; 0 = closed; positive int = explicit cap';
