-- ShopPilot Initial Schema
-- All tables for Phase 1 + forward-looking Phase 2 tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================================================
-- ENUMS
-- =============================================================================

create type job_status as enum (
  'not_started',
  'waiting_for_parts',
  'in_progress',
  'complete',
  'paid'
);

create type line_item_type as enum ('labor', 'part');

create type estimate_status as enum ('draft', 'sent', 'approved', 'declined');

create type invoice_status as enum ('draft', 'sent', 'paid');

create type message_channel as enum ('sms', 'email');

create type message_direction as enum ('in', 'out');

create type user_role as enum ('manager', 'tech');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Users (shop staff)
create table users (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid unique, -- links to Supabase Auth
  name text not null,
  email text not null unique,
  role user_role not null default 'tech',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Customers
create table customers (
  id uuid primary key default uuid_generate_v4(),
  first_name text not null,
  last_name text not null,
  phone text, -- E.164 format
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vehicles
create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  year integer,
  make text,
  model text,
  vin text,
  mileage integer,
  color text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Jobs
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete restrict,
  vehicle_id uuid references vehicles(id) on delete set null,
  status job_status not null default 'not_started',
  category text,
  assigned_tech uuid references users(id) on delete set null,
  date_received date not null default current_date,
  date_finished date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Job Line Items (labor + parts)
create table job_line_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  type line_item_type not null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_cost numeric(10, 2) not null default 0,
  total numeric(10, 2) generated always as (quantity * unit_cost) stored,
  part_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Estimates (Phase 2, schema ready)
create table estimates (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  status estimate_status not null default 'draft',
  sent_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  tax_rate numeric(5, 4) not null default 0.0625, -- MA 6.25% sales tax
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Estimate Line Items (Phase 2, schema ready)
create table estimate_line_items (
  id uuid primary key default uuid_generate_v4(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  type line_item_type not null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_cost numeric(10, 2) not null default 0,
  total numeric(10, 2) generated always as (quantity * unit_cost) stored,
  part_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Invoices (Phase 2, schema ready)
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  stripe_invoice_id text,
  status invoice_status not null default 'draft',
  amount numeric(10, 2),
  paid_at timestamptz,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages (Phase 2, schema ready)
create table messages (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  channel message_channel not null,
  direction message_direction not null,
  body text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Customers
create index idx_customers_phone on customers(phone);
create index idx_customers_last_name on customers(last_name);
create index idx_customers_email on customers(email);

-- Vehicles
create index idx_vehicles_customer_id on vehicles(customer_id);
create index idx_vehicles_vin on vehicles(vin);

-- Jobs
create index idx_jobs_customer_id on jobs(customer_id);
create index idx_jobs_vehicle_id on jobs(vehicle_id);
create index idx_jobs_status on jobs(status);
create index idx_jobs_category on jobs(category);
create index idx_jobs_date_received on jobs(date_received);
create index idx_jobs_assigned_tech on jobs(assigned_tech);
create index idx_jobs_date_finished on jobs(date_finished);

-- Job Line Items
create index idx_job_line_items_job_id on job_line_items(job_id);

-- Estimates
create index idx_estimates_job_id on estimates(job_id);
create index idx_estimates_status on estimates(status);

-- Estimate Line Items
create index idx_estimate_line_items_estimate_id on estimate_line_items(estimate_id);

-- Invoices
create index idx_invoices_job_id on invoices(job_id);
create index idx_invoices_status on invoices(status);
create index idx_invoices_stripe_invoice_id on invoices(stripe_invoice_id);

-- Messages
create index idx_messages_customer_id on messages(customer_id);
create index idx_messages_job_id on messages(job_id);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger set_updated_at before update on users
  for each row execute function update_updated_at();

create trigger set_updated_at before update on customers
  for each row execute function update_updated_at();

create trigger set_updated_at before update on vehicles
  for each row execute function update_updated_at();

create trigger set_updated_at before update on jobs
  for each row execute function update_updated_at();

create trigger set_updated_at before update on job_line_items
  for each row execute function update_updated_at();

create trigger set_updated_at before update on estimates
  for each row execute function update_updated_at();

create trigger set_updated_at before update on estimate_line_items
  for each row execute function update_updated_at();

create trigger set_updated_at before update on invoices
  for each row execute function update_updated_at();
