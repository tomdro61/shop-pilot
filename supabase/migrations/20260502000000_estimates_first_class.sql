-- Estimates as first-class entities (sibling to jobs under a customer).
-- Before this migration, estimates were tightly coupled to jobs via
-- estimates.job_id NOT NULL, which forced a "Not Started" job to exist
-- for every quote — even ones the customer never approves. After this
-- migration, an estimate belongs directly to a customer (and optionally
-- a vehicle); the job_id link becomes optional and gets populated only
-- when an approved estimate is converted to a real job.
--
-- Also adds:
--   - 'cancelled' job status so dead jobs can leave the active board
--   - approval_method + approved_by_user_id on estimates so manager-side
--     verbal/in-person approvals are tracked alongside link approvals
--   - estimate_number sequence (parallel to ro_number_seq on jobs) so
--     estimates have their own EST-#### identifier

-- 1. Add 'cancelled' to job_status enum
alter type job_status add value if not exists 'cancelled';

-- 2. Add new columns to estimates (nullable initially; backfill below)
alter table estimates
  add column if not exists customer_id uuid references customers(id) on delete cascade,
  add column if not exists vehicle_id uuid references vehicles(id) on delete set null,
  add column if not exists approval_method text check (approval_method in ('link', 'verbal', 'in_person')),
  add column if not exists approved_by_user_id uuid references users(id) on delete set null,
  add column if not exists estimate_number bigint;

-- 3. Backfill customer_id and vehicle_id from existing job FK
update estimates e
set customer_id = j.customer_id,
    vehicle_id = j.vehicle_id
from jobs j
where e.job_id = j.id
  and e.customer_id is null;

-- 4. Lock customer_id NOT NULL — every estimate must belong to a customer
alter table estimates alter column customer_id set not null;

-- 5. Make job_id nullable so estimates can exist without a job
alter table estimates alter column job_id drop not null;

-- 6. Drop CASCADE on job_id — deleting a job should NOT delete the estimate
--    (estimates are history; they survive their job)
alter table estimates drop constraint if exists estimates_job_id_fkey;
alter table estimates add constraint estimates_job_id_fkey
  foreign key (job_id) references jobs(id) on delete set null;

-- 7. Estimate number sequence (parallel to ro_number_seq on jobs)
create sequence if not exists estimate_number_seq start 1;

create or replace function assign_estimate_number()
returns trigger as $$
begin
  if new.estimate_number is null then
    new.estimate_number := nextval('estimate_number_seq');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists estimates_set_number on estimates;
create trigger estimates_set_number
  before insert on estimates
  for each row execute function assign_estimate_number();

-- 8. Backfill estimate_number for existing rows (oldest first so numbering matches creation order)
update estimates
set estimate_number = sub.seq
from (
  select id, row_number() over (order by created_at asc) as seq
  from estimates
  where estimate_number is null
) sub
where estimates.id = sub.id;

-- Bump sequence past the backfilled values so future inserts don't collide
select setval('estimate_number_seq', coalesce((select max(estimate_number) from estimates), 0));

-- 9. Indexes for new query patterns
create index if not exists idx_estimates_customer_id on estimates(customer_id);
create index if not exists idx_estimates_status_customer on estimates(status, customer_id);
