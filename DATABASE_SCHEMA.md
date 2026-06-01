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
`id, customer_id, job_id, channel, direction, body, status, sent_at, phone_line, related_appointment_id`

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

## `quote_requests`

```
id,
customer_id, quo_contact_id,
first_name, last_name, email, phone,
services (text[]), message,
vehicle_year, vehicle_make, vehicle_model,
photo_paths (text[]),
status,
created_at, updated_at
```

- The public **estimate-request** table — submissions from the `/contact` multi-step wizard on the website via `POST /api/quote-requests`. Worked on the Quote Requests page (and the dashboard inbox `quotes` tab); convert-to-job pre-fills the new-job form.
- **`customer_id`** — FK to `customers`, nullable, linked via `findOrCreateParkingCustomer()` on submit (a null id still saves the request; the manager links it manually).
- **`services`** — text[]. Multi-select display labels (e.g. "Brake Repair"); at least one.
- **`message`** — text, nullable in DB; the form requires ≥10 chars (enforced in `quoteRequestSubmitSchema`, not a DB CHECK).
- **`photo_paths`** — text[] with CHECK `array_length(...) <= 3` (Session 57, `20260605000000_quote_requests_photos.sql`). Storage paths under the `booking-photos` bucket at `quotes/{client_id}/` — the form's client-generated UUID is the folder prefix (the row PK stays server-generated). Signed on the Quote Requests page for display.
- **`status`** — `new | contacted | pending | converted`.
- The endpoint accepts both multipart (current form: `metadata` JSON + `photo` parts) and legacy JSON (transitional, removable once the JSON form is gone from prod).

## `appointments` (Session 43, V1 scope cut Session 44)

```
id,
customer_id, vehicle_id,
service_category, description, conditional_data,
preferred_date, preferred_time_window, scheduled_at,
drop_off_or_wait, photo_paths,
status, source,
submitted_at, confirmed_at, cancelled_at, completed_at, converted_at,
converted_job_id,
snapshot_customer_name, snapshot_customer_phone, snapshot_customer_email,
snapshot_vehicle_year, snapshot_vehicle_make, snapshot_vehicle_model,
snapshot_vehicle_vin, snapshot_vehicle_mileage,
updated_at
```

- **`id`** — uuid. **Client-generated** by the booking form and sent as `client_id` in the metadata; the route inserts with that value as the row's PK so it can double as the `booking-photos/{id}/` storage folder prefix. Eliminates the photo-upload-before-row-insert orphan race.
- **`service_category`** — `oil_change | brakes | tires | diagnostic | exhaust | suspension | other`. No inspection categories (state + TNC are walk-ins per [[parking-architecture]]).
- **`description`** — text, NOT NULL with `CHECK (length(btrim(description)) >= 20)`. Required, customer-written.
- **`preferred_time_window`** — `morning | afternoon`. The customer's preference at submit time.
- **`scheduled_at`** — timestamptz, nullable. The manager-assigned appointment time, set when status flips to `confirmed`. Mirrors `jobs.scheduled_at`. Added in `20260602000000_drop_capacity_add_scheduled_at.sql` as part of the V1 scope cut.
- **`status`** — `pending → confirmed → completed` or `cancelled` or `converted_to_job`. Paired with `*_at` timestamps via table-level CHECK constraints (defense-in-depth; server actions normally maintain the pairing).
- **`source`** — `website | walk_in | phone`. Only `website` for now.
- **`snapshot_*`** — denormalized at insert. FKs (`customer_id`, `vehicle_id`) are ON DELETE SET NULL; snapshots are the authoritative historical record if a customer or vehicle is deleted. `snapshot_customer_phone` has a CHECK for E.164.
- **`converted_job_id`** — nullable FK with ON DELETE SET NULL. If the converted job is later deleted, status stays `converted_to_job` and the link goes null — that pair is the explicit "job was removed" signal (intentional; do NOT add a CHECK forcing both to be set together).
- **`photo_paths`** — text[] with CHECK `array_length(...) <= 3`. Storage paths under the `booking-photos` bucket.
- **`conditional_data`** — jsonb. Category-dependent (brake position, tire need, check-engine state). Also carries `vin_decode_status: 'decoded' | 'decode_failed' | 'not_attempted'` when a VIN was submitted — lets the manager flag "VIN didn't decode" at confirm time.
- **Capacity trigger and `daily_capacity_overrides` table — DROPPED** in `20260602000000_drop_capacity_add_scheduled_at.sql` as part of the V1 scope cut. No per-day caps in V1. Deferred to V1.5+ when real volume justifies the complexity.

## `vin_decode_cache` (Session 43)

```
vin, year, make, model, trim, raw, decoded_at
```

- **`vin`** — text PK with CHECK `~ '^[A-HJ-NPR-Z0-9]{17}$'`. NOT `char(17)` — char would pad stored values with trailing spaces and break equality against unpadded TypeScript inputs. Regex also excludes I/O/Q (illegal in VINs per NHTSA).
- **`year`** — int, nullable, with CHECK `year is null OR (year between 1981 and extract(year from now())::int + 2)`. 1981 is the start of the 17-character VIN standard.
- **`decoded_at`** — TTL marker. `decodeVin()` refreshes from NHTSA when the row is > 30 days old. On NHTSA failure during a refresh, the stale cache row is returned rather than null (degraded data beats no data for the booking auto-populate use case).
- **`raw`** — jsonb, full NHTSA response for debugging.
- Used during `/api/appointments/submit` to fill missing year/make/model when a VIN is supplied.

## `messages` — `related_appointment_id` column added (Session 43)

Existing `messages` table gained `related_appointment_id uuid references appointments(id) on delete set null` in `20260601000002_messages_appointment_link.sql`, plus a partial index `WHERE related_appointment_id IS NOT NULL`. Lets booking-related SMS (acknowledgment, confirmation, reminder) link back to the originating appointment so the dashboard can surface failed acks via `SELECT ... WHERE status = 'failed' AND related_appointment_id IS NOT NULL`.
