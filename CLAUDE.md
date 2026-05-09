# ShopPilot - AI-Powered Shop Management System

## Authoritative companion docs

- **[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)** — design tokens, component primitives, layout patterns. Owns everything visual. Read this before making UI changes; do **not** redocument design rules in CLAUDE.md.
- **[`../SHOPPILOT_ROADMAP.md`](../SHOPPILOT_ROADMAP.md)** — master roadmap: strategy, OS architecture, feature phases (0–6), agent platform, costs, metrics. Predecessor docs archived in `../archive/`.
- **[`UI-AUDIT.md`](./UI-AUDIT.md)** — running list of UI consistency findings. Mark closed as fixed.
- **[`REVIEW-FINDINGS.md`](./REVIEW-FINDINGS.md)** — running list of code-review findings.
- **[`PROGRESS.md`](./PROGRESS.md)** — session log. Read at start of every new session.

The OS-feel of ShopPilot (Open Loops, Customer Spine, Estimate-as-separate-from-Job) is defined in §3 of the master roadmap. Phase 0 is the foundation refactor.

## What We're Building

ShopPilot is a custom shop management system for Broadway Motors, an independent auto repair shop in Revere, MA. It replaces a fragmented Notion + Wix + manual workflow with a single AI-first platform. The defining feature is a conversational AI assistant (Claude API with function calling) that lets the shop manager run the entire operation — customers, jobs, estimates, invoices, payments, messaging — from their phone via voice or text commands, without touching a laptop.

**Core value proposition:** Enterprise shop management capabilities (Tekmetric, Shop Monkey, etc.) at under $50/month instead of $300-$500/month, with a voice-first mobile interface none of the enterprise tools offer.

**Who uses it:**
- **Shop Manager / Co-Owner** — primary users, full access via AI chat + web dashboard
- **Technicians** — view assigned jobs, update status, log notes (no financials)
- **Customers** — receive estimates/invoices via SMS/email, approve estimates, pay via Stripe link (no login)

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js (React) | App Router, server components, mobile-first responsive design |
| Backend/DB | Supabase (PostgreSQL) | Auth, database, real-time subscriptions, file storage, Row Level Security |
| AI Assistant | Claude API (Anthropic) | Function calling / tool use for all CRUD and external operations |
| Payments | Stripe | Invoicing, webhooks, Terminal (WisePOS E) for in-person card payments, Quick Pay for walk-ins |
| SMS | Quo (formerly OpenPhone) API | Integrated — dual-line routing (shop + parking), send/receive/webhook, Quo contact creation, 7 templates. Blocked on A2P registration. |
| Email | Resend | Integrated — branded HTML templates for estimates + receipts, AI send_email tool, test mode fallback. Needs domain verification for live sending. |
| Hosting | Vercel (free tier) | Auto-deploy from Git, edge functions, free SSL |
| Parts (future) | Parts Tech API (TBD) | Needs API access investigation |
| Accounting (future) | Wave Apps or QuickBooks API | TBD which one |

## Database Schema

Core tables in Supabase PostgreSQL:

- **customers** — id, first_name, last_name, phone, email, address, notes, customer_type (retail/fleet/parking), fleet_account, stripe_customer_id, created_at
- **vehicles** — id, customer_id, year, make, model, vin, license_plate, mileage, color, notes
- **jobs** — id, customer_id, vehicle_id, status, title, category (deprecated — exists in DB but no longer set/displayed), assigned_tech, date_received (DATE, surfaced in UI as "Drop-off date"), date_finished, scheduled_at (timestamptz, nullable — customer-agreed drop-off time, anchored to date_received via cascade in updateJobFields), notes, payment_status, payment_method, mileage_in, stripe_payment_intent_id, ro_number (auto-assigned sequential integer via `ro_number_seq`)
- **job_line_items** — id, job_id, type (labor/part), description, quantity, unit_cost, total, cost (nullable — wholesale price for parts, used for profit margin tracking), part_number, category (single source of truth for service categorization)
- **job_presets** — id, name, category, line_items (JSONB), created_at
- **estimates** — id, job_id, status (draft/sent/approved/declined), sent_at, approved_at, declined_at, approval_token, tax_rate, created_at
- **estimate_line_items** — id, estimate_id, type, description, quantity, unit_cost, total, cost (nullable — wholesale price for parts, mirrors job_line_items.cost; added Session 38 to fix Feb 2026 drift), part_number, category. Schema-parity with job_line_items enforced via vitest expectTypeOf check at `src/types/line-items-parity.test.ts`.
- **invoices** — id, job_id, stripe_invoice_id, stripe_hosted_invoice_url, status (draft/sent/paid), amount, paid_at
- **messages** — id, customer_id, job_id, channel (sms/email), direction (in/out), body, status (sent/failed), sent_at, phone_line (text, nullable — 'shop' or 'parking')
- **catalog_items** — id, type (labor/part), description, default_quantity, default_unit_cost, default_cost (nullable, wholesale), part_number, category, is_active (boolean), usage_count (int), created_at, updated_at. Trigram-indexed description for fast search. Seeded with 30 common items.
- **lock_boxes** — id, box_number (int, unique), code (text), created_at. 8 physical lockboxes for parking key handoff.
- **users** — id, name, email, role (manager/tech), auth_id (Supabase Auth linked)
- **shop_settings** — single-row config: tax_rate, shop_supplies_enabled, shop_supplies_method (percent_of_labor/parts/total/flat), shop_supplies_rate, shop_supplies_cap, shop_supplies_categories (jsonb, nullable — scopes fee to specific job categories), hazmat_enabled, hazmat_amount, hazmat_label, hazmat_categories (jsonb, nullable — scopes fee to specific job categories)
- **parking_reservations** — id, first_name, last_name, email, phone, drop_off_date, drop_off_time, pick_up_date, pick_up_time, make, model, license_plate, lot (text), confirmation_number, services_interested (text[]), liability_acknowledged, status (parking_status enum), checked_in_at, checked_out_at, spot_number, lock_box_number (int, nullable), staff_notes, customer_id (FK to customers, nullable, ON DELETE SET NULL), color (text, nullable), parking_type (text, nullable, default 'self_park' — values: self_park/shuttle/valet), departing_flight (text, nullable), arriving_flight (text, nullable), specials_sent_at (timestamptz, nullable — set when parking specials SMS sent), created_at, updated_at. Linked to customers via `findOrCreateParkingCustomer()` on form submit.

**Job statuses:** Not Started → Waiting for Parts → In Progress → Complete
**Payment tracked separately:** payment_status (unpaid → invoiced → paid / waived), payment_method (stripe/cash/check/ach/terminal)
**Parking statuses:** reserved → checked_in → checked_out (or no_show / cancelled)

## Project Structure (Target)

```
shop-pilot/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Login/auth pages
│   │   ├── (dashboard)/        # Main app layout
│   │   │   ├── customers/      # Customer CRUD
│   │   │   ├── vehicles/       # Vehicle management
│   │   │   ├── jobs/           # Job tracker + dashboard views
│   │   │   ├── estimates/      # Estimate builder
│   │   │   ├── invoices/       # Invoice management
│   │   │   ├── team/           # Team/technician management
│   │   │   ├── messages/       # Communication log
│   │   │   └── parking/        # Airport parking management (3 lots)
│   │   │       └── [id]/       # Reservation detail page
│   │   ├── chat/               # AI assistant interface
│   │   └── api/                # API routes
│   │       ├── ai/             # Claude API integration
│   │       ├── parking/        # Public parking form submission endpoint
│   │       ├── stripe/         # Stripe webhooks + payment links
│   │       ├── messaging/      # Quo (SMS) + Resend (email) integrations
│   │       └── ...
│   ├── components/             # Shared React components
│   │   ├── ui/                 # Base UI components (shadcn/ui)
│   │   ├── forms/              # Form components
│   │   ├── dashboard/          # Dashboard-specific (board, calendar, list views)
│   │   ├── parking/            # Parking dashboard components (tabs, views, actions, cards)
│   │   └── chat/               # AI chat interface components
│   ├── lib/                    # Utilities and shared logic
│   │   ├── supabase/           # Supabase client, helpers, types
│   │   ├── stripe/             # Stripe helpers
│   │   ├── ai/                 # Claude tool definitions and handlers
│   │   └── utils.ts
│   └── types/                  # TypeScript type definitions
├── supabase/
│   ├── migrations/             # Database migrations
│   └── seed.sql                # Seed data / Wix import
├── public/                     # Static assets
└── ...config files
```

## Implementation Plan

### Phase 1: Foundation (Weeks 1-2) — COMPLETE

Replaced Notion for job tracking. Core data model + UI shipped (auth, customers, vehicles, jobs, line items, kanban/list/calendar views, Wix data import).

### Phase 2: Payments & Communication (Weeks 3-4)

**Goal:** Replace Wix for payments and manual texting/calling.

- Stripe integration: create payment links from invoices, set up webhooks for auto-status updates
- Estimate builder: itemized labor + parts, tax calculation, send to customer for digital approval
- Invoice generation from completed jobs
- Quo (formerly OpenPhone) API integration for SMS from shop's real number (transitioning from Wix — requires Quo signup + number port)
- Resend integration for transactional email
- Communication log per customer (all SMS/email in one timeline)
- Message templates (estimate ready, car ready, payment reminder)

### Phase 3: AI Assistant (Weeks 5-6) — COMPLETE

**Goal:** Voice/text-first shop management from a phone.

- ~~Claude API integration with function calling (tool use)~~ DONE — `@anthropic-ai/sdk`, Haiku 4.5
- ~~Define full tool suite: customer lookup, job CRUD, estimate/invoice generation, messaging, status updates~~ DONE — 37 tools in `src/lib/ai/tools.ts`
- ~~Mobile-optimized chat interface~~ DONE — `/chat` page + floating chat bubble
- ~~Confirmation step before any financial action (invoice, payment, etc.)~~ DONE — system prompt enforces confirmation pattern
- Voice input (Web Speech API or Whisper) — deferred
- Chat history persistence — deferred (currently in-memory)
- Thorough real-world testing with actual shop operations — ongoing

### Phase 4: Operational Excellence (Weeks 7-12)

**Goal:** Tier 2 features — build based on what causes the most friction during daily use.

- Vehicle service history timeline
- Formal work orders / repair orders with detailed line items
- Labor rate management
- Parts lookup and ordering (Parts Tech or manual)
- Basic inventory tracking
- Reporting suite (revenue, job counts, margins, charts)
- Accounting sync (Wave or QuickBooks)
- Warranty tracking
- Digital inspections with photo upload

### Phase 5: Advanced (Months 4-6)

- Scheduling and bay capacity management
- Tech productivity metrics
- Customer portal (read-only vehicle history, estimates, invoices)
- Document and photo storage (S3 or Supabase Storage)
- Automated workflows (reminders, follow-ups)
- Marketing and retention (service reminders, customer lifetime value)

## Technical Concerns & Notes

### Must Address Before Building
- ~~**MA tax calculation:**~~ RESOLVED — 6.25% on parts only, labor tax-exempt. Implemented as `MA_SALES_TAX_RATE` constant used in Stripe invoices and estimate approval.
- **Quo (formerly OpenPhone) API access:** Shop currently uses Wix for SMS — transitioning to Quo. Need to sign up for Quo (Business plan or higher for API access), port the shop's existing number (1-4 weeks), and confirm API capabilities. Quo API supports sending SMS, receiving webhooks, and contact management. Rate limit: 10 req/sec. No MMS via API. SMS costs $0.01/segment (prepaid credits).
- **Supabase free tier limits:** 500MB storage, 50K rows. Should be fine for a single shop initially but monitor usage. Plan for when/if we need to upgrade ($25/mo Pro plan).

### Architecture Decisions
- **Use Next.js App Router** (not Pages Router) — server components reduce client-side JS, better for mobile performance.
- **shadcn/ui for components** — copy-paste components (not a dependency), fully customizable, works great with Tailwind.
- **Supabase client-side + server-side** — use `@supabase/ssr` for server components, `@supabase/supabase-js` for client. RLS handles authorization at the database level.
- **AI tool definitions** — keep Claude's tool/function definitions in a single file (`src/lib/ai/tools.ts`) so they're easy to maintain and extend. Each tool maps to a server action or API call.
- **Confirmation pattern for AI** — any action that involves money or external communication must include a confirmation step. The AI proposes, the user confirms.

### Things to Be Careful About
- **Never expose Supabase service role key** to the client. Use anon key + RLS for client-side, service role only in API routes.
- **Stripe webhook signature verification** — always verify webhook signatures to prevent spoofed events.
- **Phone number formatting** — standardize to E.164 format on input for Quo API compatibility.
- **Optimistic UI** — for the Kanban board drag-and-drop, update UI immediately and reconcile with server. Supabase real-time can help here.

### Open Questions from PRD (Need Answers)
1. Wave Apps vs. QuickBooks for accounting? (Wave is free, QuickBooks has better API)
2. Keep Wix for public website or migrate that too? (SMS moved to Quo, website TBD)
3. Parts Tech API availability for independent shops?
4. ~~Stripe Terminal hardware preference?~~ ANSWERED — WisePOS E, server-driven integration built
5. Should the AI assistant have its own phone number customers can text, or internal-only?
6. ~~What are the MA-specific tax rules for auto repair labor vs. parts?~~ ANSWERED — 6.25% on parts only, labor tax-exempt. Implemented in Stripe invoice + estimate builder.

## Session Workflow

### After Every Change

Whenever code is committed, update **all** of the following that are affected:

1. **`PROGRESS.md`** — Add a session entry (or update the current one) with: date, what was completed, new/modified files, what's not done yet, what's next, known issues
2. **`CLAUDE.md` (this file)** — Update the **Current Status** section if the change affects project status, phases, or capabilities. Update other sections (Tech Stack, Database Schema, etc.) if the change introduces new infrastructure, tables, env vars, or architectural patterns.
3. **`src/types/supabase.ts`** — If a migration was created, update the TypeScript types to match the new schema (add columns, enum values, etc.)

**Do not wait until the end of a session.** Update docs as part of each commit's workflow.

### At the Start of a New Session

Read `PROGRESS.md` first to pick up where we left off.

## Current Status

**Phase 1: COMPLETE** — Deployed and live on Vercel
**Phase 2: COMPLETE** — Stripe invoicing + estimates + Quo SMS + Terminal + Resend email all built
**Phase 3: COMPLETE** — AI Assistant with Claude API, 46 tools, streaming chat UI

> **Per-session changelog lives in [`PROGRESS.md`](./PROGRESS.md).** Read it at the start of every new session for what shipped when, in what file, and why. Don't duplicate that history here — this section is for the *current* shape of the system, not how it got there.

- All core UI and server actions built: auth, customers, vehicles, jobs, line items, dashboard, reports, team management
- **Design system:** Stitch design language — Inter font, oklch palette, `rounded-md` canonical, `shadow-card` token, color semantics anchored on emerald/amber/red/blue/violet/stone. Layout patterns include structured metric chunks, 3px top accent strips, line-items-as-grouped-sections, Open Loops single-line rows, customer = violet identity. **Full spec lives in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) — that's the authoritative source.** This file should NOT accumulate design tokens; update DESIGN_SYSTEM.md instead.
- **Service categorization:** Line-item categories are the single source of truth. Job-level `category` column exists in DB but is no longer set or displayed. "Add Service" flow on line items lets you pick a category, then add labor/parts under it.
- Stripe invoicing + estimate builder with public approval page fully working (live mode). Estimates can be deleted and recreated to pick up updated job line items. Estimate line items carry categories and are grouped by service category on both internal and customer-facing views.
- **Vercel Cron foundation** (Session 38): `vercel.json` declares schedules → Vercel auto-calls `/api/cron/*` routes. Auth via `Authorization: Bearer ${CRON_SECRET}` (auto-injected by Vercel when crons are detected; not manually set). Pipeline-proving endpoint at `src/app/api/cron/health/route.ts` — daily 14:00 UTC. Real cron jobs (Maintenance Reminders, DVI deferred-work follow-ups, etc.) plug in by adding new `/api/cron/*` routes + `vercel.json` entries. Pattern for new routes: kebab-case `source: "cron-<name>"` Sentry tag; once 2+ routes ship, extract auth check to `src/lib/cron/auth.ts`. **Crons fire on production deployments only**, not preview/staging.
- **Card on File** (Session 36/37): saved-card flow + merchant-initiated charge for B2B customers (built primarily for DriveWhip). `PaymentMethodsSection` on the customer profile uses Stripe Elements + SetupIntent to save a card; default PM lives in Stripe (`invoice_settings.default_payment_method`), no local denormalization. `chargeCardOnFile(jobId)` action creates a Stripe invoice with `default_payment_method` + `auto_advance:false`, finalizes, inserts the local invoices row, then `invoices.pay({off_session:true})`. Reuses existing `invoice.paid` webhook for receipt email/SMS — no new receipt code. SCA covers both `authentication_required` (PaymentIntent.confirm path) and `invoice_payment_intent_requires_action` (the wrapping that `invoices.pay({off_session:true})` actually throws — runtime testing caught this; static review missed it). Ambiguous failures (network/API errors, not declines) leave state intact for the webhook to reconcile rather than rolling back. Webhook is idempotent (status guard + atomic conditional flip). 53 unit tests cover preflight guards, decline/SCA mapping, DB-insert rollback, totals parity, idempotency keys, getPaymentMethod degradation, removePaymentMethod partial-failure observability. **Required env**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live-mode pk_, must match the Stripe account of `STRIPE_SECRET_KEY` — sandbox-mismatch produces 400 on SetupIntent load). AI tool deferred to v2; system-prompt redirects fleet-charge requests to the manager's UI button.
- Stripe Terminal: server-driven WisePOS E integration, fully operational. 3 API routes (`/api/terminal/pay`, `/status`, `/cancel`), TerminalPayButton on job detail, Quick Pay page at `/quick-pay` with numpad UI + presets. Reader registered ("Front-desk 1"), auto-marks jobs as paid on card tap. Walk-in sentinel customer (`00000000-...`) for Quick Pay jobs. `stripe_payment_intent_id` column on jobs. `terminal` value in `payment_method` enum.
- Quo SMS: fully wired (send/receive/webhook), triple-line routing — shop (617-996-8371, `QUO_SHOP_PHONE_NUMBER`), parking (978-684-9254, `QUO_PHONE_NUMBER`), APB (978-644-9391, `QUO_APB_PHONE_NUMBER`). Auto-texts estimate/invoice links on shop line. Lot-specific confirmation SMS enabled for all 5 lots. Quo contact auto-creation for parking customers with "Parking" tag. 7 SMS templates in `src/lib/messaging/templates.ts` (reservation confirmation is lot-aware). Phone line tracked on all messages (`phone_line` column). Blocked on A2P registration.
- Resend Email: full transactional email — branded HTML templates (estimate, receipt, generic), auto-send on estimate send + invoice paid, AI `send_email` tool, test mode with console logging, delivery status tracking in `messages` table
- AI Assistant: conversational chat at `/chat` with 46 tools covering all CRUD + SMS + email + settings + parking operations, streaming SSE, floating chat bubble on all pages
- AI Model: Claude Haiku 4.5 (configurable in `src/app/api/ai/chat/route.ts`)
- Job Presets: reusable templates with pre-filled line items, `/presets` management page
- **Parts & Labor Catalog:** Saved individual parts and labor items with default pricing at `/settings/catalog`. Searchable when adding line items to jobs (both on job detail page and job creation form). "Save to Catalog" button on line items for building up the catalog over time. Case-insensitive duplicate detection. Usage count tracking for popularity sorting. 3 AI tools: `search_catalog`, `add_catalog_items_to_job`, `manage_catalog_item`. Seeded with 30 common auto repair items.
- Dashboard: sectioned layout — slim greeting header, KPI cluster (Today's Revenue / Week / Month / Outstanding A/R + State/TNC/Jobs Closed compact cards), divider, **Action Center** (Tasks scratchpad full-width on top; Glance card on right with Parking · Today + Awaiting Payment; 2-column needs-attention alert grid on left with 6 alert types — Unassigned/Quote Requests/Estimates Sent/DVIs Ready/Parking Leads/Aged Parts — each linking to `/inbox?tab=...`), divider, Shop Floor 3-column kanban. Revenue cards include inspection revenue from `daily_inspection_counts`; job line items with `category = "Inspection"` are excluded from revenue to prevent double-counting. Parking · Today scoped to `MANAGED_PARKING_LOTS` only and reports an "X/Y prepared" line under Pickups (prepared = checked_out OR lock_box_number staged).
- **Tasks scratchpad:** `tasks` table + `lib/actions/tasks.ts`. Manager-only personal todos surfaced in the Action Center. RLS on `tasks_select_authenticated` is permissive (any authenticated user reads), but `getOpenTasks` returns `[]` for non-managers as the intended UX. Mutations call `revalidatePath("/", "layout")` so the sidebar inbox badge stays fresh.
- **Inbox** (`/inbox`): single destination for every needs-attention alert from the dashboard. Type-accent filter chips per category (matches the Tone palette: amber Unassigned, blue Quotes, indigo Estimates, violet DVIs, emerald Parking, red Parts/Payments). Section cards with row dividers.
- **Shared UI modules (Session 33):**
  - `src/lib/ui/alert-tone.ts` — `Tone` union (`amber|blue|indigo|violet|emerald|red`) + `TONE_CLASSES` Record with `tile`, `bar`, `card`, `count`, `chip` strings. Single source of truth for alert/needs-attention surfaces.
  - `src/lib/actions/_types.ts` — `ActionResult<T>` discriminated union for new server actions. Older actions still use `{ success | error }`.
  - `src/lib/utils/parking.ts` — `hasPendingService(reservation)`. Used by dashboard, inbox, and sidebar count.
  - Vitest test framework wired (`vitest.config.ts`, `npm test`/`test:watch`/`test:coverage`). First suite: `src/lib/utils/parking.test.ts`.
- **Revenue Reporting:** Shared utility at `src/lib/utils/revenue.ts` — `sumJobRevenue()` excludes inspection-category items (`INSPECTION_CATEGORIES` set: "Inspection", "State Inspection", "TNC Inspection"), `calcInspectionRevenue()` computes inspection revenue/cost/profit. Both dashboard and reports use these. State Inspection cost: $11.50/unit (`INSPECTION_COST_STATE`). Reports show "State Inspection" and "TNC Inspection" as rows in Revenue by Category and Service Profitability.
- **Reporting Suite:** 5 report pages total:
  - **Revenue Overview** (`/reports/revenue`) — KPI cards, category/tech breakdowns, profitability table, Fleet A/R aging
  - **Tax Summary** (`/reports/tax`) — Monthly taxable sales and MA sales tax by year
  - **Trends Explorer** (`/reports/trends`) — 11 metrics charted over time (day/week/month). Recharts BarChart. Revenue includes inspections.
  - **Service Mix Deep-Dive** (`/reports/service-mix`) — Per-category trends. "All Categories" stacked bar chart or single-category drill-down. 6 metrics. Top 8 categories + "Other".
  - **Tech Scoreboard** (`/reports/tech`) — Per-tech trends. "All Techs" stacked chart or single-tech drill-down. 6 metrics. Reuses CategoryDeepDive component.
  - Shared bucketing helpers in `src/lib/utils/trend-buckets.ts` (`buildBucketKeys`, `getBucketKey`, `getDateRange`, `timestampToDateET`). CategoryDeepDive component (`src/components/dashboard/category-deep-dive.tsx`) generalized with `groupLabel`/`basePath` props for reuse across category and tech reports.
- Customer list: server-side pagination (50 per page) with URL params, handles 3,000+ imported contacts
- Wix import: one-time script (`scripts/import-wix-customers.ts`) with filtering, dedup, dry-run mode
- RO Numbers: auto-assigned sequential repair order numbers (RO-0001 format) on all jobs via PostgreSQL sequence
- Printable Repair Order: `/jobs/[id]/print` — print-optimized document with shop header, customer/vehicle info, itemized line items, tax, totals
- **Shop Settings:** Configurable tax rate, shop supplies fee (4 calculation methods + cap), environmental/hazmat fee. Both fees can be scoped to specific job categories (null = all categories, backward compatible). Settings page at `/settings/rates`. All totals computed via shared `calculateTotals()` utility. Fees default to disabled. Tax rule: parts + shop supplies are taxable; labor and hazmat are not.
- **Part Cost Tracking:** Optional `cost` (wholesale price) field on part line items. Reports compute actual gross profit when cost is available, fall back to 40% margin estimate when not. Cost data coverage % shown on reports. Cost is never exposed to customers (invoices, estimates, print RO all use retail price only).
- **Airport Parking:** Dashboard at `/parking` managing 4 lots (Broadway Motors, Airport Parking Boston 1, Airport Parking Boston 2, Boston Logan Valet) with 3 parking types (self_park, shuttle, valet). Three views: Today (arrivals/pickups/parked), Service Leads (parking customers interested in repairs), All Reservations. Shuttle reservations show sky-blue "Shuttle" badge on cards and detail page. Public API at `/api/parking/submit` accepts form POSTs with CORS, rate limiting (per-IP), honeypot spam protection, and dedup (phone + date + lot within 5 min). Wix webhook bridge at `/api/webhooks/wix-parking` (deactivated — Wix redirects to BroadwayMotorsMA.com forms). 5 public forms on BroadwayMotorsMA.com: self-park, shuttle, APB1, APB2, valet. Lot-specific confirmation pages with parking instructions. 6 AI tools for parking operations. Parking reservations auto-link to `customers` table via `findOrCreateParkingCustomer()` (dedup by email, then phone). Customer detail page shows "Parking History" section. Checkout flow with lockbox selection modal (8 physical lockboxes) — sends pickup SMS with box number + code, or in-person checkout without SMS. "Send Specials" button for upselling services to checked-in customers. Reservation detail page shows two-column layout with customer/vehicle cards, trip timeline, and Key Pickup section (lockbox number + code or "in person"). Parking dashboard compact cards show lockbox info for checked-out reservations.
- Deployed to Vercel at `https://shop-pilot-rosy.vercel.app`
- GitHub repo: `https://github.com/tomdro61/shop-pilot` (private)

**Remaining work:**
- ~~Register WisePOS E reader + set `STRIPE_TERMINAL_READER_ID` env var~~ DONE — reader registered, env var set, terminal payments working
- A2P registration on Quo (blocked on number port + paid plan)
- Retire Wix webhook bridge code (redirects confirmed, automation deactivated)

**Production readiness (before going live):**
- ~~Upgrade Supabase to Pro ($25/mo)~~ DONE
- Upgrade Vercel to Pro ($20/mo) — SLA, higher function duration limits for AI chat
- ~~Add Sentry error monitoring (free tier) — captures runtime errors, sends alerts~~ DONE — `@sentry/nextjs` wired with tunnel route `/monitoring`, source maps uploaded on every Vercel build, errors tagged with commit SHA via release config. Project: `shop-pilot.sentry.io`. **Sentry MCP available** — install per-machine with `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` (OAuth on first use, no token to manage). When wired, the agent can query issues, events, and releases live instead of asking you to paste them.
- Add uptime monitoring (BetterUptime or UptimeRobot, free) — texts/emails if site goes down
- Set up weekly database backup export of critical tables (customers, jobs, invoices)
- Audit environment variables — ensure no secrets committed or exposed

**Optional enhancements:**
- Voice input (Web Speech API or Whisper)
- Chat history persistence in Supabase (currently in-memory, resets on refresh)

**Next phase:** Phase 4 — Operational Excellence (vehicle history, work orders, labor rates, inventory, accounting)

## Development Conventions

- **TypeScript** — strict mode, no `any` types
- **Components** — functional components with hooks, shadcn/ui as base
- **Naming** — PascalCase for components, camelCase for functions/variables, kebab-case for files/routes
- **Database** — snake_case for all table and column names
- **Migrations** — all schema changes via Supabase migrations (never edit schema manually in dashboard)
- **Environment variables** — all secrets in `.env.local`, never committed. Use `NEXT_PUBLIC_` prefix only for client-safe values.
- **Git** — conventional commits (feat:, fix:, chore:, etc.). Work on the `staging` branch. Push feature changes to `staging` first so they can be validated before merging to `master`. Only merge to `master` when the user explicitly asks.
- **Mobile-first** — design for phone screens first, then expand to desktop
- **Front-end design / UI changes** — ALWAYS invoke the front-end design skill (`/front-end-design` or whichever slash-skill is configured for visual/design work) before making visual changes, restructuring layouts, or proposing redesigns. The skill exists specifically to give design decisions structure — don't freelance the visuals. If the task touches component layout, typography, color, spacing, or visual composition, the skill is in scope. Read [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) first for the canonical tokens and patterns.

## Review Workflow (the gate is the hook, not your judgment)

A 13-agent review of `staging` (April 2026) found 118 issues that accumulated across many sessions because review wasn't built into the workflow. The full report lives at `REVIEW-FINDINGS.md`.

**The harness gate**: a pre-push hook (`.claude/hooks/scoped-review-required.sh`) BLOCKS `git push` unless `.scoped-review-marker` at repo root contains the current HEAD SHA. The `/scoped-review` skill writes that marker on completion. The marker becomes stale on every new commit, so every batch of work earns its own review pass.

**Don't try to reason about whether to skip review.** The agent's "this feels small" judgment was the failure mode that caused 118 issues to accumulate. The hook removes that judgment from the loop.

**Bypass for tiny changes**: append `[skip-review]` to the latest commit message, then push. Use this for typo fixes, doc-only changes, single-line bug fixes, formatting changes — anything where review would be theater. If you find yourself reaching for `[skip-review]` on something that touches a server action or a form, you're using it wrong.

**The skill picks the agents.** It reads the diff, categorizes the changes, and dispatches only the relevant reviewers in parallel. A 30-line server-action change runs 2 agents. A whole feature runs 3-4. Pre-merge runs all 12. A typo fix runs zero. After consolidating findings, the skill writes the marker so the push unblocks.

**After invoking `/scoped-review`:** address all Critical findings before declaring done. Triage High/Medium with the user. Don't ship a Critical "as a follow-up." If Criticals exist, fix them first then re-run the skill against the new HEAD.

**Pre-commit hook** (`.claude/hooks/scoped-review-reminder.sh`) is advisory — it just reminds. The real gate is the pre-push hook.

### Auto-invoke `/sketch-flow` BEFORE writing async UI / payment code

Some bugs aren't caught by review because they're already encoded in the code by the time review runs. The fix is to slow down before writing — enumerate the state machine first, then code against it.

**Auto-invoke `/sketch-flow` when ANY of these are true:**
- Adding a new async handler in `src/components/dashboard/{charge-card-on-file,terminal-pay,job-payment-footer,quick-pay,invoice-section}-*` or `src/components/customers/payment-method-actions*`
- The change adds a new `useState` to a component already in a payment flow
- The change interacts with Stripe `PaymentIntent` / `SetupIntent` / `Invoice` state from the UI or a server action
- The change touches `src/app/api/{stripe,terminal,cron,webhooks}/**`
- The change adds or modifies code in `src/lib/actions/{charge-card-on-file,payment-methods,invoices,jobs,estimates}.ts`
- The change removes ANY safety check (auth gate, payment guard, idempotency key, double-submit `disabled`, Stripe error narrowing, atomic flip clause, webhook signature verify)

The pre-edit hook (`.claude/hooks/check-safety-removal.sh`) BLOCKS edits to sensitive paths that strip these patterns without an explicit `// safety-removed: <reason>` marker. If you hit the block, that's the signal — go invoke `/sketch-flow` to enumerate why removal is safe, or restore the check.

### Auto-invoke `/verify-flow` BEFORE declaring a UI flow done

Code review reads diffs. `/verify-flow` clicks through the actual customer journey on the local dev server. Several bugs (controlled-dialog state, schema-drift on standalone estimates, broken react-hook-form submit) shipped because the diff looked clean but no one ran the flow.

**Auto-invoke `/verify-flow` when:**
- Diff touches `charge-card-on-file-button`, `terminal-pay-button`, `payment-method-actions`, or any other payment-flow client component
- Diff changes the customer's experience of money math (totals, tax, fees)
- A new UI state machine ships (loading / success / failure paths)
- Diff modifies a public surface: estimate approval, DVI inspect, parking submit, quote requests

If a flow doesn't yet exist in `.claude/skills/verify-flow`, write the new flow definition before declaring done — that's how this skill stays useful for the next session.

## Investigation Discipline (hard rules)

Static review reads the diff. Static review can be wrong about runtime
behavior, third-party API contracts, and cross-flow side effects. Before
concluding "no bug exists" or "this isn't our bug," verify all four:

1. **Trace the JS data flow** end-to-end — input → Zod parse → server
   action → Supabase write → re-read → component prop → DOM. Read every
   transformation. If you skip a layer, the bug lives there.
2. **Check the DB column types** — schema-drift bugs are invisible at the
   JS layer. A `text` column where the schema expected `text[]` looks
   fine in TypeScript and breaks at insert. The `as string[]` cast on
   `shop_settings.job_categories` (T-1, T-2 in May 2026) hid this for
   months until the runtime check shipped.
3. **Verify third-party API contracts** — don't assume the SDK comments
   match the live behavior. Quo SMS responses, Stripe webhook payloads,
   Resend send results, Supabase nested-select shapes (`customers(...)`
   inside an `estimates` query returns null when the join FK is null —
   that's how FH-1 broke the standalone-estimate approval page).
4. **Click through the customer flow** — `/verify-flow <keyword>` exists
   for this. Use it. Reading the diff isn't enough. The May 2026
   broken-submit-button bug had two rounds of multi-agent review mark
   the form "OK but redundant"; the cause was that react-hook-form's
   `handleSubmit` flips `isSubmitting=true` BEFORE invoking the user
   handler, so `if (form.formState.isSubmitting) return` short-circuited
   every submission. No diff reader caught it; one click would have.

If you skip any of these and conclude "no bug," you'll be wrong like the
May 2026 estimate-approval investigation was: schema check would have
caught the `jobs.customers` traversal returning null for standalone
estimates, and clicking through the public approval page would have
shown blank customer/vehicle on every emailed link. Both gates were
skipped, both bugs shipped to staging, and the final whole-diff sweep
caught them only because the prompt said "walk every customer-facing
surface." Make the four checks routine, not heroic.

**The two skills that operationalize this:**
- `/verify-flow <keyword>` — clicks through customer flows in the dev
  server (handles step 4)
- `/post-deploy-check` — production-side equivalent after merge to master

## Anti-patterns to avoid (these are what the review keeps catching)

These are the recurring failure modes from `REVIEW-FINDINGS.md`. Treat them as hard rules during writing, not just review-time checks.

**Server actions that mutate (`src/lib/actions/*`):**
- MUST call `requireManager()` from `src/lib/auth.ts` at the top, OR have an inline comment explaining why no auth check is needed (e.g., public form endpoint)
- MUST destructure `{ data, error }` from every Supabase call and check `error` — never `const { data } = await supabase.from(...)`
- MUST validate foreign-key inputs (`customer_id`, `vehicle_id`, etc.) before writing — don't trust client-supplied UUIDs
- MUST use `await createClient()` from `@/lib/supabase/server`, NEVER `createAdminClient()` (service role is API-routes-only)

**Error handling:**
- NEVER `catch { return null }` or `catch { return [] }` — that masks bugs and the UI can't distinguish "no data" from "query failed"
- NEVER fire-and-forget Promises with only `.catch(console.error)` — surface delivery status to the caller
- Hooks that wrap async work MUST handle thrown exceptions (try/catch around `await`) — the `{ error }` shape isn't enough

**Caching:**
- `unstable_cache` invalidation requires `revalidateTag` matching the cache's tag array — `revalidatePath` does NOT bust `unstable_cache` entries
- Don't add `unstable_cache` for low-traffic internal-tool data — the staleness/invalidation cost outweighs the perf gain

**UI primitives:**
- Any `<div onClick>` MUST have `role`, `tabIndex={0}`, AND `onKeyDown` for Enter/Space — keyboard nav is not optional. Use the `ClickableRow` primitive whenever possible.
- Don't use `<div>` for things that should be `<a>` or `<button>` — semantic HTML first
- All design tokens (border radius, color, shadow, status badges, hover bg) live in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) — read that for the canonical rules, don't redocument them here

**Forms:**
- Always `value={field.value ?? ""}` on text inputs/textareas; never bare `{...field}` (avoids controlled/uncontrolled flip)
- For double-submit protection, disable the submit button via `disabled={form.formState.isSubmitting}`. Do NOT add `if (form.formState.isSubmitting) return` inside the onSubmit handler — react-hook-form's `handleSubmit` flips `isSubmitting=true` BEFORE invoking the handler, so the inline guard fires every time and silently blocks all submissions. RHF's handleSubmit is internally re-entrant safe; the disabled button is the correct guard.
- Search inputs hitting Supabase MUST debounce (300ms) AND use AbortController for cancellation

**Comments:**
- Default to writing NO comments
- Never write JSDoc that names a specific consumer ("first shipped on the X page", "used by Y") — it rots
- Never restate what well-named code already does — only document non-obvious WHY

**Types:**
- No `any`. No casts through `unknown` to "fix" type errors — fix the real type
- Discriminated unions over optional-fields-on-both-arms (`{ ok: true; data } | { ok: false; error }`, not `{ data?, error? }`)
- Action return types: use a shared `ActionResult<T>` (or equivalent) so the hook layer can rely on the shape

**Dead code:**
- When deleting a route or feature, also delete the components, server actions, types, and form branches that supported it
- After heavy refactor churn (multiple reverts), grep for unused state, leftover handlers, and `eslint-disable` comments

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run lint             # Run ESLint

# Supabase
npx supabase start       # Start local Supabase (if using local dev)
npx supabase db push     # Push migrations to remote
npx supabase gen types typescript --project-id <id> > src/types/supabase.ts  # Generate types

# Deployment
git push origin staging  # Push to staging for validation
git checkout master && git merge staging && git push  # Merge to production (only when user approves)
```
