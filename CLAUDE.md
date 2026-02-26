# ShopPilot - AI-Powered Shop Management System

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
| SMS | Quo (formerly OpenPhone) API | Integrated — send/receive/webhook wired. Blocked on A2P registration + number port. |
| Email | Resend | Integrated — branded HTML templates for estimates + receipts, AI send_email tool, test mode fallback. Needs domain verification for live sending. |
| Hosting | Vercel (free tier) | Auto-deploy from Git, edge functions, free SSL |
| Parts (future) | Parts Tech API (TBD) | Needs API access investigation |
| Accounting (future) | Wave Apps or QuickBooks API | TBD which one |

## Database Schema

Core tables in Supabase PostgreSQL:

- **customers** — id, first_name, last_name, phone, email, address, notes, customer_type (retail/fleet), fleet_account, stripe_customer_id, created_at
- **vehicles** — id, customer_id, year, make, model, vin, license_plate, mileage, color, notes
- **jobs** — id, customer_id, vehicle_id, status, title, category (deprecated — exists in DB but no longer set/displayed), assigned_tech, date_received, date_finished, notes, payment_status, payment_method, mileage_in, stripe_payment_intent_id, ro_number (auto-assigned sequential integer via `ro_number_seq`)
- **job_line_items** — id, job_id, type (labor/part), description, quantity, unit_cost, total, cost (nullable — wholesale price for parts, used for profit margin tracking), part_number, category (single source of truth for service categorization)
- **job_presets** — id, name, category, line_items (JSONB), created_at
- **estimates** — id, job_id, status (draft/sent/approved/declined), sent_at, approved_at, declined_at, approval_token, tax_rate, created_at
- **estimate_line_items** — id, estimate_id, type, description, quantity, unit_cost, total, part_number, category
- **invoices** — id, job_id, stripe_invoice_id, stripe_hosted_invoice_url, status (draft/sent/paid), amount, paid_at
- **messages** — id, customer_id, job_id, channel (sms/email), direction (in/out), body, status (sent/failed), sent_at
- **users** — id, name, email, role (manager/tech), auth_id (Supabase Auth linked)
- **shop_settings** — single-row config: tax_rate, shop_supplies_enabled, shop_supplies_method (percent_of_labor/parts/total/flat), shop_supplies_rate, shop_supplies_cap, shop_supplies_categories (jsonb, nullable — scopes fee to specific job categories), hazmat_enabled, hazmat_amount, hazmat_label, hazmat_categories (jsonb, nullable — scopes fee to specific job categories)

**Job statuses:** Not Started → Waiting for Parts → In Progress → Complete
**Payment tracked separately:** payment_status (unpaid → invoiced → paid / waived), payment_method (stripe/cash/check/ach/terminal)

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
│   │   │   └── messages/       # Communication log
│   │   ├── chat/               # AI assistant interface
│   │   └── api/                # API routes
│   │       ├── ai/             # Claude API integration
│   │       ├── stripe/         # Stripe webhooks + payment links
│   │       ├── messaging/      # Quo (SMS) + Resend (email) integrations
│   │       └── ...
│   ├── components/             # Shared React components
│   │   ├── ui/                 # Base UI components (shadcn/ui)
│   │   ├── forms/              # Form components
│   │   ├── dashboard/          # Dashboard-specific (board, calendar, list views)
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

**Goal:** Replace Notion for job tracking. Get the core data model and UI working.

#### Phase 1 Order of Operations:

1. **Project scaffolding**
   - Initialize Next.js with TypeScript, Tailwind CSS, App Router
   - Install and configure shadcn/ui for component library
   - Set up ESLint and Prettier
   - Initialize Git repo, push to GitHub
   - Deploy blank app to Vercel to confirm pipeline works

2. **Supabase setup**
   - Create Supabase project
   - Write and run migrations for all core tables (customers, vehicles, jobs, job_line_items, estimates, invoices, messages, users)
   - Configure Row Level Security (RLS) policies
   - Set up Supabase Auth (email/password to start)
   - Generate TypeScript types from schema

3. **Authentication**
   - Build login page
   - Set up Supabase Auth middleware in Next.js
   - Implement role-based access (manager vs. tech)
   - Protect all routes behind auth

4. **Customer management**
   - Customer list page with search
   - Create/edit customer form
   - Customer detail page (shows linked vehicles and job history)

5. **Vehicle management**
   - Add/edit vehicle form (linked to customer)
   - Vehicle list on customer detail page

6. **Job tracker**
   - Create/edit job form (link to customer + vehicle, assign tech, set status)
   - Job detail page with line items (labor + parts)

7. **Job dashboard**
   - Kanban board view (drag-and-drop by status)
   - List view with sort/filter
   - Calendar view (by date received or date finished)
   - Mobile-responsive layout for all views

8. **Data import**
   - Export Wix customer contacts
   - Build import script to load into Supabase

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
**Phase 3: COMPLETE** — AI Assistant with Claude API, 37 tools, streaming chat UI
**Session 4:** Team management, tech assignment on jobs, reports date filtering + tech charts
**Session 5:** Full AI chat assistant (Phase 3)
**Session 6:** Dashboard operational intelligence, UI refresh phase 2
**Session 7:** Quo SMS integration, AI chat context preservation, customer search fix
**Session 8:** Job presets, job form redesign, dashboard + reports enhancements
**Session 9:** Stripe Terminal (WisePOS E) integration with Quick Pay
**Session 10:** Quick Pay presets, inspections update, dashboard overhaul, typography system
**Session 11:** Line item categories for multi-service jobs
**Session 12:** Remove job-level category — line items as single source of truth
**Session 13:** Design system refactor — stone/blue palette, layered depth, component polish
**Session 14:** Resend transactional email integration — client, templates, server actions, auto-send, AI tool
**Session 15:** Wix customer CSV import (~3,000 contacts), customer list server-side pagination
**Session 16:** RO numbers (sequential, auto-assigned) + printable repair order page
**Session 17:** Shop settings — configurable tax rate, shop supplies fee, environmental fee
**Session 18:** Part cost tracking — wholesale cost on parts for actual profit margin reporting
**Session 19:** Calendar views, date fixes, job form rename
**Session 20:** Category-scoped shop supplies & hazmat fees
**Session 21:** Estimate delete, category grouping on estimates, Add Service overflow fix

- All core UI and server actions built: auth, customers, vehicles, jobs, line items, dashboard, reports, team management
- **Design system:** Stone/blue color palette with layered depth (stone-100/950 page bg, white/stone-900 card surfaces). All status badges use borderless pills with `-100/-900` tinted backgrounds. Line items redesigned with flat rows and color accent bars (blue=labor, amber=parts). KPI cards have colored left border accents. CSS variables mapped to oklch stone palette.
- **Service categorization:** Line-item categories are the single source of truth. Job-level `category` column exists in DB but is no longer set or displayed. "Add Service" flow on line items lets you pick a category, then add labor/parts under it.
- Stripe invoicing + estimate builder with public approval page fully working (live mode). Estimates can be deleted and recreated to pick up updated job line items. Estimate line items carry categories and are grouped by service category on both internal and customer-facing views.
- Stripe Terminal: server-driven WisePOS E integration with 3 API routes, TerminalPayButton on job detail, Quick Pay page at `/quick-pay` with numpad UI
- Quo SMS: fully wired (send/receive/webhook), auto-texts estimate approval links + invoice payment links; blocked on A2P registration
- Resend Email: full transactional email — branded HTML templates (estimate, receipt, generic), auto-send on estimate send + invoice paid, AI `send_email` tool, test mode with console logging, delivery status tracking in `messages` table
- AI Assistant: conversational chat at `/chat` with 37 tools covering all CRUD + SMS + email + settings operations, streaming SSE, floating chat bubble on all pages
- AI Model: Claude Haiku 4.5 (configurable in `src/app/api/ai/chat/route.ts`)
- Job Presets: reusable templates with pre-filled line items, `/presets` management page
- Dashboard: sectioned layout (Quick Actions → Revenue with week/month/year comparisons → Needs Attention → Shop Floor → Today's Schedule → Recent Jobs)
- Customer list: server-side pagination (50 per page) with URL params, handles 3,000+ imported contacts
- Wix import: one-time script (`scripts/import-wix-customers.ts`) with filtering, dedup, dry-run mode
- RO Numbers: auto-assigned sequential repair order numbers (RO-0001 format) on all jobs via PostgreSQL sequence
- Printable Repair Order: `/jobs/[id]/print` — print-optimized document with shop header, customer/vehicle info, itemized line items, tax, totals
- **Shop Settings:** Configurable tax rate, shop supplies fee (4 calculation methods + cap), environmental/hazmat fee. Both fees can be scoped to specific job categories (null = all categories, backward compatible). Settings page at `/settings/rates`. All totals computed via shared `calculateTotals()` utility. Fees default to disabled. Tax rule: parts + shop supplies are taxable; labor and hazmat are not.
- **Part Cost Tracking:** Optional `cost` (wholesale price) field on part line items. Reports compute actual gross profit when cost is available, fall back to 40% margin estimate when not. Cost data coverage % shown on reports. Cost is never exposed to customers (invoices, estimates, print RO all use retail price only).
- Deployed to Vercel at `https://shop-pilot-rosy.vercel.app`
- GitHub repo: `https://github.com/tomdro61/shop-pilot` (private)

**Remaining work:**
- Register WisePOS E reader + set `STRIPE_TERMINAL_READER_ID` env var
- A2P registration on Quo (blocked on number port + paid plan)
- Message templates (estimate ready, car ready, payment reminder)

**Production readiness (before going live):**
- ~~Upgrade Supabase to Pro ($25/mo)~~ DONE
- Upgrade Vercel to Pro ($20/mo) — SLA, higher function duration limits for AI chat
- Add Sentry error monitoring (free tier) — captures runtime errors, sends alerts
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
- **Git** — conventional commits (feat:, fix:, chore:, etc.)
- **Mobile-first** — design for phone screens first, then expand to desktop

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
git push origin main     # Auto-deploys to Vercel
```
