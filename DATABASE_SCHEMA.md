# ShopPilot — Database Schema

Canonical types live in [`src/types/supabase.ts`](./src/types/supabase.ts) — that's the source of truth for column types. This file carries the **human context**: what each column is for, what's deprecated, what invariants apply, why columns exist.

All schema changes go through Supabase migrations in `supabase/migrations/`. Never edit schema manually in the dashboard. All table and column names use `snake_case`.

When a migration ships, update three things: the migration file, `src/types/supabase.ts` (regenerate), and this doc.

---

## `customers`
`id, first_name, last_name, phone, email, address, notes, customer_type, fleet_account, stripe_customer_id, created_at`

- **`customer_type`** — `retail | fleet | parking`
- **`stripe_customer_id`** — links to Stripe for invoicing and Card on File flow

## `vehicles`
`id, customer_id, year, make, model, vin, license_plate, mileage, color, notes`

## `jobs`
`id, customer_id, vehicle_id, status, title, category, assigned_tech, date_received, date_finished, scheduled_at, notes, payment_status, payment_method, mileage_in, stripe_payment_intent_id, ro_number`

- **`category`** — deprecated. Exists in DB but no longer set or displayed. Line-item categories are the source of truth for service categorization.
- **`date_received`** — DATE, surfaced in UI as "Drop-off date"
- **`scheduled_at`** — timestamptz, nullable. Customer-agreed drop-off time, anchored to `date_received` via cascade in `updateJobFields`
- **`ro_number`** — auto-assigned sequential integer via `ro_number_seq` PostgreSQL sequence. Displayed as `RO-0001`.

**Statuses:**
- `status`: `Not Started → Waiting for Parts → In Progress → Complete`
- `payment_status`: `unpaid → invoiced → paid / waived`
- `payment_method`: `stripe | cash | check | ach | terminal`

## `job_line_items`
`id, job_id, type, description, quantity, unit_cost, total, cost, part_number, category`

- **`type`** — `labor | part`
- **`cost`** — nullable. Wholesale price for parts, used for profit margin tracking. Never exposed to customers.
- **`category`** — single source of truth for service categorization

## `estimate_line_items`
`id, estimate_id, type, description, quantity, unit_cost, total, cost, part_number, category`

- **`cost`** — nullable. Mirrors `job_line_items.cost`. Added Session 38 to fix Feb 2026 drift.
- **Schema-parity** with `job_line_items` enforced via vitest `expectTypeOf` check at `src/types/line-items-parity.test.ts`

## `job_presets`
`id, name, category, line_items (JSONB), created_at`

## `estimates`
`id, job_id, status, sent_at, approved_at, declined_at, approval_token, tax_rate, created_at`

- **`status`** — `draft | sent | approved | declined`
- **`approval_token`** — used for public approval page links

## `invoices`
`id, job_id, stripe_invoice_id, stripe_hosted_invoice_url, status, amount, paid_at`

- **`status`** — `draft | sent | paid`

## `messages`
`id, customer_id, job_id, channel, direction, body, status, sent_at, phone_line`

- **`channel`** — `sms | email`
- **`direction`** — `in | out`
- **`status`** — `sent | failed`
- **`phone_line`** — text, nullable. Values: `'shop' | 'parking'`. Tracks which Quo line a message came in/out on.

## `catalog_items`
`id, type, description, default_quantity, default_unit_cost, default_cost, part_number, category, is_active, usage_count, created_at, updated_at`

- **`type`** — `labor | part`
- **`default_cost`** — nullable, wholesale
- **`is_active`** — boolean (for soft-disable)
- **`usage_count`** — int, drives popularity sorting
- Trigram-indexed `description` for fast search
- Seeded with 30 common items

## `lock_boxes`
`id, box_number (int, unique), code (text), created_at`

8 physical lockboxes for parking key handoff.

## `users`
`id, name, email, role, auth_id`

- **`role`** — `manager | tech`
- **`auth_id`** — linked to Supabase Auth

## `tasks`
Manager personal todos (Tasks scratchpad on dashboard). Server actions in `lib/actions/tasks.ts`.

- RLS on `tasks_select_authenticated` is permissive (any authenticated user reads)
- `getOpenTasks` returns `[]` for non-managers as the intended UX

## `shop_settings`
Single-row config table.

`tax_rate, shop_supplies_enabled, shop_supplies_method, shop_supplies_rate, shop_supplies_cap, shop_supplies_categories, hazmat_enabled, hazmat_amount, hazmat_label, hazmat_categories`

- **`shop_supplies_method`** — `percent_of_labor | percent_of_parts | percent_of_total | flat`
- **`shop_supplies_categories`** / **`hazmat_categories`** — jsonb, nullable. `null` = all categories (backward compatible). Otherwise an array of category names that scope the fee.

## `parking_reservations`
```
id,
first_name, last_name, email, phone,
drop_off_date, drop_off_time, pick_up_date, pick_up_time,
make, model, license_plate, color,
lot, parking_type, confirmation_number,
services_interested (text[]), liability_acknowledged,
status, checked_in_at, checked_out_at,
spot_number, lock_box_number,
staff_notes, customer_id,
departing_flight, arriving_flight,
specials_sent_at,
created_at, updated_at
```

- **`lot`** — text. Identifies which parking lot the reservation is for.
- **`parking_type`** — text, nullable, default `'self_park'`. Values: `self_park | shuttle | valet`.
- **`customer_id`** — FK to `customers`, nullable, `ON DELETE SET NULL`. Linked via `findOrCreateParkingCustomer()` on form submit.
- **`status`** — `parking_status` enum: `reserved → checked_in → checked_out` (or `no_show | cancelled`)
- **`specials_sent_at`** — timestamptz, nullable. Set when parking specials SMS sent.
- **`lock_box_number`** — int, nullable.
