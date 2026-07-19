# ShopPilot — System Architecture

This is the **current shape of the system** — what exists, where it lives, and what invariants apply. For history (what shipped when), see [`PROGRESS.md`](./PROGRESS.md). For the roadmap (what's next), see [`../SHOPPILOT_ROADMAP.md`](../SHOPPILOT_ROADMAP.md). For DB columns, see [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md). For design tokens, see [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

## Phases shipped

- **Phase 1 (Foundation): COMPLETE** — auth, customers, vehicles, jobs, line items, kanban/list/calendar dashboards, Wix data import
- **Phase 2 (Payments & Comms): COMPLETE** — Stripe invoicing + estimates + Quo SMS + Terminal + Resend email
- **Phase 3 (AI Assistant): COMPLETE** — Claude API (Haiku 4.5), 46 tools, streaming chat
- **Phase 4 (next):** Operational Excellence — vehicle history, work orders, labor rates, inventory, accounting

## Deployment

- Hosted on Vercel at `https://shop-pilot-rosy.vercel.app`, auto-deploy from `master`
- GitHub: `https://github.com/tomdro61/shop-pilot` (private)

---

## Customers, Jobs, Estimates, Invoices

- Core UI and server actions built: auth, customers, vehicles, jobs, line items, dashboard, reports, team management
- Customer list: server-side pagination (50 per page) with URL params, handles 3,000+ imported contacts
- **RO numbers** — auto-assigned sequential repair order numbers (RO-0001 format) via PostgreSQL `ro_number_seq`
- **Printable Repair Order** at `/jobs/[id]/print` — shop header, customer/vehicle info, itemized line items, tax, totals
- **Service categorization** — line-item categories are the single source of truth. Job-level `category` column exists in DB but is no longer set or displayed. "Add Service" flow on line items lets you pick a category, then add labor/parts under it.
- **Estimates** — public approval page fully working (live mode). Estimates can be deleted and recreated to pick up updated job line items. Estimate line items carry categories and are grouped by service category on both internal and customer-facing views.

## Payments

### Stripe Terminal (WisePOS E)
- Server-driven, fully operational
- 3 API routes: `/api/terminal/pay`, `/status`, `/cancel` — all gated by `requireStaff()` (manager or tech; Session 63 closed a prior no-auth gap)
- TerminalPayButton on job detail
- Quick Pay page at `/quick-pay` with numpad UI + presets. **Accessible to techs** (in `TECH_ALLOWED`), not just managers — Session 63, so counter staff can take payments while managers log the jobs
- Quick Pay **defers job creation until the payment succeeds**: `POST /api/quick-pay/charge` only arms the reader (PaymentIntent carries amount/note/category as metadata, no job yet). On success the job + line item are created atomically by the `record_quick_pay_job` Postgres function (service-role, RLS-locked), called idempotently from both the client status poll and the Stripe webhook via a unique index on `jobs.stripe_payment_intent_id`. A canceled/abandoned/failed charge creates nothing — no more orphaned completed-unpaid jobs. `requireStaff()` gates the charge route; techs have no RLS INSERT on `jobs`, which is why the write lives in the service-role RPC. (The old `POST /api/quick-pay`, which created the job up front, is kept as a deprecated shim for stale tabs during deploys — slated for removal.)
- Reader registered ("Front-desk 1"), auto-marks jobs as paid on card tap
- Walk-in sentinel customer (`00000000-...`) for Quick Pay jobs; these jobs default `charge_sales_tax = false` (flat all-in counter amount), so a later itemized reconciliation sums to exactly what was collected

### Card on File (Session 36/37, built for DriveWhip B2B)
- Saved-card + merchant-initiated charge flow
- `PaymentMethodsSection` on customer profile uses Stripe Elements + SetupIntent. **Default PM lives in Stripe** (`invoice_settings.default_payment_method`), no local denormalization
- `chargeCardOnFile(jobId)` action — creates Stripe invoice with `default_payment_method` + `auto_advance:false`, finalizes, inserts local invoices row, then `invoices.pay({off_session:true})`
- Reuses existing `invoice.paid` webhook for receipt email/SMS — no new receipt code
- **SCA handling covers both** `authentication_required` (PaymentIntent.confirm path) and `invoice_payment_intent_requires_action` (the wrapping that `invoices.pay({off_session:true})` actually throws — runtime testing caught this; static review missed it)
- Ambiguous failures (network/API errors, not declines) leave state intact for the webhook to reconcile rather than rolling back
- Webhook is idempotent (status guard + atomic conditional flip)
- 53 unit tests cover preflight guards, decline/SCA mapping, DB-insert rollback, totals parity, idempotency keys, `getPaymentMethod` degradation, `removePaymentMethod` partial-failure observability
- **Required env**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live-mode pk_, must match the Stripe account of `STRIPE_SECRET_KEY` — sandbox-mismatch produces 400 on SetupIntent load)
- AI tool deferred to v2; system-prompt redirects fleet-charge requests to the manager's UI button

## Messaging

### Quo SMS
- Fully wired (send/receive/webhook), triple-line routing:
  - Shop — 617-996-8371 (`QUO_SHOP_PHONE_NUMBER`)
  - Parking — 978-684-9254 (`QUO_PHONE_NUMBER`)
  - APB — 978-644-9391 (`QUO_APB_PHONE_NUMBER`)
- Auto-texts estimate/invoice links on shop line
- Lot-specific confirmation SMS for all 5 lots
- Quo contact auto-creation (via `createOrUpdateQuoContact`, deduped by phone) on parking, estimate-request, AND online-booking submissions. No tag is actually set — the "Parking tag" in older notes was never implemented.
- 7 SMS templates in `src/lib/messaging/templates.ts` (reservation confirmation is lot-aware)
- Phone line tracked on all messages (`messages.phone_line`)
- **Blocked on A2P registration** (waiting on number port + paid plan)

### Resend Email
- Branded HTML templates (estimate, receipt, generic)
- Auto-send on estimate send + invoice paid
- AI `send_email` tool
- Test mode with console logging
- Delivery status tracking in `messages` table

## AI Assistant
- Conversational chat at `/chat` with 46 tools covering all CRUD + SMS + email + settings + parking operations
- Streaming SSE, floating chat bubble on all pages
- Model: Claude Haiku 4.5 (configurable in `src/app/api/ai/chat/route.ts`)
- Tool definitions live in `src/lib/ai/tools.ts`
- **Confirmation pattern** — any action that involves money or external communication must include a confirmation step. System prompt enforces this.

## Dashboard, Inbox, Reports

### Dashboard
Two-column layout (`lg:grid-cols-[2fr_1fr]`). **Left column**: slim greeting header, KPI cluster (Today's Revenue / Week / Month + State/TNC compact cards), then **Action Center** (Tasks scratchpad full-width on top; needs-attention alert grid with 6 alert types — Unassigned/Quote Requests/Estimates Sent/DVIs Ready/Parking Leads/Aged Parts — each linking to `/inbox?tab=...`). **Right column** ("Today's View" aside): Parking · Today card, Scheduled Today card, then a vertical stack of 4 Shop Floor sections — Not Started (red), Waiting for Parts (amber), In Progress (blue), Completed Today (emerald, filtered to `date_finished = today`). Each Shop Floor section uses `ShopFloorColumn` (full-width card, not a horizontal kanban column).

Revenue cards include inspection revenue from `daily_inspection_counts`; job line items with `category = "Inspection"` are excluded from revenue to prevent double-counting. Parking · Today scoped to `MANAGED_PARKING_LOTS` only and reports an "X/Y prepared" line under Pickups (prepared = checked_out OR lock_box_number staged).

### Tasks scratchpad
- `tasks` table + `lib/actions/tasks.ts`
- Manager-only personal todos surfaced in the Action Center
- RLS on `tasks_select_authenticated` is permissive (any authenticated user reads), but `getOpenTasks` returns `[]` for non-managers as the intended UX
- Mutations call `revalidatePath("/", "layout")` so the sidebar inbox badge stays fresh

### Inbox (`/inbox`)
- Single destination for every needs-attention alert from the dashboard
- Type-accent filter chips per category (matches the Tone palette: amber Unassigned, blue Quotes, indigo Estimates, violet DVIs, emerald Parking, red Parts/Payments)
- Section cards with row dividers

### Reporting Suite (5 reports)
- **Revenue Overview** (`/reports/revenue`) — KPI cards, category/tech breakdowns, profitability table, Fleet A/R aging
- **Tax Summary** (`/reports/tax`) — Monthly taxable sales and MA sales tax by year
- **Trends Explorer** (`/reports/trends`) — 11 metrics charted over time (day/week/month). Recharts BarChart. Revenue includes inspections.
- **Service Mix Deep-Dive** (`/reports/service-mix`) — Per-category trends. "All Categories" stacked bar chart or single-category drill-down. 6 metrics. Top 8 categories + "Other".
- **Tech Scoreboard** (`/reports/tech`) — Per-tech trends. "All Techs" stacked chart or single-tech drill-down. 6 metrics. Reuses `CategoryDeepDive` component.

Shared bucketing helpers in `src/lib/utils/trend-buckets.ts` (`buildBucketKeys`, `getBucketKey`, `getDateRange`, `timestampToDateET`). `CategoryDeepDive` component (`src/components/dashboard/category-deep-dive.tsx`) generalized with `groupLabel`/`basePath` props for reuse across category and tech reports.

### Revenue Reporting utility
- `src/lib/utils/revenue.ts` — `sumJobRevenue()` excludes inspection-category items (`INSPECTION_CATEGORIES` set: "Inspection", "State Inspection", "TNC Inspection"); `calcInspectionRevenue()` computes inspection revenue/cost/profit
- Both dashboard and reports use these
- State Inspection cost: $11.50/unit (`INSPECTION_COST_STATE`)
- Reports show "State Inspection" and "TNC Inspection" as rows in Revenue by Category and Service Profitability

## Catalog & Presets

### Job Presets
Reusable templates with pre-filled line items, managed at `/presets`.

### Parts & Labor Catalog
- Saved individual parts and labor items with default pricing at `/settings/catalog`
- Searchable when adding line items to jobs (both on job detail page and job creation form)
- "Save to Catalog" button on line items for building up the catalog over time
- Case-insensitive duplicate detection
- Usage count tracking for popularity sorting
- 3 AI tools: `search_catalog`, `add_catalog_items_to_job`, `manage_catalog_item`
- Seeded with 30 common auto repair items

## Shop Settings (`/settings/rates`)
- Configurable tax rate, shop supplies fee (4 calculation methods + cap), environmental/hazmat fee
- Both fees can be scoped to specific job categories (null = all categories, backward compatible)
- All totals computed via shared `calculateTotals()` utility
- Fees default to disabled
- **Tax rule:** parts + shop supplies are taxable; labor and hazmat are not
- **MA sales tax:** 6.25% on parts only, labor tax-exempt. `MA_SALES_TAX_RATE` constant used in Stripe invoices and estimate approval

## Part Cost Tracking
- Optional `cost` (wholesale price) field on part line items
- Reports compute actual gross profit when cost is available, fall back to 40% margin estimate when not
- Cost data coverage % shown on reports
- **Cost is never exposed to customers** (invoices, estimates, print RO all use retail price only)

## Airport Parking
- Dashboard at `/parking` managing 4 lots (Broadway Motors, Airport Parking Boston 1, Airport Parking Boston 2, Boston Logan Valet)
- 3 parking types: `self_park`, `shuttle`, `valet`
- 3 views: Today (arrivals/pickups/parked), Service Leads (parking customers interested in repairs), All Reservations
- Shuttle reservations show sky-blue "Shuttle" badge on cards and detail page
- **Public API** at `/api/parking/submit` accepts form POSTs with CORS, rate limiting (per-IP), honeypot spam protection, dedup (phone + date + lot within 5 min)
- Wix webhook bridge at `/api/webhooks/wix-parking` — **deactivated** (Wix redirects to BroadwayMotorsMA.com forms). Code retirement still pending.
- 5 public forms on BroadwayMotorsMA.com: self-park, shuttle, APB1, APB2, valet
- Lot-specific confirmation pages with parking instructions
- 6 AI tools for parking operations
- Parking reservations auto-link to `customers` table via `findOrCreateParkingCustomer()` (dedup by email, then phone). Customer detail page shows "Parking History" section.
- **Checkout flow** with lockbox selection modal (8 physical lockboxes) — sends pickup SMS with box number + code, or in-person checkout without SMS
- "Send Specials" button for upselling services to checked-in customers
- Reservation detail page shows two-column layout with customer/vehicle cards, trip timeline, and Key Pickup section (lockbox number + code or "in person")
- Parking dashboard compact cards show lockbox info for checked-out reservations

## Online Appointment Booking (LIVE in production; Sessions 43–60)

Cross-project public form on BroadwayMotorsMA.com `/book` posts to ShopPilot's `/api/appointments/submit`. Same shape as parking + quote-requests; the manager later confirms in `/appointments`. Detailed locked spec at the monorepo root: `BOOKING_PRD.md` + `BOOKING_TECHNICAL_PLAN.md`.

**Status (2026-06): LIVE in production.** Beyond the original spec, bookings now collect a **required "License Plate or VIN"** field (split client-side into `vehicle_vin`/`license_plate`; Session 59) and create a **Quo contact** on submit (`appointments.quo_contact_id`, with an "Open in Quo" link on the detail page; Session 60) — the same Quo-contact pattern parking + estimates use.

**V1 scope cut (2026-05-28):** per-day capacity caps (table + DB trigger + capacity library), the unified planning calendar, and the capacity-aware date picker were all removed from V1. Plain date picker (Sundays + Saturday-afternoon disabled); manager picks a specific time at confirm. Capacity work deferred to V1.5+ once real volume data justifies it.

**Shipped internals:**
- Schema: `appointments`, `vin_decode_cache`, `messages.related_appointment_id` column, `booking-photos` storage bucket
- Helpers in `src/lib/appointments/`: `findOrCreateBookingCustomer` (sets `customer_type: 'retail'` — NOT 'parking'), `findOrCreateVehicle` (new — VIN-first then customer+Y/M/M via ilike), `processBookingPhoto` (magic-byte signature check + sharp EXIF strip + bucket upload)
- VIN decode: `src/lib/vin/decode.ts` with DB cache via `vin_decode_cache` (NOT Next.js fetch cache — silently ignored in API routes)
- Zod schema in `src/lib/validators/appointments.ts` with Sunday + Saturday-afternoon refines, dynamic `vehicle_year.max`, description `btrim` ≥ 20
- API: `POST /api/appointments/submit` — CORS allowlist + 5/min/IP rate limit + multipart parse + Zod validate + honeypot + three-key dedup (`phone + preferred_date + preferred_time_window` within 5 min) + EXIF-stripped photo upload + find-or-create customer + find-or-create vehicle + NHTSA VIN decode + appointment insert with snapshots
- Client-generated UUID acts as both the appointment row's PK AND the storage folder prefix (`booking-photos/{uuid}/{index}.{ext}`) — eliminates the photo-upload-before-row-insert orphan race

**Not yet shipped:**
- Step 3 — SMS templates + post-submit handler + `logOutboundSms` helper extraction + Saturday 1pm SMS-copy cutoff
- Step 4 — `/appointments` inbox (the work queue) + detail page + confirm-with-specific-time action
- Step 5 — `/appointments/calendar` read-only confirmed-only calendar (reuses `JobsCalendarView` pattern as-is, no refactor)
- Step 6 — dashboard Today integration (pending alert + today's confirmed)
- Step 7 — convert-to-job action
- Step 8 — 24h reminder cron + photo orphan cleanup cron
- Step 9 — booking metrics tile
- Steps 10–11 — website `/book` page + multi-step form + hero/nav/sticky CTAs + after-hours banner
- Step 12 — end-to-end verification

**Operational signals until step 6 wires the dashboard:**
- `[booking-needs-link]` — `console.warn` from `insertAppointment` when find-or-create-customer or -vehicle returns null. Appointment still saves with `customer_id` / `vehicle_id` null; the route returns `warning: "manual_link_required"`. Grep Vercel logs.
- `[booking-storage-error]` — `console.error` from `processBookingPhoto` on upload failure (bucket misconfigured, RLS denied, etc.). The route returns 500 (not 400 — server fault, not customer's file).

## Vercel Cron (Session 38)
- `vercel.json` declares schedules → Vercel auto-calls `/api/cron/*` routes
- Auth via `requireCronSecret(request)` in `src/lib/cron/auth.ts` — checks `Authorization: Bearer ${CRON_SECRET}` (auto-injected by Vercel when crons are detected; not manually set). Extracted from the inline check once the second real route shipped.
- Pipeline-proving endpoint at `src/app/api/cron/health/route.ts` — daily 14:00 UTC
- **Parking prep reminder** at `src/app/api/cron/parking-prep-reminder/route.ts` — nightly at 23:00 UTC (7 PM ET in summer / 6 PM ET in winter). Texts `INTERNAL_NOTIFICATION_PHONES` (owner + brother's cells) when a Broadway Motors car is due for pickup during the closed window (5 PM–9 AM) but isn't checked out with a lockbox code sent. Silent when all clear; fails loud (500 + Sentry) on query error or missing Quo config; `console.log`s every run (even the silent one) so Vercel runtime logs prove it fired. Window/classification logic in `src/lib/parking/prep-reminder.ts` (unit-tested).
- **Cron-time-vs-DST lesson** (Session 66, learned the hard way): Vercel cron is UTC-only, delivery is not minute-precise, AND the Hobby plan caps at 2 cron jobs. The original design used two UTC entries (`0 23` + `0 0`) straddling 7 PM ET plus a `nowET().getHours() === 19` gate to hold 7 PM year-round — but the gate skipped whenever delivery drifted out of the 7 PM hour, and the 3rd cron entry blew the Hobby cap so the parking crons may never have registered. Result: zero texts for three nights, including a real miss. Fix: ONE entry at `0 23` and NO hour gate — it runs whenever it fires, accepting a 1-hour winter drift (6 PM is still after close). **Prefer accepting DST drift over an exact-hour gate for once-daily crons, and keep total cron count ≤ 2 unless on Pro.**
- Real cron jobs (Maintenance Reminders, DVI deferred-work follow-ups, etc.) plug in by adding new `/api/cron/*` routes + `vercel.json` entries
- Pattern for new routes: kebab-case `source: "cron-<name>"` Sentry tag; reuse `requireCronSecret` for auth
- **Crons fire on production deployments only**, not preview/staging

## Shared modules

- `src/lib/ui/alert-tone.ts` — `Tone` union (`amber|blue|indigo|violet|emerald|red`) + `TONE_CLASSES` Record with `tile`, `bar`, `card`, `count`, `chip` strings. Single source of truth for alert/needs-attention surfaces.
- `src/lib/actions/_types.ts` — `ActionResult<T>` discriminated union for new server actions. Older actions still use `{ success | error }`.
- `src/lib/utils/parking.ts` — `hasPendingService(reservation)`. Used by dashboard, inbox, and sidebar count.
- Vitest test framework wired (`vitest.config.ts`, `npm test`/`test:watch`/`test:coverage`)

## Observability

- **Sentry** — `@sentry/nextjs` wired with tunnel route `/monitoring`, source maps uploaded on every Vercel build, errors tagged with commit SHA via release config. Project: `shop-pilot.sentry.io`.
- **Sentry MCP** available — install per-machine with `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` (OAuth on first use, no token to manage)

## Other utilities
- Wix import: one-time script (`scripts/import-wix-customers.ts`) with filtering, dedup, dry-run mode

---

## Outstanding work

### Production readiness
- ~~Supabase Pro ($25/mo)~~ DONE
- Upgrade Vercel to Pro ($20/mo) — SLA, higher function duration limits for AI chat
- ~~Sentry error monitoring~~ DONE
- Add uptime monitoring (BetterUptime or UptimeRobot, free)
- Set up weekly database backup export of critical tables (customers, jobs, invoices)
- Audit environment variables — ensure no secrets committed or exposed

### Remaining integration work
- A2P registration on Quo (blocked on number port + paid plan)
- Retire Wix webhook bridge code (redirects confirmed, automation deactivated)

### Optional enhancements
- Voice input (Web Speech API or Whisper)
- Chat history persistence in Supabase (currently in-memory, resets on refresh)
