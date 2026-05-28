-- VIN decode cache — results from NHTSA's free VIN decode API.
-- Per BOOKING_TECHNICAL_PLAN.md §3.5 / §7.
--
-- We cache here (not via Next.js fetch cache) because next.revalidate on fetch
-- is silently ignored inside API route handlers in some Next.js versions,
-- especially when combined with admin Supabase calls in the same handler.
-- VINs are immutable per vehicle so a 30-day refresh window is fine.

create table vin_decode_cache (
  -- text, not char(17), to avoid SQL-standard blank-padding semantics that break
  -- string comparisons and primary-key uniqueness against unpadded inputs.
  -- Regex also rejects the illegal VIN characters I, O, Q (NHTSA spec).
  vin text primary key check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  -- Year bounds: 1981 is the start of the 17-char VIN standard; current_year + 2
  -- accommodates next-model-year VINs that decode legitimately.
  year int check (year is null or (year between 1981 and extract(year from now())::int + 2)),
  make text,
  model text,
  trim text,
  raw jsonb,
  decoded_at timestamptz not null default now()
);

alter table vin_decode_cache enable row level security;

create policy "vin_cache_select_authenticated" on vin_decode_cache
  for select to authenticated using (true);

create policy "vin_cache_service_role_all" on vin_decode_cache
  for all to service_role using (true) with check (true);
