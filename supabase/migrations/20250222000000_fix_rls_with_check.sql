-- Fix RLS policies: add explicit WITH CHECK for INSERT operations
-- The "for all using (...)" pattern doesn't always propagate to WITH CHECK,
-- causing "new row violates row-level security policy" on inserts.

-- Customers
drop policy if exists "managers_full_customers" on customers;
create policy "managers_full_customers" on customers
  for all using (is_manager()) with check (is_manager());

-- Vehicles
drop policy if exists "managers_full_vehicles" on vehicles;
create policy "managers_full_vehicles" on vehicles
  for all using (is_manager()) with check (is_manager());

-- Jobs
drop policy if exists "managers_full_jobs" on jobs;
create policy "managers_full_jobs" on jobs
  for all using (is_manager()) with check (is_manager());

-- Job Line Items
drop policy if exists "managers_full_line_items" on job_line_items;
create policy "managers_full_line_items" on job_line_items
  for all using (is_manager()) with check (is_manager());

-- Estimates
drop policy if exists "managers_full_estimates" on estimates;
create policy "managers_full_estimates" on estimates
  for all using (is_manager()) with check (is_manager());

-- Estimate Line Items
drop policy if exists "managers_full_estimate_line_items" on estimate_line_items;
create policy "managers_full_estimate_line_items" on estimate_line_items
  for all using (is_manager()) with check (is_manager());

-- Invoices
drop policy if exists "managers_full_invoices" on invoices;
create policy "managers_full_invoices" on invoices
  for all using (is_manager()) with check (is_manager());

-- Messages
drop policy if exists "managers_full_messages" on messages;
create policy "managers_full_messages" on messages
  for all using (is_manager()) with check (is_manager());

-- Users
drop policy if exists "managers_insert_users" on users;
create policy "managers_insert_users" on users
  for insert with check (is_manager());
