-- Quote Requests table — lightweight intake/lead records from the legacy site form
create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  quo_contact_id text,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  services text[] not null default '{}',
  vehicle_make text,
  vehicle_model text,
  vehicle_year int,
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for dashboard queries (newest first, filter by status)
create index idx_quote_requests_status_created on quote_requests (status, created_at desc);

-- RLS
alter table quote_requests enable row level security;

create policy "Authenticated users can read quote_requests"
  on quote_requests for select
  to authenticated
  using (true);

create policy "Authenticated users can insert quote_requests"
  on quote_requests for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update quote_requests"
  on quote_requests for update
  to authenticated
  using (true);

create policy "Service role full access on quote_requests"
  on quote_requests for all
  to service_role
  using (true)
  with check (true);
