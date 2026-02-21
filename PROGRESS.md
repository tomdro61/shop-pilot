# ShopPilot — Progress Log

## Session 1 — 2026-02-17 — Phase 1 Foundation (Complete)

### What Was Completed

**All 9 implementation sessions for Phase 1 done in a single sitting:**

1. **Project Scaffolding** — Next.js 16, TypeScript, Tailwind v4, shadcn/ui (25 components), PWA manifest + placeholder icons, ThemeProvider (system/light/dark), Sonner toasts
2. **Supabase Setup** — Full schema (9 tables), enums, indexes, computed columns, `updated_at` triggers, RLS policies (manager/tech), Supabase clients (server/browser/admin), auth middleware, TypeScript types, constants
3. **Auth UI + Layout** — Login page, dashboard layout with desktop sidebar + mobile bottom nav + header with user dropdown/logout
4. **Customer Management** — List with debounced search, create/edit/delete with Zod validation, detail page with vehicles + job history, phone E.164 formatting, delete protection
5. **Vehicle Management** — CRUD via bottom Sheet forms, integrated into customer detail page, inline edit/delete
6. **Job Management** — Job form with customer Combobox, vehicle Select, category autocomplete, status badges. Line items (labor/part) with qty x unit_cost = computed total. Grouped subtotals.
7. **Job Dashboard** — List view (TanStack Table desktop, cards mobile), Board view (5 status columns, horizontal scroll mobile), toolbar with search/status/category filters, view toggle, FAB
8. **Reporting** — 4 KPI cards (jobs + revenue, week + month, % change vs prior), average ticket size, bar charts by category (Recharts)
9. **Polish** — Loading skeletons for all routes, error boundary with retry, not-found pages, empty state component

**Git:** Repo initialized, committed, pushed to GitHub (private) at `https://github.com/tomdro61/shop-pilot`

**Build:** Clean — `npm run build` passes, `npm run lint` passes (3 harmless warnings about React Compiler + TanStack Table/RHF)

### File Count
- 91 TypeScript/TSX source files
- 102 files changed in commit, 14,886 lines

### What's NOT Done Yet (Phase 1 Remaining)
- [ ] Create Supabase project and add real credentials to `.env.local`
- [ ] Run `npx supabase db push` to deploy schema to remote
- [ ] Create manager account in Supabase Auth dashboard, insert matching row in `users` table
- [ ] Deploy to Vercel (connect GitHub repo, set env vars)
- [ ] Test on real device (iPhone Safari, Android Chrome)
- [ ] Wix customer data import (Session 10 from plan — 1000+ customers)
- [ ] Seed data for local development

### What's Next — Phase 2: Payments & Communication
- Stripe Invoicing integration (invoices table already has `stripe_invoice_id`)
- Custom estimate builder with SMS approval link
- Quo (formerly OpenPhone) SMS integration (messages table ready — pending Quo signup + number port from Wix)
- Resend email integration
- Communication log per customer
- Message templates

### Known Issues / Notes
- Next.js 16 shows middleware deprecation warning ("use proxy instead") — this is a Next.js 16 change, not blocking
- The `ShopPilot_PRD_BroadwayMotors.docx` file is in the project root but not committed (not source code)
- Placeholder PWA icons need to be replaced with real branding

---

## Session 2 — 2026-02-20 — Phase 2: Stripe Invoicing + Estimates (Complete)

### What Was Completed

**Full Stripe invoicing and estimate builder implemented, tested, and deployed:**

1. **Stripe Setup** — Installed `stripe` SDK, created client singleton (`src/lib/stripe/index.ts`), configured sandbox account for Broadway Motor Service, wired up API keys + webhook secret + app URL in `.env.local` and Vercel
2. **Database Migration** — Added `stripe_customer_id` to customers, `approval_token` to estimates, `stripe_hosted_invoice_url` to invoices (SQL run in Supabase SQL Editor), updated TypeScript types
3. **Constants** — Added `ESTIMATE_STATUS_LABELS/COLORS` and `INVOICE_STATUS_LABELS/COLORS` with consistent styling
4. **Invoice Server Actions** — `getOrCreateStripeCustomer` (auto-creates Stripe customer from Supabase customer), `createInvoiceFromJob` (validates job is complete, creates Stripe invoice with line items + MA 6.25% tax on parts, finalizes and sends), `getInvoiceForJob`
5. **Stripe Webhook** — `POST /api/stripe/webhooks` with signature verification, handles `invoice.paid` event to update invoice status and job status to "paid". Fixed middleware to exclude `/api/` routes from auth.
6. **Invoice UI** — `InvoiceSection` component on job detail page: shows "Create Invoice" button when job is complete, shows status/amount/link when invoice exists
7. **Estimate Server Actions** — Full CRUD: `createEstimateFromJob` (copies job line items), `sendEstimate` (generates UUID approval token + URL), `approveEstimate` (auto-creates Stripe invoice), `declineEstimate`, line item CRUD (draft-only guard)
8. **Estimate UI** — Estimate detail page (`/estimates/[id]`) with editable line items (draft only), tax calculation display (labor + parts + 6.25% on parts), send/copy-link actions. `EstimateSection` on job detail page.
9. **Public Estimate Approval Page** — `/estimates/approve/[token]` with minimal "Broadway Motors" layout (no login required), itemized line items with tax, approve/decline buttons with confirmation dialogs. On approval, auto-creates and sends Stripe invoice.

### End-to-End Flow Tested Successfully
1. Created estimate from job with line items (brake pad labor $130 + rotor part $150)
2. Sent estimate, generated approval link
3. Opened approval link — saw itemized estimate with MA 6.25% tax on parts ($9.38), total $289.38
4. Approved estimate — Stripe invoice auto-created and sent to customer email
5. Paid invoice on Stripe hosted page with test card (4242 4242 4242 4242)
6. Webhook fired — job status updated to "Paid" in ShopPilot

### New Files (22 files, ~2,080 lines)
- `src/lib/stripe/index.ts` — Stripe client singleton
- `src/lib/stripe/create-invoice.ts` — Shared Stripe invoice creation helper
- `src/lib/actions/invoices.ts` — Invoice server actions
- `src/lib/actions/estimates.ts` — Estimate server actions
- `src/lib/validators/invoice.ts` — Invoice Zod schema
- `src/lib/validators/estimate.ts` — Estimate line item Zod schema
- `src/app/api/stripe/webhooks/route.ts` — Stripe webhook handler
- `src/app/(dashboard)/estimates/[id]/page.tsx` — Estimate detail page
- `src/app/estimates/approve/layout.tsx` — Public approval layout
- `src/app/estimates/approve/[token]/page.tsx` — Public approval page
- `src/components/dashboard/invoice-section.tsx` — Invoice UI on job detail
- `src/components/dashboard/estimate-section.tsx` — Estimate UI on job detail
- `src/components/dashboard/estimate-actions.tsx` — Send/copy-link actions
- `src/components/dashboard/estimate-approval-buttons.tsx` — Public approve/decline buttons
- `src/components/dashboard/estimate-line-items-list.tsx` — Estimate line items with tax
- `src/components/forms/estimate-line-item-form.tsx` — Estimate line item form

### Environment Variables Added
- `STRIPE_SECRET_KEY` — Stripe sandbox secret key
- `STRIPE_WEBHOOK_SECRET` — Webhook signing secret
- `NEXT_PUBLIC_APP_URL` — `https://shop-pilot-rosy.vercel.app`

### What's NOT Done Yet
- [ ] SMS/email sending of estimate approval links (currently manual copy/paste)
- [ ] "Create Invoice" button flow (direct from job, without estimate) — code exists but untested
- [ ] Stripe live mode (currently sandbox/test mode)
- [ ] Wix customer data import (1000+ customers)

### What's Next — Phase 3: AI Assistant
- Claude API integration with function calling (tool use)
- Define tool suite: customer lookup, job CRUD, estimate/invoice generation, messaging, status updates
- Mobile-optimized chat interface
- Voice input (Web Speech API or Whisper)
- Confirmation step before financial actions

### Known Issues / Notes
- Next.js 16 middleware deprecation warning persists — not blocking
- Webhook initially failed with 307/405 due to middleware intercepting API routes — fixed by excluding `/api/` from middleware matcher
- Stripe sandbox shows "Broadway Motor Service sandbox" branding on invoices — will show real name in live mode
- `NEXT_PUBLIC_APP_URL` must match deployment environment (localhost for dev, Vercel URL for prod)

---

## Session 3 — 2026-02-20 — UI Visual Polish (Complete)

### What Was Completed

**Tightened spacing and visual hierarchy across the entire app (layout/spacing only, no functionality changes):**

1. **Card Component (global)** — Reduced padding from `py-6 px-6` → `py-5 px-5`, gap from `gap-6` → `gap-4`, header gap `gap-2` → `gap-1.5`
2. **Dark Mode Borders** — Bumped border opacity from 10% → 14%, input borders from 15% → 18% for sharper definition in `globals.css`
3. **Dashboard** — Tighter grid gap (`gap-4` → `gap-3`), smaller stat card headers (`text-sm` → `text-xs`, icons `h-4` → `h-3.5`), added Recent Jobs section showing last 5 jobs
4. **Job Detail Page** — All margins `mb-6` → `mb-4`, `mt-6` → `mt-4`, card section headers `text-sm` → `text-xs`
5. **Customer Detail Page** — Margins `mb-6` → `mb-4`, section headers `text-lg` → `text-base`, icons `h-5` → `h-4`, job card padding `p-4` → `p-3`
6. **Estimate Detail Page** — Margins `mb-6` → `mb-4`, gaps `gap-4` → `gap-3`, card headers `text-sm` → `text-xs`, `pb-2` → `pb-1`
7. **Public Approval Page** — Spacing `space-y-6` → `space-y-4`, title `text-lg` → `text-base`, total `text-xl` → `text-lg`
8. **Line Items Lists (job + estimate)** — Title `text-lg` → `text-base`, empty state padding `py-4` → `py-2`
9. **Invoice & Estimate Section Cards** — Title `text-lg` → `text-base`, icons `h-5` → `h-4`
10. **Vehicle Section** — Margins `mb-6` → `mb-4`, headers `text-lg` → `text-base`, icons `h-5` → `h-4`, card padding `p-4` → `p-3`
11. **Empty State Component** — Padding `py-16` → `py-10`, icon `h-12` → `h-10`, title `text-lg` → `text-base`
12. **Forms (line-item + estimate-line-item)** — Form spacing `mt-4 space-y-4` → `mt-3 space-y-3`

### Files Modified (15)
- `src/components/ui/card.tsx` — Global card padding/gap
- `src/app/globals.css` — Dark mode border opacity
- `src/app/(dashboard)/dashboard/page.tsx` — Dashboard layout + Recent Jobs
- `src/app/(dashboard)/jobs/[id]/page.tsx` — Job detail spacing
- `src/app/(dashboard)/customers/[id]/page.tsx` — Customer detail spacing
- `src/app/(dashboard)/estimates/[id]/page.tsx` — Estimate detail spacing
- `src/app/estimates/approve/[token]/page.tsx` — Public approval spacing
- `src/components/dashboard/line-items-list.tsx` — Line items title/empty state
- `src/components/dashboard/estimate-line-items-list.tsx` — Estimate line items title/empty state
- `src/components/dashboard/estimate-section.tsx` — Section card title/icon
- `src/components/dashboard/invoice-section.tsx` — Section card title/icon
- `src/components/dashboard/vehicle-section.tsx` — Vehicle section spacing
- `src/components/dashboard/empty-state.tsx` — Empty state padding/sizing
- `src/components/forms/line-item-form.tsx` — Form spacing
- `src/components/forms/estimate-line-item-form.tsx` — Form spacing

### What's NOT Done Yet
- [ ] SMS/email sending of estimate approval links (currently manual copy/paste)
- [ ] "Create Invoice" button flow (direct from job, without estimate) — code exists but untested
- [ ] Stripe live mode (currently sandbox/test mode)
- [ ] Wix customer data import (1000+ customers)

### What's Next — Phase 3: AI Assistant
- Claude API integration with function calling (tool use)
- Define tool suite: customer lookup, job CRUD, estimate/invoice generation, messaging, status updates
- Mobile-optimized chat interface
- Voice input (Web Speech API or Whisper)
- Confirmation step before financial actions

### Known Issues / Notes
- No functionality changes — layout and spacing only
- Dark theme preserved, just sharper borders for better visual separation

---

## Session 4 — 2026-02-20 — Team Management + Tech Assignment + Reports Enhancement

### What Was Completed

**Three feature areas built and shipped:**

1. **Team Management** — New `/team` page with full CRUD for technicians and managers
   - `src/app/(dashboard)/team/page.tsx` — Team list page
   - `src/components/dashboard/team-list.tsx` — Team list with edit/delete
   - `src/components/forms/team-member-form.tsx` — Create/edit team member form
   - `src/lib/actions/team.ts` — Server actions (getTeamMembers, getTechnicians, create, update, delete)
   - `src/lib/validators/team.ts` — Zod schema (name, email optional, role)
   - `supabase/migrations/20250220000000_users_email_optional.sql` — Make email optional on users table
   - Added Team link to sidebar and bottom nav

2. **Tech Assignment on Jobs** — Technicians can be assigned to jobs and displayed throughout the app
   - Job form: added tech selector dropdown (loads from users table)
   - Job detail page: shows assigned tech name with HardHat icon
   - Job list view: added "Tech" column (TanStack Table)
   - Job card (board view): shows tech name inline
   - Jobs query updated to join `users` table via `assigned_tech`

3. **Reports Enhancement: Date Filtering + Technician Charts**
   - `src/lib/utils/date-range.ts` — `resolveDateRange()` utility converting presets (this_week, this_month, this_quarter, this_year, all_time, custom) into date ranges
   - `src/components/dashboard/reports-toolbar.tsx` — Client component with preset buttons + custom range calendar popover (uses URL search params)
   - `src/lib/actions/reports.ts` — Refactored to accept `{from, to, isAllTime}` params; added `getJobsByTech()` and `getRevenueByTech()` helpers; computes prior period of equal length for comparison KPIs; skips comparison for All Time
   - `src/app/(dashboard)/reports/page.tsx` — Accepts searchParams, renders toolbar in Suspense, 3 KPI cards (Jobs, Revenue, Avg Ticket) with dynamic labels, 4 bar charts (by Category + by Technician)
   - `src/app/(dashboard)/reports/loading.tsx` — Updated skeleton to match new layout (toolbar, 3 KPIs, 4 charts)

4. **Bug Fix** — Fixed pre-existing type errors in `team.ts` where `|| null` coercion on email conflicted with Supabase's generated types

### New Files (8)
- `src/app/(dashboard)/team/page.tsx`
- `src/components/dashboard/team-list.tsx`
- `src/components/forms/team-member-form.tsx`
- `src/lib/actions/team.ts`
- `src/lib/validators/team.ts`
- `src/lib/utils/date-range.ts`
- `src/components/dashboard/reports-toolbar.tsx`
- `supabase/migrations/20250220000000_users_email_optional.sql`

### Modified Files (12)
- `src/app/(dashboard)/reports/page.tsx` — New layout with toolbar + 4 charts
- `src/app/(dashboard)/reports/loading.tsx` — Updated skeleton
- `src/lib/actions/reports.ts` — Refactored for date range + tech queries
- `src/app/(dashboard)/jobs/[id]/page.tsx` — Show assigned tech
- `src/components/dashboard/job-card.tsx` — Show tech on cards
- `src/components/dashboard/jobs-board-view.tsx` — Tech type added
- `src/components/dashboard/jobs-list-view.tsx` — Tech column added
- `src/components/forms/job-form.tsx` — Tech selector dropdown
- `src/lib/actions/jobs.ts` — Join users table in queries
- `src/components/layout/bottom-nav.tsx` — Team nav link
- `src/components/layout/sidebar.tsx` — Team nav link
- `src/components/ui/sheet.tsx` — Bottom sheet styling tweak

### Build Status
- `npm run build` passes cleanly (0 type errors)
- Deployed to Vercel via `git push origin master`

### What's NOT Done Yet
- [ ] SMS/email sending of estimate approval links (currently manual copy/paste)
- [ ] "Create Invoice" button flow (direct from job, without estimate) — code exists but untested
- [ ] Stripe live mode (currently sandbox/test mode)
- [ ] Wix customer data import (1000+ customers)
- [ ] Quo SMS integration (pending Quo signup + number port from Wix)
- [ ] Resend email integration

### What's Next
- Phase 3: AI Assistant (Claude API with function calling)
- Or continue Phase 2: Quo SMS (pending signup + number port from Wix) + Resend email integration

### Known Issues / Notes
- Next.js 16 middleware deprecation warning persists — not blocking
- `ShopPilot_PRD_BroadwayMotors.docx` remains untracked in project root (intentional)

---

## Session 5 — 2026-02-20 — Phase 3: AI Assistant (Complete)

### What Was Completed

**Full conversational AI assistant with Claude API integration, streaming responses, and 32 tools:**

1. **AI Types** (`src/lib/ai/types.ts`) — ChatMessage, ToolCallInfo, ChatSSEEvent type definitions
2. **System Prompt** (`src/lib/ai/system-prompt.ts`) — Defines ShopPilot persona, data model knowledge, business rules (MA 6.25% tax on parts, job status flow, estimate draft-only editing), confirmation rules for destructive/financial actions, concise phone-screen response style
3. **Tool Definitions** (`src/lib/ai/tools.ts`) — 32 Anthropic tool definitions with JSON Schema input_schema:
   - **Read tools (13):** search_customers, get_customer, get_vehicles_for_customer, get_vehicle, search_jobs, get_job, get_job_categories, get_estimate_for_job, get_estimate, get_invoice_for_job, get_technicians, get_team_members, get_report_data
   - **Create/Update tools (11):** create_customer, update_customer, create_vehicle, update_vehicle, create_job, update_job, update_job_status, create_line_item, update_line_item, create_estimate_line_item, update_estimate_line_item
   - **Destructive/Financial tools (8):** delete_customer, delete_vehicle, delete_job, delete_line_item, delete_estimate_line_item, create_estimate_from_job, send_estimate, create_invoice_from_job
4. **Tool Handlers** (`src/lib/ai/handlers.ts`) — `executeToolCall()` switch dispatch to all existing server actions with try/catch error handling, partial update support (fetches current data and merges), sensible defaults (today's date, "not_started" status)
5. **SSE Utilities** (`src/lib/ai/sse.ts`) — `encodeSSE()` for server streaming, `parseSSE()` for client consumption
6. **API Route** (`src/app/api/ai/chat/route.ts`) — POST handler with Supabase auth check, streaming SSE response, tool-use loop (max 10 iterations), Claude Haiku 4.5 model with 1024 max tokens
7. **useChat Hook** (`src/lib/ai/use-chat.ts`) — Client-side React hook managing messages state, SSE stream parsing, abort support, incremental text + tool call updates
8. **Chat UI Components:**
   - `chat-message.tsx` — Message bubbles (user right-aligned primary, assistant left-aligned muted) with tool call indicator pills (yellow=running, green=complete, red=error)
   - `chat-messages-list.tsx` — Scrollable message list with auto-scroll and welcome message
   - `chat-input.tsx` — Auto-growing textarea, Enter to send, Shift+Enter for newline, send button
   - `chat-bubble.tsx` — Floating action button (MessageCircle) on all pages except /chat, positioned above mobile bottom nav
9. **Chat Page** (`src/app/(dashboard)/chat/page.tsx`) — Full-screen chat composing messages list + input
10. **Nav Updates** — Added Chat (MessageCircle icon) to sidebar, "AI Assistant" to header page titles, ChatBubble to dashboard layout

### Model Configuration
- **Model:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — chosen for cost efficiency at single-shop volume
- **Max tokens:** 1024 — sufficient for concise phone-screen responses
- **Model setting location:** `src/app/api/ai/chat/route.ts` line 44 — change model string to switch (e.g. `claude-sonnet-4-5-20250929` for more capability)

### New Files (12)
- `src/lib/ai/types.ts` — Chat type definitions
- `src/lib/ai/system-prompt.ts` — System prompt with business rules
- `src/lib/ai/tools.ts` — 32 Anthropic tool definitions
- `src/lib/ai/handlers.ts` — Tool call dispatch to server actions
- `src/lib/ai/sse.ts` — SSE encode/parse helpers
- `src/lib/ai/use-chat.ts` — React hook for chat state + streaming
- `src/app/api/ai/chat/route.ts` — Streaming API route
- `src/app/(dashboard)/chat/page.tsx` — Chat page
- `src/components/chat/chat-message.tsx` — Message bubble component
- `src/components/chat/chat-messages-list.tsx` — Messages list component
- `src/components/chat/chat-input.tsx` — Chat input component
- `src/components/chat/chat-bubble.tsx` — Floating chat button

### Modified Files (4)
- `src/components/layout/sidebar.tsx` — Added Chat nav item
- `src/components/layout/header.tsx` — Added AI Assistant page title
- `src/app/(dashboard)/layout.tsx` — Added ChatBubble component
- `package.json` — Added `@anthropic-ai/sdk`

### Environment Variables Added
- `ANTHROPIC_API_KEY` — Anthropic API key (added to `.env.local` and Vercel)

### Build Status
- `npm run build` passes cleanly (0 type errors)
- Deployed to Vercel via `git push origin master`

### What's NOT Done Yet
- [ ] Voice input (Web Speech API or Whisper) for the chat
- [ ] Chat history persistence (currently in-memory, resets on page refresh)
- [ ] SMS/email sending of estimate approval links (currently manual copy/paste)
- [ ] Stripe live mode (currently sandbox/test mode)
- [ ] Wix customer data import (1000+ customers)
- [ ] Quo SMS integration (pending Quo signup + number port from Wix)
- [ ] Resend email integration

### What's Next
- Continue Phase 2 remaining: Resend email, Wix import, Stripe live mode
- Or start Phase 4: vehicle service history, work orders, labor rates, inventory
- Optional Phase 3 enhancements: voice input, chat persistence

### Known Issues / Notes
- Next.js 16 middleware deprecation warning persists — not blocking
- Chat history is in-memory only — refreshing the page clears conversation
- All 32 tool schemas are sent with every API call, which increases input token cost. Could optimize later by subsetting tools based on conversation context.
- `ShopPilot_PRD_BroadwayMotors.docx` remains untracked in project root (intentional)

---

## Session 6 — 2026-02-21 — UI Refresh Phase 2 + Dashboard Expansion

### What Was Completed

**Dashboard overhaul with operational intelligence, revenue comparisons, and UI consistency fixes:**

1. **Dashboard Restructured into Labeled Sections** — Replaced flat 5-column stat card grid with clearly separated sections, each with an uppercase section header label:
   - **Quick Actions** — Full-width "New Job" button (removed New Inspection Day button)
   - **Revenue** — This Week + This Month cards with week-over-week and month-over-month percentage comparisons (trend up/down icons)
   - **Needs Attention** (conditional) — Unpaid Jobs, Outstanding A/R — only renders when counts > 0
   - **Shop Floor** — Cars In Shop, Waiting for Parts, Unassigned Jobs

2. **New Dashboard Data Queries** — Added to `getDashboardStats()`:
   - Waiting for Parts count (`status = "waiting_for_parts"`)
   - Unassigned Jobs count (`status = "not_started"` + `assigned_tech IS NULL`)
   - Revenue This Month (completed jobs finished this month)
   - Last Week Revenue (for week-over-week comparison)
   - Last Month Revenue (for month-over-month comparison)
   - Unpaid Jobs count (complete but not paid/waived)

3. **Revenue Comparison Cards** — `RevenueCard` component shows:
   - Current period revenue amount
   - Percentage change vs prior period with TrendingUp/TrendingDown icon
   - Green for positive, red for negative

4. **Today's Schedule Section** — New `getTodaysSchedule()` function shows jobs received today:
   - Customer name, vehicle, category
   - Assigned tech name or "Unassigned" in red
   - Status badge
   - Empty state when no jobs scheduled

5. **Removed from Dashboard:**
   - Avg Ticket card (ambiguous time frame)
   - Inspections Today card
   - New Inspection Day button

6. **Customer List Consistency** — Updated `customer-list.tsx` to match Team and Job History patterns:
   - Added `CardHeader` with "Customers (count)" title and `border-b`
   - Changed row padding from `px-4` to `px-5` (matches app-wide pattern)
   - Added `className="block"` to `<Link>` elements (fixes `divide-y` row dividers not rendering)

7. **UI Refresh (broader)** — Login page animations, auth layout ambient gradients, sidebar/header/bottom-nav refinements, card glow effects, globals.css design system updates

### Files Modified (17)
- `src/app/(dashboard)/dashboard/page.tsx` — Full dashboard restructure
- `src/components/dashboard/customer-list.tsx` — CardHeader + padding + divider fix
- `src/app/(auth)/layout.tsx` — Ambient gradient blobs
- `src/app/(auth)/login/page.tsx` — Animation + styling refinements
- `src/app/(dashboard)/customers/[id]/page.tsx` — Detail page styling
- `src/app/(dashboard)/jobs/[id]/page.tsx` — Detail page styling
- `src/app/globals.css` — Design system variables, animations
- `src/app/layout.tsx` — Root layout updates
- `src/components/dashboard/job-card.tsx` — Card styling
- `src/components/dashboard/jobs-board-view.tsx` — Board styling
- `src/components/dashboard/jobs-list-view.tsx` — List view styling
- `src/components/dashboard/jobs-toolbar.tsx` — Toolbar styling
- `src/components/dashboard/kpi-card.tsx` — KPI card styling
- `src/components/layout/bottom-nav.tsx` — Bottom nav refinements
- `src/components/layout/header.tsx` — Header refinements
- `src/components/layout/sidebar.tsx` — Sidebar refinements
- `src/components/ui/card.tsx` — Card glow shadow

### Build Status
- `npm run build` passes cleanly (0 type errors)
- Merged to master and pushed — Vercel auto-deploying

### What's NOT Done Yet
- [ ] Voice input (Web Speech API or Whisper) for the chat
- [ ] Chat history persistence (currently in-memory, resets on page refresh)
- [ ] SMS/email sending of estimate approval links (currently manual copy/paste)
- [ ] Stripe live mode (currently sandbox/test mode)
- [ ] Wix customer data import (1000+ contacts)
- [ ] Quo SMS integration (pending Quo signup + number port from Wix)
- [ ] Resend email integration

### What's Next
- Continue Phase 2 remaining: Resend email, Wix import, Stripe live mode
- Or start Phase 4: vehicle service history, work orders, labor rates, inventory
- Optional: voice input, chat persistence

### Known Issues / Notes
- Next.js 16 middleware deprecation warning persists — not blocking
- `ShopPilot_PRD_BroadwayMotors.docx` remains untracked in project root (intentional)

---

## Session 8 — 2026-02-21 — Job Presets + Dashboard Enhancements + Job Form Redesign

### What Was Completed

**Job Presets/Templates feature — reusable templates for common job types with pre-filled line items:**

1. **Database Migration** (`supabase/migrations/20250221000000_job_presets.sql`) — New `job_presets` table with JSONB `line_items` column, RLS policy, `updated_at` trigger, and 6 seed presets (Oil Change, Brake Service, Tire Rotation, State Inspection, Battery Replacement, Diagnostic)
2. **TypeScript Types** — Added `job_presets` Row/Insert/Update types to `supabase.ts`, convenience aliases (`JobPreset`, `JobPresetInsert`, `JobPresetUpdate`, `PresetLineItem`) to `types/index.ts`
3. **Server Actions** (`src/lib/actions/presets.ts`) — `getPresets()`, `getPreset()`, `createPreset()`, `updatePreset()`, `deletePreset()`, `applyPresetToJob()` (bulk-inserts preset line items into `job_line_items`)
4. **Preset Management Page** (`/presets`) — Card-based list with name, category badge, line item summary, total. Full CRUD with Sheet-based form for create/edit (inline line item editor with add/remove rows)
5. **Sidebar + Header Nav** — Added "Presets" with ClipboardList icon to secondary nav (between Team and Reports), added page title to header
6. **Job Form Preset Integration** — New job form shows preset chips at top; selecting one auto-fills category and stores preset ID; on submit, `applyPresetToJob()` bulk-inserts line items; user lands on job detail page with line items pre-populated

**Job Form Redesign — restructured into 3-section card layout:**

7. **Preset Card** (dashed border, new jobs only) — "Start from a preset" header with helper text, chips with reduced contrast on unselected, "Clear" button
8. **Section 1: Customer & Vehicle** — Customer selector full width with "+ New Customer" link, Vehicle disabled with "Select customer first" placeholder until customer selected
9. **Section 2: Job Details** — 2-column responsive grid: Category | Status | Assigned Tech | Date Received
10. **Section 3: Payment & Notes** — 2-column grid: Payment Status | Payment Method | Mileage In | Notes (full width)
11. **SectionHeader component** — Consistent title + description for each card section

**Dashboard + Reports Enhancements:**

12. **Yearly Revenue** — Dashboard now shows Year-to-Date revenue with year-over-year comparison
13. **Revenue Sparkline Card** (`revenue-sparkline-card.tsx`) — New component for dashboard
14. **Revenue Breakdown on Reports** — New KPI row: Total Revenue, Labor, Parts, Est. Gross Profit (assumes 40% parts margin)
15. **Inspection Count on Reports** — Replaced duplicate Revenue KPI with Inspections count for the selected period
16. **Job Payment Footer** (`job-payment-footer.tsx`) — Sticky footer on job detail page showing payment status + actions
17. **KPI Card subtitle** — Added optional `subtitle` prop to KpiCard component
18. **Primary Color Hue Shift** — Adjusted oklch hue from 255→240 (light) and 250→238 (dark) for slightly warmer blue

### New Files (6)
- `supabase/migrations/20250221000000_job_presets.sql`
- `src/lib/actions/presets.ts`
- `src/app/(dashboard)/presets/page.tsx`
- `src/components/dashboard/preset-list.tsx`
- `src/components/forms/preset-form.tsx`
- `src/components/dashboard/job-payment-footer.tsx`
- `src/components/dashboard/revenue-sparkline-card.tsx`

### Modified Files (12)
- `src/types/supabase.ts` — job_presets table types
- `src/types/index.ts` — JobPreset + PresetLineItem type aliases
- `src/components/forms/job-form.tsx` — Full redesign: 3-section card layout + preset integration
- `src/app/(dashboard)/jobs/new/page.tsx` — Fetches presets, passes to JobForm
- `src/components/layout/sidebar.tsx` — Presets nav item
- `src/components/layout/header.tsx` — Presets page title
- `src/app/(dashboard)/dashboard/page.tsx` — Yearly revenue, sparkline card
- `src/app/(dashboard)/reports/page.tsx` — Revenue breakdown + inspection count
- `src/lib/actions/reports.ts` — getRevenueBreakdown, getInspectionCount, getDailyRevenueSparkline
- `src/components/dashboard/kpi-card.tsx` — subtitle prop
- `src/components/dashboard/line-items-list.tsx` — Minor text update
- `src/app/(dashboard)/jobs/[id]/page.tsx` — Job payment footer integration
- `src/app/globals.css` — Primary color hue adjustment

### Build Status
- `npm run build` passes cleanly (0 type errors)

### What's NOT Done Yet
- [ ] A2P registration on Quo (blocked on number port + paid plan)
- [ ] Port Broadway Motors' real phone number to Quo
- [ ] Resend transactional email integration
- [ ] Message templates (estimate ready, car ready, payment reminder)
- [ ] Voice input (Web Speech API or Whisper) for the chat
- [ ] Chat history persistence (currently in-memory, resets on page refresh)
- [ ] Stripe live mode (currently sandbox/test mode)
- [ ] Wix customer data import (1000+ contacts)

### What's Next
- Phase 4: vehicle service history, work orders, labor rates, inventory
- Resend email integration
- Optional: voice input, chat persistence

### Known Issues / Notes
- Job presets table must be created manually in Supabase SQL Editor (migration file provided, not auto-pushed)
- Next.js 16 middleware deprecation warning persists — not blocking
- `ShopPilot_PRD_BroadwayMotors.docx` remains untracked in project root (intentional)

---

## Session 7 — 2026-02-21 — Quo SMS Integration + AI Chat Fixes

### What Was Completed

**Full SMS infrastructure with Quo API integration, AI tool context preservation, and customer search fix:**

1. **Quo SMS Client** (`src/lib/quo/client.ts`) — API client with automatic test/live mode toggle
   - `isQuoConfigured()` — checks if `QUO_API_KEY` env var is set
   - `sendSMS({ to, body })` — calls Quo API in live mode, logs to console in test mode
   - Auth format: raw API key in Authorization header (Quo does NOT use Bearer tokens)
   - Debug logging for env var detection and API responses

2. **E.164 Phone Formatting** (`src/lib/quo/format.ts`) — `toE164()` normalizes US phone numbers
   - Handles 10-digit, 11-digit with leading 1, already E.164 format
   - Returns null for invalid numbers

3. **Message Server Actions** (`src/lib/actions/messages.ts`)
   - `sendCustomerSMS({ customerId, body, jobId? })` — looks up customer phone, validates E.164, sends via Quo, logs to `messages` table
   - `getCustomerMessages(customerId)` — returns last 50 messages for a customer
   - `getMessagesForJob(jobId)` — returns messages linked to a job
   - `logInboundSMS({ customerPhone, body })` — matches phone to customer, logs inbound message (used by webhook)

4. **Inbound SMS Webhook** (`src/app/api/messaging/quo/webhooks/route.ts`)
   - Handles `message.received` events from Quo
   - Optional `QUO_WEBHOOK_SECRET` signature verification
   - Follows pattern from Stripe webhook handler

5. **AI SMS Tools** — Two new tools added (now 34 total)
   - `send_sms` — sends SMS to customer (confirmation required per existing pattern)
   - `get_customer_messages` — retrieves message history for a customer
   - Handlers in `handlers.ts` dispatch to message server actions

6. **AI System Prompt Updated** — Added SMS messaging section explaining capability, test mode behavior, and added `send_sms` to confirmation-required list

7. **Estimate SMS Auto-Send** (`src/lib/actions/estimates.ts`) — `sendEstimate()` now auto-texts the customer the approval link: "Hi {name}, your estimate from Broadway Motors is ready. View and approve here: {url}" — fire-and-forget

8. **Invoice SMS Auto-Send** (`src/lib/actions/invoices.ts`) — `createInvoiceFromJob()` now auto-texts the customer the Stripe payment link: "Hi {name}, your invoice from Broadway Motors is ready. Pay here: {url}" — fire-and-forget

9. **Customer Search Fix** (`src/lib/actions/customers.ts`) — Multi-word search now works correctly
   - Previously "Thomas DiGregorio" matched neither `first_name` nor `last_name` since each field only contains one word
   - Now splits multi-word queries: first word → `first_name`, last word → `last_name`

10. **AI Chat Context Preservation** — Fixed tool call results being lost between conversation turns
    - **Root cause:** Client only sent `{ role, content }` to API, stripping all `tool_use` and `tool_result` blocks. When user confirmed an action, the AI had to re-search because it lost the customer ID from the prior turn.
    - **Fix:** Server now sends full Anthropic conversation state (including tool blocks) back to client via `conversation_state` SSE event. Client stores it in a ref and sends it back on the next request.
    - Files modified: `types.ts` (new ApiMessage types), `sse.ts` (new event parser), `use-chat.ts` (conversationStateRef), `route.ts` (send/receive state)

### New Files (4)
- `src/lib/quo/client.ts` — Quo API client with test mode
- `src/lib/quo/format.ts` — E.164 phone normalization
- `src/lib/actions/messages.ts` — Message server actions
- `src/app/api/messaging/quo/webhooks/route.ts` — Inbound SMS webhook

### Modified Files (10)
- `src/lib/ai/tools.ts` — Added send_sms + get_customer_messages (34 tools)
- `src/lib/ai/handlers.ts` — Added messaging tool dispatch
- `src/lib/ai/system-prompt.ts` — Added SMS section + confirmation rule
- `src/lib/ai/types.ts` — Added ApiMessage types + conversation_state SSE event
- `src/lib/ai/sse.ts` — Added conversation_state event parser
- `src/lib/ai/use-chat.ts` — Added conversationStateRef for context preservation
- `src/app/api/ai/chat/route.ts` — Accepts/returns conversation state
- `src/lib/actions/estimates.ts` — Auto-SMS on estimate send
- `src/lib/actions/invoices.ts` — Auto-SMS on invoice creation
- `src/lib/actions/customers.ts` — Multi-word search fix

### Environment Variables Added
- `QUO_API_KEY` — Quo API key (empty = test mode, set = live mode)
- `QUO_PHONE_NUMBER` — Shop's E.164 number (e.g. +19786849254)
- `QUO_WEBHOOK_SECRET` — Optional webhook signature verification

### Quo Account Setup (Broadway Motors)
- Quo account created, test number assigned: (978) 684-9254
- API key generated ("broadwaymotors1")
- Webhook configured: `https://shop-pilot-rosy.vercel.app/api/messaging/quo/webhooks` with event type `message.received`
- **Blocker:** A2P registration required before SMS delivery — requires paid Quo plan + EIN. Located at Quo → Settings → Trust center → Local numbers registration ($19.50 one-time + $1.50/month)
- **Plan:** Don't register test number — wait until Broadway Motors' real number is ported, then register that one

### Build Status
- `npm run build` passes cleanly (0 type errors)
- Multiple deploys to Vercel via `git push origin master`

### What's NOT Done Yet
- [ ] A2P registration on Quo (blocked on number port + paid plan)
- [ ] Port Broadway Motors' real phone number to Quo
- [ ] Resend transactional email integration
- [ ] Message templates (estimate ready, car ready, payment reminder)
- [ ] Messages UI page (AI chat is primary interface; dedicated page later)
- [ ] Customer message timeline on detail page
- [ ] Voice input (Web Speech API or Whisper) for the chat
- [ ] Chat history persistence (currently in-memory, resets on page refresh)
- [ ] Stripe live mode (currently sandbox/test mode)
- [ ] Wix customer data import (1000+ contacts)

### What's Next
- Port Broadway Motors' number to Quo, upgrade to paid plan, complete A2P registration
- Resend email integration (same `messages` table architecture)
- Phase 4: vehicle service history, work orders, labor rates, inventory
- Optional: voice input, chat persistence, Sonnet model upgrade

### Known Issues / Notes
- SMS is fully wired end-to-end but won't deliver until A2P registration is complete on Quo
- Test mode still works — messages are logged to database, just not delivered to phone
- Quo auth uses raw API key (NOT Bearer token) — documented in their API docs
- Next.js 16 middleware deprecation warning persists — not blocking
- `ShopPilot_PRD_BroadwayMotors.docx` remains untracked in project root (intentional)

---

## Session 9 — 2026-02-21 — Stripe Terminal (WisePOS E) Integration

### What Was Completed

**Full server-driven Stripe Terminal payment infrastructure for in-person card payments at the counter:**

1. **Database Migration** (`supabase/migrations/20250221100000_stripe_terminal.sql`)
   - Added `terminal` to `payment_method` enum
   - Added `stripe_payment_intent_id` text column to `jobs` table
   - Created walk-in sentinel customer (`00000000-0000-0000-0000-000000000000`) for Quick Pay transactions

2. **TypeScript Types Updated** (`src/types/supabase.ts`)
   - Added `"terminal"` to `payment_method` enum type
   - Added `stripe_payment_intent_id` to jobs Row/Insert/Update types

3. **Validators + Constants**
   - Added `"terminal"` to job validator `payment_method` zod enum
   - Added `terminal: "Terminal"` to `PAYMENT_METHOD_LABELS`

4. **Stripe Terminal Helpers** (`src/lib/stripe/terminal.ts`) — Server-side functions:
   - `createTerminalPaymentIntent(amountCents, metadata)` — creates PaymentIntent with `card_present` method
   - `processReaderPayment(paymentIntentId)` — pushes PI to WisePOS E reader
   - `getPaymentIntentStatus(paymentIntentId)` — retrieves PI status for polling
   - `cancelReaderAction()` — cancels current reader action

5. **Terminal API Routes** (3 routes):
   - `POST /api/terminal/pay` — creates PI, pushes to reader, stores PI ID on job
   - `GET /api/terminal/status?pi=pi_xxx` — polls PaymentIntent status
   - `POST /api/terminal/cancel` — cancels reader action + PaymentIntent

6. **Webhook Handler Updated** (`src/app/api/stripe/webhooks/route.ts`)
   - Added `payment_intent.succeeded` handler alongside existing `invoice.paid`
   - `handleTerminalPayment()` updates job: `payment_status: "paid"`, `payment_method: "terminal"`, `stripe_payment_intent_id`

7. **Terminal Server Actions** (`src/lib/actions/terminal.ts`)
   - `createQuickPayJob(amountCents, note?)` — creates skeleton job linked to walk-in sentinel customer, status "complete", single line item
   - `linkQuickPayToCustomer(jobId, customerId)` — re-assigns walk-in job to real customer (for later use)

8. **TerminalPayButton Component** (`src/components/dashboard/terminal-pay-button.tsx`)
   - "Collect at Counter" button on job payment footer (next to "Mark as Paid" dropdown)
   - Shows when job is complete + unpaid + has line items
   - On click: sends PI to reader, opens dialog with polling spinner
   - States: processing → succeeded (checkmark) / failed / canceled
   - Cancel button during processing

9. **Quick Pay Form + Page** (`src/components/dashboard/quick-pay-form.tsx`, `/quick-pay`)
   - Numpad-style amount input (large `$0.00` display, 0-9 buttons, decimal, backspace)
   - Optional note/description field
   - "Charge" button creates skeleton job → sends to terminal
   - Polling UI: spinner + cancel during processing
   - Success state: checkmark + "Payment Complete" + "View Job" link + "New Payment" button

10. **Navigation Updates**
    - Sidebar: added "Quick Pay" with `CircleDollarSign` icon to main nav (between Customers and Inspections)
    - Bottom nav: replaced Reports with "Pay" (`CircleDollarSign`) for mobile counter use
    - Header: added `/quick-pay` to page titles

### New Files (9)
- `supabase/migrations/20250221100000_stripe_terminal.sql`
- `src/lib/stripe/terminal.ts`
- `src/app/api/terminal/pay/route.ts`
- `src/app/api/terminal/status/route.ts`
- `src/app/api/terminal/cancel/route.ts`
- `src/lib/actions/terminal.ts`
- `src/components/dashboard/terminal-pay-button.tsx`
- `src/components/dashboard/quick-pay-form.tsx`
- `src/app/(dashboard)/quick-pay/page.tsx`

### Modified Files (8)
- `src/types/supabase.ts` — `terminal` enum value + `stripe_payment_intent_id` column
- `src/lib/validators/job.ts` — `terminal` in payment_method zod enum
- `src/lib/constants.ts` — `terminal: "Terminal"` label
- `src/app/api/stripe/webhooks/route.ts` — `payment_intent.succeeded` handler
- `src/components/dashboard/job-payment-footer.tsx` — TerminalPayButton integration
- `src/components/layout/sidebar.tsx` — Quick Pay nav item
- `src/components/layout/bottom-nav.tsx` — Quick Pay replaces Reports on mobile
- `src/components/layout/header.tsx` — Quick Pay page title

### Environment Variables Needed
- `STRIPE_TERMINAL_READER_ID=tmr_xxx` — From Stripe Dashboard after registering WisePOS E reader

### Build Status
- `npm run build` passes cleanly (0 type errors, 17 files changed, 730 insertions)
- Pushed to GitHub, Vercel auto-deploying

### What's NOT Done Yet
- [ ] Register WisePOS E reader in Stripe Dashboard to get `tmr_xxx` reader ID
- [ ] Add `payment_intent.succeeded` to Stripe Dashboard webhook event types
- [ ] Run migration against Supabase (`npx supabase db push` or SQL Editor)
- [ ] Set `STRIPE_TERMINAL_READER_ID` in `.env.local` and Vercel env vars
- [ ] Test with Stripe simulated reader in test mode
- [ ] A2P registration on Quo (blocked on number port + paid plan)
- [ ] Port Broadway Motors' real phone number to Quo
- [ ] Resend transactional email integration
- [ ] Voice input (Web Speech API or Whisper) for the chat
- [ ] Chat history persistence (currently in-memory)
- [ ] Stripe live mode activation
- [ ] Wix customer data import (1000+ contacts)

### What's Next
- Enable Stripe Terminal on Stripe account, register WisePOS E hardware
- Run migration, test with simulated reader
- Phase 4: vehicle service history, work orders, labor rates, inventory
- Optional: voice input, chat persistence

### Known Issues / Notes
- Terminal integration is fully built but untestable until Stripe Terminal is enabled on the account and hardware is registered
- Walk-in jobs appear in job list linked to "Walk-In Customer" — can be reassigned later via `linkQuickPayToCustomer()`
- Bottom nav now shows Quick Pay instead of Reports on mobile — Reports is still accessible via sidebar on desktop
- Next.js 16 middleware deprecation warning persists — not blocking
- `ShopPilot_PRD_BroadwayMotors.docx` remains untracked in project root (intentional)
