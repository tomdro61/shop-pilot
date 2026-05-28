-- Appointments — online booking from broadwaymotorsrevere.com/book.
-- Per BOOKING_PRD.md and BOOKING_TECHNICAL_PLAN.md §3.1.
--
-- Customers submit via the public form, the API resolves customer + vehicle via
-- find-or-create, then inserts here. Status flows: pending → confirmed → completed
-- (or cancelled, or converted_to_job). Capacity is enforced by a trigger below so
-- two concurrent submissions can't both take the last slot.

create table appointments (
  id uuid primary key default gen_random_uuid(),

  -- Resolved on the server during find-or-create. Nullable until resolved.
  customer_id uuid references customers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,

  -- Customer-provided
  service_category text not null check (service_category in (
    'oil_change', 'brakes', 'tires', 'diagnostic',
    'exhaust', 'suspension', 'other'
  )),
  description text not null check (length(btrim(description)) >= 20),
  conditional_data jsonb not null default '{}'::jsonb,
    -- e.g., {"brake_position": "front", "tires_need": "replacement"}

  preferred_date date not null,
  preferred_time_window text not null check (preferred_time_window in ('morning', 'afternoon')),
  drop_off_or_wait text not null check (drop_off_or_wait in ('drop_off', 'wait')),

  photo_paths text[] not null default '{}'
    check (array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 3),
    -- Supabase Storage paths under the 'booking-photos' bucket, max 3 per PRD (enforced)

  status text not null default 'pending' check (status in (
    'pending', 'confirmed', 'cancelled', 'completed', 'converted_to_job'
  )),
  source text not null default 'website' check (source in ('website', 'walk_in', 'phone')),

  -- Denormalized snapshots so historical records survive customer/vehicle edits
  snapshot_customer_name text not null,
  snapshot_customer_phone text not null
    check (snapshot_customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  snapshot_customer_email text,
  snapshot_vehicle_year int,
  snapshot_vehicle_make text,
  snapshot_vehicle_model text,
  snapshot_vehicle_vin text,
  snapshot_vehicle_mileage int,

  converted_job_id uuid references jobs(id) on delete set null,

  submitted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  converted_at timestamptz,
  updated_at timestamptz not null default now(),

  -- Status → timestamp pairing. Defense-in-depth: server actions normally set the
  -- matching *_at when flipping status, but if a direct DB write bypasses the
  -- action layer the row should still be coherent.
  check (status != 'confirmed' or confirmed_at is not null),
  check (status != 'cancelled' or cancelled_at is not null),
  check (status != 'completed' or completed_at is not null),
  check (status != 'converted_to_job' or converted_at is not null)
);

-- Snapshot trust model.
-- snapshot_customer_* and snapshot_vehicle_* are written by the API route from the
-- resolved (or form-supplied) customer + vehicle. They are the authoritative
-- historical record — customers/vehicles can be deleted (FKs are ON DELETE SET NULL)
-- and the appointment must remain readable. Source of truth is the API endpoint
-- (`/api/appointments/submit`), which runs through admin client so RLS is bypassed.
-- No DB-level trigger overrides snapshots because the find-or-create-failed case
-- deliberately preserves the form-submitted name when no customer row exists.
comment on column appointments.snapshot_customer_name is
  'Authoritative customer name at submit time. Set by the API route, not by trigger — find-or-create may yield no customer_id, in which case the form-submitted name is preserved.';

-- converted_to_job ↔ converted_job_id intentional asymmetry.
-- Plan §8.4: if the converted job is later deleted, FK goes null and status stays
-- 'converted_to_job'. UI renders "Converted (job removed)". This is the explicit
-- "job was removed" signal, not invalid state. Do NOT add a CHECK enforcing both
-- to be set together — it would force ON DELETE RESTRICT (breaks job deletion) or
-- ON DELETE CASCADE (loses appointment history).
comment on column appointments.converted_job_id is
  'Job created on conversion. Goes null if the job is later deleted; status remains converted_to_job — that pair is the explicit "job removed" signal.';

-- Indexes for queries we'll actually run
create index idx_appointments_date_window on appointments (preferred_date, preferred_time_window);
create index idx_appointments_status_date on appointments (status, preferred_date);
create index idx_appointments_customer on appointments (customer_id);
create index idx_appointments_phone_date on appointments (snapshot_customer_phone, preferred_date);
  -- supports the 5-min idempotency check in /api/appointments/submit

-- updated_at trigger — reuses the existing function update_updated_at()
-- defined in 20250101000000_initial_schema.sql. Same pattern as ~8 other tables.
create trigger appointments_updated_at
  before update on appointments
  for each row execute function update_updated_at();

-- RLS
-- Convention: insert/update granted to all authenticated users to match the existing
-- public-write tables (quote_requests, parking_reservations). The real guard on
-- status changes is requireManager() inside server actions, not RLS. Don't fork the
-- pattern here just for this table.
alter table appointments enable row level security;

create policy "appointments_select_authenticated" on appointments
  for select to authenticated using (true);

create policy "appointments_insert_authenticated" on appointments
  for insert to authenticated with check (true);

create policy "appointments_update_authenticated" on appointments
  for update to authenticated using (true) with check (true);

create policy "appointments_service_role_all" on appointments
  for all to service_role using (true) with check (true);

-- Capacity guard — DB-level enforcement so two concurrent submissions can't both
-- pass the application-level check and both insert. Raises 'capacity_exceeded';
-- the API route catches the Postgres exception (errcode P0001) and returns 409.
create or replace function enforce_appointment_capacity()
  returns trigger language plpgsql as $$
declare
  default_cap int;
  override_cap int;
  effective_cap int;
  current_count int;
  weekday int;
begin
  -- Only enforce for slots that consume capacity. Cancelled/completed/converted
  -- rows can sit on a date without blocking new bookings.
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  weekday := extract(dow from new.preferred_date);  -- 0 = sunday

  default_cap := case
    when weekday = 0 then 0  -- closed
    when weekday = 6 and new.preferred_time_window = 'morning' then 4
    when weekday = 6 and new.preferred_time_window = 'afternoon' then 0
    else 8  -- weekday morning or afternoon
  end;

  select case new.preferred_time_window
    when 'morning' then morning_max
    when 'afternoon' then afternoon_max
  end into override_cap
  from daily_capacity_overrides where date = new.preferred_date;

  effective_cap := coalesce(override_cap, default_cap);

  select count(*) into current_count
  from appointments
  where preferred_date = new.preferred_date
    and preferred_time_window = new.preferred_time_window
    and status in ('pending', 'confirmed')
    and id != new.id;  -- exclude self on update

  if current_count >= effective_cap then
    raise exception 'capacity_exceeded' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger appointments_capacity_check
  before insert or update of preferred_date, preferred_time_window, status
  on appointments
  for each row execute function enforce_appointment_capacity();
