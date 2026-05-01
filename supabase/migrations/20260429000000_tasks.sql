-- Tasks: free-form items the manager adds to the Action Center.
-- Distinct from the auto-generated open loops that surface from existing
-- data (unpaid jobs, pending estimates, parking leads, etc.). A task is
-- something the user typed in themselves: "ask brother about strut prices",
-- "order rotors for Hertz #4421", etc.

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  title text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index tasks_status_created_at_idx on tasks (status, created_at desc);
create index tasks_user_id_idx on tasks (user_id);

alter table tasks enable row level security;

-- Any authenticated staff member can read all tasks.
create policy "tasks_select_authenticated" on tasks
  for select to authenticated using (true);

-- Authenticated staff can insert tasks (any user).
create policy "tasks_insert_authenticated" on tasks
  for insert to authenticated with check (true);

-- Authenticated staff can update + delete tasks (no per-row ownership for now —
-- it's a small shop, anyone can resolve anyone's task).
create policy "tasks_update_authenticated" on tasks
  for update to authenticated using (true) with check (true);

create policy "tasks_delete_authenticated" on tasks
  for delete to authenticated using (true);
