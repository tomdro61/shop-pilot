-- Payment snapshot + money-state guards.
--
-- What was collected on a job is frozen at the paid transition. Reports that
-- answer "how much tax did we collect" read these columns instead of
-- recomputing from line items × the live shop rate, so a later rate change or
-- line-item edit cannot restate a filed period. amount_collected is the figure
-- the customer actually paid (Stripe amount_paid / PaymentIntent amount / the
-- grand total at the time of a cash record).

-- Shared with live traffic: fail fast rather than queue every request behind
-- the ACCESS EXCLUSIVE locks below.
set local lock_timeout = '5s';

do $$
begin
  if (select count(*) from shop_settings) <> 1 then
    raise exception 'shop_settings must have exactly one row before the payment backfill';
  end if;
end $$;

alter table jobs
  add column if not exists amount_collected numeric(10,2),
  add column if not exists taxable_collected numeric(10,2),
  add column if not exists tax_collected numeric(10,2),
  add column if not exists tax_rate_applied numeric(6,5),
  add column if not exists refunded_amount numeric(10,2),
  add column if not exists refunded_at timestamptz;

comment on column jobs.amount_collected is 'Frozen at the paid transition: what the customer actually paid. Null until paid; cleared by markJobUnpaid.';
comment on column jobs.tax_rate_applied is 'shop_settings.tax_rate at the moment of payment. The tax reports sum tax_collected for jobs that have it and recompute at the live rate only for a paid job whose snapshot is null.';
comment on column jobs.refunded_amount is 'Absolute amount refunded in Stripe (charge.amount_refunded / 100). Written by the charge.refunded webhook.';

-- Backfill every job that is already paid from its current line items at the
-- current shop rate. This freezes history at today's values, which the owner
-- accepted on 2026-10-15; the alternative (null snapshots on 1,487 paid jobs)
-- would leave the tax report recomputing exactly the way it does today.
with totals as (
  select
    j.id,
    coalesce(sum(li.total), 0)::numeric(10,2) as subtotal,
    coalesce(sum(li.total) filter (where li.type = 'part'), 0)::numeric(10,2) as parts
  from jobs j
  left join job_line_items li on li.job_id = j.id
  where j.payment_status = 'paid'
  group by j.id
),
rate as (
  select tax_rate from shop_settings limit 1
)
-- Rounded the way calculateTotals does it in JavaScript (float64,
-- Math.round(x * 100) / 100), so a backfilled figure equals what the app
-- showed at the time. numeric round() rounds exact .5 ties the other way on
-- about 1% of parts totals.
update jobs j
set
  taxable_collected = case when j.charge_sales_tax then t.parts else 0 end,
  tax_collected     = case when j.charge_sales_tax
                        then floor(t.parts::float8 * r.tax_rate::float8 * 100 + 0.5) / 100
                        else 0 end,
  tax_rate_applied  = r.tax_rate,
  amount_collected  = floor(
    (t.subtotal::float8
      + case when j.charge_sales_tax
          then floor(t.parts::float8 * r.tax_rate::float8 * 100 + 0.5) / 100
          else 0 end) * 100 + 0.5
  ) / 100
from totals t, rate r
where j.id = t.id
  and j.amount_collected is null;

-- Where Stripe recorded the charge, Stripe's figure wins over the recomputation.
update jobs j
set amount_collected = i.amount
from invoices i
where i.job_id = j.id
  and i.status = 'paid'
  and i.amount is not null
  and j.payment_status = 'paid';

-- A paid job always has a payment date. The tax report buckets on paid_at and
-- silently drops a paid job that has neither paid_at nor date_finished.
-- Noon Eastern, matching the tax report's own fallback for a date-only
-- value; a bare ::timestamptz is midnight UTC, which is the previous ET day.
update jobs
set paid_at = (date_finished + time '12:00') at time zone 'America/New_York'
where payment_status = 'paid'
  and paid_at is null
  and date_finished is not null;

alter table jobs
  add constraint jobs_paid_has_paid_at
  check (payment_status <> 'paid' or paid_at is not null);

-- A completed job with no finish date is invisible to every revenue report.
-- updateJobStatus used to null the date on any move off complete and the date
-- editor accepted a blank; neither may produce this row shape any more.
alter table jobs
  add constraint jobs_complete_has_date_finished
  check (status <> 'complete' or date_finished is not null);

create index if not exists idx_jobs_paid_at on jobs (paid_at);

-- Deleting a job used to cascade away its invoices row while the Stripe
-- invoice stayed open and payable. The webhook then found no row and the
-- payment landed nowhere. deleteJob now refuses when a row exists; this is the
-- backstop for any other delete path.
alter table invoices drop constraint if exists invoices_job_id_fkey;
alter table invoices
  add constraint invoices_job_id_fkey
  foreign key (job_id) references jobs (id) on delete restrict;

-- One invoice row per job. Voiding deletes the row, so re-billing stays
-- possible.
create unique index if not exists invoices_one_per_job
  on invoices (job_id)
  where job_id is not null;

-- No tech-reachable path writes jobs through RLS: the job server actions are
-- manager-gated and the staff terminal routes use the service role. This
-- policy's only reachable use was a direct PostgREST PATCH that could set
-- payment_status, paid_at, charge_sales_tax or null date_finished on an
-- assigned job.
drop policy if exists "techs_update_assigned_jobs" on jobs;

-- REVOKE ... FROM public does not remove the EXECUTE that Supabase's default
-- privileges grant to anon and authenticated directly.
revoke execute on function record_quick_pay_job(text, bigint, text, text) from anon, authenticated;

-- Quick Pay jobs are paid at creation, so they carry their snapshot from the
-- start: the charged amount, no tax (flat counter amount,
-- charge_sales_tax=false), the shop rate recorded the way buildPaymentSnapshot
-- records it so the reports treat the row as snapshotted.
create or replace function record_quick_pay_job(
  p_pi text,
  p_amount_cents bigint,
  p_note text,
  p_category text
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_rate numeric(6,5) := (select tax_rate from shop_settings limit 1);
begin
  insert into jobs (
    customer_id, status, category, date_received, date_finished,
    notes, payment_status, payment_method, charge_sales_tax,
    stripe_payment_intent_id, paid_at,
    amount_collected, taxable_collected, tax_collected, tax_rate_applied
  ) values (
    '00000000-0000-0000-0000-000000000000',
    'complete',
    coalesce(nullif(p_category, ''), 'Quick Pay'),
    v_today,
    v_today,
    nullif(p_note, ''),
    'paid',
    'terminal',
    false,
    p_pi,
    now(),
    p_amount_cents::numeric / 100,
    0,
    0,
    v_rate
  )
  on conflict (stripe_payment_intent_id) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id from jobs where stripe_payment_intent_id = p_pi;
    return v_job_id;
  end if;

  insert into job_line_items (job_id, type, description, quantity, unit_cost, category)
  values (
    v_job_id,
    'labor',
    coalesce(nullif(p_note, ''), 'Quick Pay'),
    1,
    p_amount_cents::numeric / 100,
    nullif(p_category, '')
  );

  return v_job_id;
end;
$$;

revoke all on function record_quick_pay_job(text, bigint, text, text) from public;
revoke execute on function record_quick_pay_job(text, bigint, text, text) from anon, authenticated;
grant execute on function record_quick_pay_job(text, bigint, text, text) to service_role;
