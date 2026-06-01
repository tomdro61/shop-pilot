-- Per-job (and per-estimate) sales-tax toggle. Default true = charge tax (the
-- existing behavior — every existing row keeps tax on). Set false for jobs where
-- the shop bills an outsourced part it didn't buy: the part is charged but no
-- sales tax applies. calculateTotals() zeroes the tax when this is false, and the
-- Stripe invoice's tax line item is already conditional on taxAmount > 0.
--
-- Additive + backward-compatible. The estimates column lets an estimate created
-- from a tax-off job show the same no-tax total the invoice will charge.

alter table jobs
  add column if not exists charge_sales_tax boolean not null default true;

alter table estimates
  add column if not exists charge_sales_tax boolean not null default true;
