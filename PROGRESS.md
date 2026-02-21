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
- OpenPhone SMS integration (messages table ready)
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
