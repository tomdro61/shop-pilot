-- Split one job line item into several that add up to the same amount, in one
-- transaction. The JS action (splitLineItem) validates first and gives the
-- friendly message; this is the guarantee. Insert-then-delete from JS left a
-- window where a killed function or a failed delete left both the original
-- and the new lines on a settled job, and a retry then doubled them.
--
-- The new lines keep the original's type, so the parts subtotal and the
-- taxable base are unchanged. quantity 1 and unit_cost = amount, so the
-- generated total equals the amount exactly. cost is whatever the caller
-- apportioned (splitLineItem shares a part's wholesale cost across the new
-- lines in proportion to their amounts). created_at is staggered by a
-- millisecond per part so the job page, which orders by created_at then id,
-- shows them in the order they were entered.
--
-- SECURITY INVOKER (the default): the caller's RLS applies to the insert and
-- the delete, so a tech session, which has no write policy on
-- job_line_items, gets nothing from calling it directly.
create or replace function split_job_line_item(p_line_id uuid, p_parts jsonb)
returns uuid[]
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_line job_line_items%rowtype;
  v_orig_cents bigint;
  v_sum_cents bigint;
  v_ids uuid[];
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array'
     or jsonb_array_length(p_parts) < 2 or jsonb_array_length(p_parts) > 20 then
    raise exception 'A split needs between 2 and 20 lines';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parts) as t(p)
    where coalesce(btrim(t.p->>'description'), '') = ''
       or coalesce((t.p->>'amount')::numeric, 0) <= 0
  ) then
    raise exception 'Every line needs a description and an amount greater than 0';
  end if;

  select * into v_line from job_line_items where id = p_line_id for update;
  if not found then
    raise exception 'Line item not found';
  end if;

  v_orig_cents := round(coalesce(v_line.total, v_line.quantity * v_line.unit_cost) * 100);
  select sum(round((t.p->>'amount')::numeric * 100)) into v_sum_cents
  from jsonb_array_elements(p_parts) as t(p);
  if v_sum_cents <> v_orig_cents then
    raise exception 'The new lines must add up to exactly the original amount';
  end if;

  with ins as (
    insert into job_line_items
      (job_id, type, description, quantity, unit_cost, cost, part_number, category, created_at)
    select
      v_line.job_id,
      v_line.type,
      btrim(t.p->>'description'),
      1,
      round((t.p->>'amount')::numeric, 2),
      case when t.p->>'cost' is null then null else round((t.p->>'cost')::numeric, 2) end,
      null,
      nullif(btrim(t.p->>'category'), ''),
      now() + (t.ord * interval '1 millisecond')
    from jsonb_array_elements(p_parts) with ordinality as t(p, ord)
    order by t.ord
    returning id
  )
  select array_agg(id) into v_ids from ins;

  delete from job_line_items where id = p_line_id;

  return v_ids;
end;
$$;

revoke all on function split_job_line_item(uuid, jsonb) from public;
grant execute on function split_job_line_item(uuid, jsonb) to authenticated, service_role;
