-- ShopPilot Row Level Security Policies
-- Managers: full access to everything
-- Techs: read assigned jobs only, no financials

-- Enable RLS on all tables
alter table users enable row level security;
alter table customers enable row level security;
alter table vehicles enable row level security;
alter table jobs enable row level security;
alter table job_line_items enable row level security;
alter table estimates enable row level security;
alter table estimate_line_items enable row level security;
alter table invoices enable row level security;
alter table messages enable row level security;

-- =============================================================================
-- HELPER FUNCTION: Get current user's role
-- =============================================================================

create or replace function get_user_role()
returns user_role as $$
  select role from users where auth_id = auth.uid();
$$ language sql security definer stable;

-- =============================================================================
-- HELPER FUNCTION: Check if current user is a manager
-- =============================================================================

create or replace function is_manager()
returns boolean as $$
  select exists (
    select 1 from users where auth_id = auth.uid() and role = 'manager'
  );
$$ language sql security definer stable;

-- =============================================================================
-- USERS
-- =============================================================================

-- Managers can see all users, techs can see themselves
create policy "managers_read_all_users" on users
  for select using (is_manager() or auth_id = auth.uid());

-- Only managers can insert/update/delete users
create policy "managers_insert_users" on users
  for insert with check (is_manager());

create policy "managers_update_users" on users
  for update using (is_manager());

create policy "managers_delete_users" on users
  for delete using (is_manager());

-- =============================================================================
-- CUSTOMERS
-- =============================================================================

-- Managers: full access. Techs: read only (need customer info for jobs)
create policy "managers_full_customers" on customers
  for all using (is_manager());

create policy "techs_read_customers" on customers
  for select using (get_user_role() = 'tech');

-- =============================================================================
-- VEHICLES
-- =============================================================================

-- Managers: full access. Techs: read only
create policy "managers_full_vehicles" on vehicles
  for all using (is_manager());

create policy "techs_read_vehicles" on vehicles
  for select using (get_user_role() = 'tech');

-- =============================================================================
-- JOBS
-- =============================================================================

-- Managers: full access
create policy "managers_full_jobs" on jobs
  for all using (is_manager());

-- Techs: read only their assigned jobs
create policy "techs_read_assigned_jobs" on jobs
  for select using (
    get_user_role() = 'tech'
    and assigned_tech = (select id from users where auth_id = auth.uid())
  );

-- Techs can update status and notes on their assigned jobs
create policy "techs_update_assigned_jobs" on jobs
  for update using (
    get_user_role() = 'tech'
    and assigned_tech = (select id from users where auth_id = auth.uid())
  );

-- =============================================================================
-- JOB LINE ITEMS
-- =============================================================================

-- Managers: full access
create policy "managers_full_line_items" on job_line_items
  for all using (is_manager());

-- Techs: read only for their assigned jobs
create policy "techs_read_line_items" on job_line_items
  for select using (
    get_user_role() = 'tech'
    and job_id in (
      select id from jobs
      where assigned_tech = (select id from users where auth_id = auth.uid())
    )
  );

-- =============================================================================
-- ESTIMATES (Phase 2 — managers only)
-- =============================================================================

create policy "managers_full_estimates" on estimates
  for all using (is_manager());

-- =============================================================================
-- ESTIMATE LINE ITEMS (Phase 2 — managers only)
-- =============================================================================

create policy "managers_full_estimate_line_items" on estimate_line_items
  for all using (is_manager());

-- =============================================================================
-- INVOICES (Phase 2 — managers only, no tech access to financials)
-- =============================================================================

create policy "managers_full_invoices" on invoices
  for all using (is_manager());

-- =============================================================================
-- MESSAGES (Phase 2 — managers only)
-- =============================================================================

create policy "managers_full_messages" on messages
  for all using (is_manager());
