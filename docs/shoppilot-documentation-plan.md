# ShopPilot Documentation Plan (Revised)

## Instructions

This file contains 5 batch prompts to feed to Claude Code, one at a time. Each batch builds on the previous one. Wait for each batch to complete before starting the next.

All documents should be created as markdown files in a `/docs` folder at the repo root. Create a `/docs/README.md` index file with the first batch and update it with each subsequent batch.

**Total documents: 16** (14 original + business rules + interactive architecture explorer)

---

## Batch 1 — System Foundation

### Prompt

```
I need you to create comprehensive technical documentation for ShopPilot, my custom shop management system for Broadway Motors (auto repair shop in Revere, MA). Read through the entire codebase first, then create the following documents in a /docs folder at the repo root.

Start by creating docs/README.md as an index that links to all documentation files. You'll update this index as more docs are added in future batches.

Create these 5 documents:

---

### 1. docs/system-architecture.md — System Architecture Document

This is the "read this first" document for anyone new to the codebase. It should cover:

**System Overview**
- What ShopPilot is, who it's for, what problem it solves
- High-level architecture: a text-based diagram showing all services and how they connect
- The tech stack with rationale for each choice

**Services & Infrastructure**
- Supabase: project details, what it provides (database, auth, real-time, storage), which plan we're on (Pro) and why
- Vercel: hosting setup, how deployments work, environment config
- Stripe: what it handles (payment links, invoicing, terminal), webhook flow
- OpenPhone (Quo): SMS messaging, how it integrates
- Resend: transactional email, domain setup (broadwaymotorsma.com), what emails get sent
- Claude API: AI assistant, function calling, what tools are available
- Wix Webhook Bridge: temporary integration for parking form submissions

**Application Architecture**
- Next.js app structure: app router layout, route groups, server vs client components
- Authentication flow: Supabase Auth, role-based access (manager vs technician), middleware
- Data flow: how a typical operation flows from user action through the system (e.g., creating an estimate and sending it to a customer)
- AI assistant architecture: system prompt, tool definitions, how function calling works, confirmation flow for financial actions

**Design System**
- Reference to the existing design system doc
- Font, color palette, component patterns (flat line items with color bars, stone palette, etc.)

**Key Design Decisions**
- Why we built custom instead of using Tekmetric/Shop Monkey/Shopware
- Why jobs are the central entity (not separate work orders/repair orders)
- Why RO numbers are a column on jobs, not a separate table
- Why AI assistant is the primary interface, not just the dashboard
- Why inspections use a dedicated count table instead of job line items
- Any other architectural decisions you find in the code that are worth documenting

---

### 2. docs/database-schema.md — Database Schema Reference

A complete reference for every table in the Supabase database. For each table:

- Table name and purpose
- Every column: name, type, nullable, default, constraints
- Foreign key relationships (what it links to and the cascade behavior)
- Indexes
- Row-level security policies (if any)

Include these tables (among any others found):
- customers, vehicles, jobs, job_line_items, job_presets
- estimates, estimate_line_items, invoices
- messages, users, shop_settings
- parking_reservations
- daily_inspection_counts

Also document:
- The RO number sequence (ro_number_seq) and how it works
- The overall entity-relationship model (text-based diagram showing how customers → vehicles → jobs → estimates → invoices → line items connect)
- Any database functions or triggers
- Migration history: list all migrations in order with a one-line description of what each does

Get this information by reading the migration files, the Supabase types file, and the actual schema from the codebase. Be precise — this is a reference document, not a summary.

---

### 3. docs/api-integrations.md — API & Integration Reference

Document every external service integration. For each one:

- What it does in ShopPilot
- How it's configured (environment variables needed, no actual values)
- Key endpoints or SDK methods used
- Webhook endpoints (URL path, what triggers them, what they do)
- Error handling approach
- Rate limits or usage considerations
- How to test it

Cover these integrations by reading the actual code:
- Supabase (client setup, auth, database queries — document both `createClient()` and `createAdminClient()` and when to use each)
- Stripe (payment links, invoices, webhooks, terminal if implemented)
- OpenPhone/Quo (SMS sending, webhook for incoming messages)
- Resend (email sending, templates, domain verification)
- Claude API (function calling setup, tool definitions, system prompt location)
- Wix Webhook Bridge (parking form → reservation pipeline)

Also include:
- A master list of all environment variables the app needs, grouped by service
- Where env vars are configured (Vercel dashboard, .env.local for dev)

---

### 4. docs/environment-setup.md — Environment & Deployment Guide

A step-by-step guide for setting up the project from scratch. This should be detailed enough that a developer with no context could get ShopPilot running locally and deploy it.

**Local Development Setup**
- Prerequisites (Node version, npm/yarn, Git)
- Clone the repo
- Install dependencies
- Environment variables: what's needed, where to get each value
- Supabase local setup (or connecting to the hosted project)
- Running the dev server
- Common gotchas (especially the timezone issue — Vercel runs UTC, shop is EST)

**Deployment**
- How Vercel deployment works (Git push → auto-deploy)
- Branch strategy (if any)
- Environment variables in Vercel
- Custom domain setup
- How to verify a deployment worked

**Supabase Administration**
- How to access the Supabase dashboard
- Running migrations
- How the database backup works (Pro plan daily backups)
- How to do a manual data export
- How to access logs

**DNS & Email Setup**
- broadwaymotorsma.com domain: where it's registered, what DNS records exist
- Resend domain verification: DKIM, SPF records
- How the main domain (broadwaymotorsrevere.com) relates to the email domain

**Infrastructure Costs**
- Monthly cost breakdown by service
- What's on free tier, what's paid, what's per-transaction

Read the actual project config files (package.json, next.config, vercel.json if exists, .env.example if exists, supabase config) to make this accurate.

---

### 5. docs/business-rules.md — Business Rules & Invariants

**CRITICAL DOCUMENT.** This captures every business rule, data invariant, and "never do this" pattern discovered during development and production use. This is the document that prevents recurring bugs.

**Timezone Rules**
- Vercel runs in UTC. The shop operates in America/New_York (Eastern Time).
- ALL server-side "today" calculations MUST use `todayET()` from `@/lib/utils` — returns a `YYYY-MM-DD` string in ET.
- `nowET()` returns a Date object parsed from an ET-formatted string. `formatDateET()` applies ET conversion to a Date object.
- **NEVER combine `nowET()` with `formatDateET()`** — this applies the ET timezone conversion TWICE. Near midnight ET, this shifts dates back by one day. This bug affected the dashboard (showing yesterday's revenue at 1 AM), parking (tomorrow showing same as today), and report date ranges (week boundaries off by a day).
- **Correct pattern for date arithmetic:** Parse `todayET()` as `new Date(todayET() + "T12:00:00")` (noon avoids DST edge cases), perform arithmetic, extract result with `.toISOString().split("T")[0]`.
- Job `date_received` and `date_finished` values are stored as ET date strings (set via `todayET()`).
- Report date ranges (`date-range.ts`) must derive bounds from `todayET()`, not `new Date()`.

**Next.js Caching Rules**
- `unstable_cache` callbacks CANNOT call `cookies()`. The `createClient()` Supabase helper calls `cookies()` internally, so it CANNOT be used inside `unstable_cache`.
- Inside `unstable_cache`, use `createAdminClient()` (service role key, no cookies needed).
- Server actions (`"use server"`) CAN use `createClient()` normally — they run in request context where `cookies()` is available.
- `revalidatePath()` only works in server actions and route handlers, not in `unstable_cache` callbacks.

**Job Lifecycle**
- Job statuses: Not Started → Waiting for Parts → In Progress → Complete.
- When status changes to "complete", `date_finished` is auto-set to `todayET()`. When status changes away from "complete", `date_finished` is cleared to `null`.
- `date_finished` can be manually edited after the fact (for backdating corrections) via the `DateFinishedEditor` component on the job detail page.
- Payment is tracked separately from job status: `payment_status` (unpaid → invoiced → paid / waived), `payment_method` (stripe/cash/check/ach/terminal).
- RO numbers are auto-assigned via PostgreSQL sequence `ro_number_seq` on insert. They are never manually set or edited.

**Inspection Tracking**
- Inspections are tracked in the `daily_inspection_counts` table, NOT in job line items.
- Two types: State ($35/vehicle) and TNC ($15/vehicle).
- The old system created jobs with line items but never set the `category` column, making inspections invisible to category-filtered reports. The new system is completely independent of the jobs table.
- Dashboard and reports both pull inspection data from `daily_inspection_counts` exclusively.
- Inspection revenue = (state_count × $35) + (tnc_count × $15).

**Parking Reservations**
- Parking statuses: reserved → checked_in → checked_out (or no_show / cancelled).
- Check-in and check-out can be undone (undo sets status back and clears the timestamp).
- Parking lots are defined in `PARKING_LOTS` array in `src/lib/constants.ts`.
- Parking customers are auto-linked to the `customers` table via `findOrCreateParkingCustomer()` — dedup by email first, then phone.
- The "Picking Up Tomorrow" dashboard query must include BOTH `checked_in` AND `checked_out` statuses (vehicles may be pre-checked-out / "prepared" the day before).

**Financial Calculations**
- Tax rate: configurable in `shop_settings`, default Massachusetts 6.25%.
- Tax applies to: parts + shop supplies. Tax does NOT apply to: labor, hazmat/environmental fee.
- Shop supplies fee can be scoped to specific job categories via `shop_supplies_categories` (null = all categories).
- Hazmat fee can similarly be scoped via `hazmat_categories`.
- All totals are computed via the shared `calculateTotals()` utility in `src/lib/utils/totals.ts`.
- Part cost (wholesale price) is optional. Reports compute actual gross profit when cost data is available, fall back to 40% margin estimate otherwise.
- Cost data is NEVER exposed to customers (invoices, estimates, print RO all use retail price only).

**Search Patterns**
- Parking search uses `.or()` with `ilike` across: first_name, last_name, license_plate, confirmation_number, phone, make, model.
- Job search queries customers and vehicles in separate Supabase calls first, then combines matching IDs into an `or` filter on jobs.
- Customer search is server-side paginated (50 per page) with URL params.

**Supabase Client Usage**
- `createClient()` — server-side, uses cookies for auth context. Use in server actions, route handlers, and RSC data fetching (NOT inside `unstable_cache`).
- `createAdminClient()` — server-side, uses service role key, bypasses RLS. Use in `unstable_cache` callbacks, background jobs, and operations that need elevated access.
- `createBrowserClient()` — client-side, uses anon key. Used in client components for real-time subscriptions and client-side queries.

**AI Assistant Safety**
- Financial actions (creating invoices, sending payment links) require explicit user confirmation in the chat.
- The system prompt at `src/lib/ai/system-prompt.ts` defines all behavioral rules.
- 43 tools are defined in `src/lib/ai/tools.ts`.

Read the codebase thoroughly to find and document ALL business rules. The sections above are the known critical ones, but there may be more embedded in the code. Reference the exact file paths where each rule is implemented.
```

---

## Batch 2 — Operations

### Prompt

```
Continue building ShopPilot documentation. Read the existing docs in /docs to understand what's been covered. Create these 4 new documents and update docs/README.md to include them.

---

### 6. docs/ai-assistant.md — AI Assistant Reference

This is critical documentation since the AI assistant is ShopPilot's primary interface. Read the system prompt, tool definitions, and chat implementation thoroughly.

**Overview**
- What the AI assistant does and how it's accessed
- The conversational model: how users interact (text and voice)
- Mobile-first design intent

**System Prompt**
- Document the full system prompt (or reference its file location)
- Explain each section of the prompt: role definition, shop context, behavioral rules
- How the prompt tells the AI about Broadway Motors specifically

**Tool/Function Reference**
- List every tool the AI assistant can call
- For each tool: name, description, parameters, what it does, what it returns
- Group them by category (customer operations, job operations, estimates, invoicing, messaging, parking, inspections, etc.)

**Confirmation & Safety**
- Which actions require user confirmation before executing (especially financial actions)
- How the confirmation flow works
- What happens if the AI makes a mistake (correction workflow)

**Conversation Flow Examples**
- Document the key workflows a shop manager would use:
  - "Look up John Smith" → customer lookup
  - "Create a job for Jane's Civic, brake pads and rotors" → job creation with line items
  - "Send Jane the estimate" → estimate generation and SMS/email delivery
  - "Jane's car is done, $450 for brakes, send her the bill" → multi-step: update status, create invoice, send payment link
  - "What jobs are in progress?" → status query
  - "How many inspections did we do today?" → inspection counts from daily_inspection_counts table

**Voice Input**
- How voice input works (Web Speech API or Whisper, whatever is implemented)
- Any limitations or considerations

**Adding New Tools**
- How a developer would add a new tool to the AI assistant
- File locations, type definitions, registration process

---

### 7. docs/runbook.md — Operational Runbook

Step-by-step procedures for handling common operational issues. This is the "something is wrong, what do I do" document. Write it for a non-technical shop manager.

**Monitoring & Health Checks**
- How to check if ShopPilot is up and running
- UptimeRobot setup (if configured, or note that it needs to be set up)
- How to check Supabase status
- How to check Stripe status

**Failure Scenarios & Procedures**

For each scenario, provide: symptoms, likely cause, immediate steps, resolution, fallback workaround.

- ShopPilot website is down / not loading
- Can't log in / authentication errors
- Customer search not working / database errors
- AI assistant not responding or giving errors
- Stripe payment link not working
- Customer says they didn't receive SMS
- Customer says they didn't receive email
- Estimate email/SMS sent but customer can't view it
- Stripe webhook not updating job status after payment
- Job data looks wrong or corrupted
- Dashboard showing wrong day's data (timezone issue — reference business-rules.md)
- Inspections count not showing on dashboard or reports
- Parking "tomorrow" section showing same as "today"
- Slow performance / pages loading slowly

**Fallback Procedures**
- How to process a payment if ShopPilot is completely down (Stripe app/dashboard directly)
- How to look up customer info if the app is down (Supabase dashboard direct query)
- How to send a customer an invoice manually through Stripe

**Maintenance Tasks**
- Weekly: what to check, any manual tasks
- Monthly: review, cleanup, any exports needed
- How to check error logs (Vercel function logs, Supabase logs)

Read the codebase to understand what can actually go wrong and provide accurate troubleshooting steps. Reference actual file paths, API endpoints, and dashboard URLs where relevant. Cross-reference docs/business-rules.md for common pitfall patterns.

---

### 8. docs/backup-recovery.md — Backup & Recovery Procedures

**Automated Backups**
- Supabase Pro daily backup: what it covers, retention period, how to verify it's running
- What is NOT backed up automatically (env vars, Vercel config, DNS settings)

**Manual Backup Procedures**
- How to export the full database manually (pg_dump via Supabase)
- How to export specific tables (customers, jobs, etc.)
- Recommended schedule for manual exports
- Where to store backups (Google Drive, local, etc.)
- How to export Stripe data

**Recovery Procedures**
- How to restore from a Supabase daily backup (point-in-time recovery)
- How to restore from a manual export
- How to rebuild the Vercel deployment from scratch
- How to reconfigure environment variables from scratch
- How to re-verify the email domain with Resend

**Disaster Recovery Plan**
- Complete system loss: step-by-step rebuild procedure
- Priority order: what to restore first to get the shop operational
- Estimated recovery time for each scenario
- Who to contact for each service (Supabase support, Vercel support, Stripe support)

**Data Integrity Checks**
- How to verify customer count matches expectations
- How to verify no orphaned records (jobs without customers, etc.)
- How to verify RO number sequence is correct
- How to verify daily_inspection_counts data is consistent

---

### 9. docs/monitoring.md — Monitoring & Alerting Setup

**What to Monitor**
- ShopPilot web application (Vercel URL)
- Supabase database availability
- Stripe webhook endpoint
- DNS/email domain health

**UptimeRobot Setup** (document the recommended configuration even if not yet set up)
- Monitors to create: URL, check interval, alert contacts
- What HTTP status codes indicate problems
- Alert notification preferences (email, SMS)

**Vercel Monitoring**
- How to access Vercel function logs
- How to check deployment status
- How to view error rates
- Analytics and usage dashboards

**Supabase Monitoring**
- Database health dashboard
- Connection pool status
- Storage usage
- API request logs

**Stripe Monitoring**
- Webhook delivery logs (how to check if webhooks are failing)
- Failed payment alerts
- Dispute/chargeback monitoring

**Alert Response Matrix**
- For each type of alert: who gets notified, severity level, expected response time, escalation path

Keep this practical — it's for a one-person shop, not a DevOps team. Focus on the critical alerts that mean "something is broken and customers are affected."
```

---

## Batch 3 — User Guides

### Prompt

```
Continue building ShopPilot documentation. Read the existing docs in /docs to understand what's been covered. Create these 3 new documents and update docs/README.md to include them.

These are user-facing guides written for non-technical shop personnel. Use clear, simple language. Include the actual UI paths (what to click, what screens they'll see). Reference actual page routes from the codebase.

---

### 10. docs/user-guide-manager.md — User Guide: Shop Manager

A comprehensive guide for a shop manager using ShopPilot day-to-day. Write this as if you're training someone who has never seen the system.

**Getting Started**
- How to log in (URL, credentials)
- The dashboard: what you see first, how to navigate
- Mobile vs desktop experience
- The AI assistant: where it is, how to use it, voice vs text

**Customer Management**
- Finding a customer (search, browse, AI)
- Creating a new customer
- Editing customer info
- Viewing a customer's vehicles and history
- Customer types (retail, fleet, parking)

**Vehicle Management**
- Adding a vehicle to a customer
- VIN, year/make/model, mileage tracking
- Viewing vehicle service history

**Job Workflow (the core daily workflow)**
Walk through the complete lifecycle of a job, step by step:
1. Customer calls or walks in
2. Create a new job (via dashboard or AI)
3. Add line items (labor and parts)
4. Build and review the estimate
5. Send the estimate to the customer (SMS and/or email)
6. Customer approves the estimate
7. Update job status as work progresses (Not Started → In Progress → etc.)
8. Assign a technician
9. Complete the work
10. Generate an invoice
11. Send the invoice with payment link
12. Customer pays → automatic status update
13. Print the repair order (RO) for records

**Estimates**
- How to create an estimate
- Adding labor lines and parts lines
- Tax calculation (how it works, Massachusetts rate)
- Sending for approval
- What the customer sees
- Handling approvals and declines

**Invoicing & Payments**
- Generating an invoice from a completed job
- Sending payment links
- Stripe payment flow (what happens when customer pays)
- Checking payment status
- In-person payments (WisePOS E terminal, when available)

**Customer Communication**
- Sending SMS messages
- Sending emails
- Message templates (what's available)
- Viewing communication history

**Job Dashboard Views**
- Board view (Kanban): how to use, what each column means
- List view: sorting and filtering
- Calendar view (if implemented)

**Inspections**
- How to record daily inspection counts
- State vs TNC inspections and their rates
- How inspections show up in reports

**Parking Management**
- Overview of the parking dashboard
- Checking in / checking out vehicles
- Undoing check-in or check-out mistakes
- Searching reservations (by name, license plate, make, model, phone, confirmation number)
- Service leads (parking customers interested in repairs)

**Using the AI Assistant for Common Tasks**
- List the most common voice/text commands with examples
- Tips for getting the best results
- What the AI can and can't do

**Repair Orders**
- What an RO number is
- How to print a repair order
- What's included on the printed document

**Reports**
- What reports are available
- How to access them
- Date range presets (This Week, This Month, This Quarter, This Year, All Time, Custom)
- Understanding revenue, profit, and inspection numbers

---

### 11. docs/user-guide-technician.md — User Guide: Technician

A shorter guide for technicians who have limited access (no financials).

**Getting Started**
- How to log in
- What you can see and what you can't (no pricing, no invoices, no payment info)

**Viewing Assigned Jobs**
- How to see your assigned jobs
- Job detail view: what's visible to a tech
- Understanding job statuses

**Updating Job Progress**
- How to change a job's status
- Adding notes to a job
- Logging what was done

**What You Don't Have Access To**
- Be explicit about what's restricted: estimates, invoicing, payment info, customer financial data, reporting

---

### 12. docs/communication-templates.md — Customer Communication Templates

Document every message template or communication pattern in the system. Read the actual code to find these.

**SMS Templates**
For each template:
- Template name/purpose
- When it's triggered (manual or automatic)
- The actual message text (or the template pattern with variables)
- What variables get filled in (customer name, amount, link, etc.)
- What the customer sees on their phone

Templates to document (find the actual content from the code):
- Estimate ready for review
- Car is ready for pickup
- Payment reminder
- Invoice/payment link
- Job status update
- Any other templates in the code

**Email Templates**
Same structure as SMS:
- Template name/purpose
- When it's triggered
- Subject line
- Body content (or template pattern)
- What the customer sees

**Communication Best Practices**
- When to use SMS vs email
- Timing considerations
- How to customize or personalize messages
- How to view communication history for a customer

**OpenPhone Integration Notes**
- Messages come from the shop's real business number
- How the shared inbox works
- Where to see the communication log in ShopPilot
```

---

## Batch 4 — Business & Compliance

### Prompt

```
Continue building ShopPilot documentation. Read the existing docs in /docs to understand what's been covered. Create these 3 new documents and update docs/README.md to include them.

---

### 13. docs/financial-workflow.md — Financial Workflow Document

This document traces the complete money trail through ShopPilot. Written for the shop owner and their accountant.

**The Financial Lifecycle of a Job**
Walk through every step where money is involved:
1. Estimate creation: how pricing works (labor rates, parts markup, tax)
2. Estimate approval: customer authorizes the work
3. Work performed: costs may change (additional parts, scope changes)
4. Invoice generation: how the invoice is created from the job's line items
5. Payment collection: Stripe payment link flow
6. Payment confirmation: webhook updates job status
7. Accounting record: how the transaction maps to bookkeeping

**Pricing Structure**
- How labor rates are configured (hourly rate, flat-rate, diagnostic rate)
- How parts are priced (cost vs retail, markup percentage)
- Tax calculation: Massachusetts 6.25% — document what's taxable (parts + shop supplies are taxable; labor and hazmat are NOT)
- How totals are calculated (subtotals, tax, grand total) — reference `calculateTotals()` in `src/lib/utils/totals.ts`
- Shop supplies fee: 4 calculation methods (percent of labor/parts/total/flat) + cap, category scoping
- Hazmat/environmental fee: flat amount, category scoping
- Inspection revenue: State ($35/vehicle) + TNC ($15/vehicle) from `daily_inspection_counts` table

**Stripe Integration Details**
- Payment links: how they're generated, what the customer sees, expiration
- Invoice objects in Stripe: how they map to ShopPilot invoices
- Webhooks: the exact events listened for, what each one triggers in ShopPilot
- In-person payments (terminal): flow when available
- Refund process (if implemented, or note it's manual through Stripe dashboard)
- Transaction fees: 2.9% + $0.30 online, 2.7% + $0.05 in-person

**Payment Reconciliation**
- How ShopPilot solves the old Wix batch deposit problem
- Each payment maps to a specific job
- How to verify payments match invoices

**Accounting Integration** (current state)
- What's in place now vs what's planned (Wave Apps or QuickBooks sync)
- How to manually export financial data for the accountant
- How job categories could map to accounting categories
- Monthly/quarterly reporting for taxes

**Financial Controls & Audit Trail**
- Who can create estimates (role-based)
- Who can generate invoices
- The AI confirmation requirement before financial actions
- How to trace any payment back to its job, customer, and vehicle

---

### 14. docs/data-privacy.md — Data & Privacy Policy

Document what customer data ShopPilot stores, where, and how it's protected. This isn't a public-facing privacy policy — it's an internal reference so you know exactly what you're handling.

**Data Inventory**
For each data type, document: what's collected, where it's stored, who has access, retention period.

- Customer PII: names, phone numbers, email addresses, physical addresses
- Vehicle data: VIN, year/make/model, mileage history, license plates
- Financial data: invoice amounts, payment status (note: actual credit card data stays in Stripe, never in ShopPilot)
- Communication logs: SMS messages, emails sent
- Service history: jobs, line items, parts used, notes
- Parking data: reservation details, drop-off/pick-up dates, lot assignments

**Where Data Lives**
- Supabase (PostgreSQL): primary data store, hosted region, encryption at rest
- Stripe: payment data, PCI compliance (Stripe handles this, not ShopPilot)
- OpenPhone: SMS/call logs (separate system)
- Resend: email delivery logs
- Vercel: application logs (what's logged, retention)
- No customer data stored in the browser/localStorage/cookies beyond auth session

**Access Controls**
- Manager role: full access
- Technician role: what they can and cannot see
- Supabase RLS policies (if any)
- Who has admin access to each service (Supabase dashboard, Stripe dashboard, Vercel, etc.)

**Data Protection**
- HTTPS everywhere (Vercel provides SSL)
- Supabase encryption at rest
- Auth token handling
- No plaintext passwords (Supabase Auth handles this)
- API keys: where they're stored, who has access

**Massachusetts Data Privacy Requirements**
- Massachusetts has data breach notification laws (M.G.L. c. 93H)
- If a breach occurs: who to notify, timeline requirements
- What constitutes a breach under MA law
- Note: consult an attorney for full compliance — this is a reference, not legal advice

**Data Deletion**
- How to delete a customer's data if requested
- Cascade behavior (what happens to their jobs, vehicles, messages)
- What Stripe retains separately (payment records for tax/legal purposes)
- How to handle a "right to delete" request

**Third-Party Data Sharing**
- Document which third parties receive customer data and why:
  - Stripe: payment processing (name, email, invoice amounts)
  - OpenPhone: SMS delivery (phone numbers, message content)
  - Resend: email delivery (email addresses, message content)
  - Claude API: customer data sent in tool calls (names, vehicle info, job details — document what goes to the AI)

---

### 15. docs/design-system.md — Design System (Refresh)

Read the existing SHOPPILOT_DESIGN_SYSTEM.md file (likely in the repo root or /docs). Update it or create a new version that reflects the current state of the built system. Cross-reference the actual components in the codebase.

**Visual Identity**
- Colors: the exact hex values used (stone palette, accent colors, status colors)
- Typography: Geist font, size scale, weight usage
- Spacing and layout conventions

**Component Library**
Document every reusable UI component with:
- Component name and file path
- What it looks like (describe the visual appearance)
- Props it accepts
- Where it's used
- Usage example

Group by category:
- Layout components (dashboard shell, sidebar, mobile nav)
- Data display (job cards, customer cards, stat cards)
- Forms (customer form, job form, line item editor)
- Tables (jobs list, customer list, line items)
- Navigation (tabs, pagination, filters)
- Feedback (toasts, alerts, loading states, empty states)
- Print (repair order print layout)

**Page Patterns**
- Dashboard views: board, list, calendar
- Detail pages: customer detail, job detail, vehicle detail
- Forms: create/edit patterns
- Mobile-responsive behavior: what changes at mobile breakpoints

**Status Colors & Meanings**
- Job statuses and their associated colors
- Payment statuses and their colors
- Estimate statuses and their colors
- Parking statuses and their colors

**Iconography**
- What icon library is used
- Common icons and their meanings

**Print Styles**
- @media print CSS rules
- What gets hidden, what gets shown
- Page layout and margins

Then update docs/README.md with the final complete index of all 16 documents.
```

---

## Batch 5 — Interactive Architecture Explorer

### Prompt

```
Create an interactive HTML architecture explorer for ShopPilot using the Playground plugin. This should be a self-contained single-file HTML page that visualizes the entire ShopPilot system architecture interactively.

Use the /playground skill to build this. The playground should let users:

1. **Explore the system visually** — Show all services (Next.js app, Supabase, Stripe, Quo/OpenPhone, Resend, Claude API, Wix Bridge) as interactive nodes
2. **Click on any service** to see:
   - What it does in ShopPilot
   - Key files and code paths
   - Environment variables needed
   - How it connects to other services
3. **Trace data flows** — Click on a flow (e.g., "Job → Invoice → Payment") to see the complete path through the system
4. **View the database schema** — Interactive table viewer showing relationships
5. **Browse business rules** — Searchable/filterable list of all business rules from docs/business-rules.md

The playground should be saved to `docs/architecture-explorer.html` and linked from docs/README.md.

Read the existing documentation in /docs (especially system-architecture.md, database-schema.md, api-integrations.md, and business-rules.md) to populate the explorer with accurate data. The explorer should be a useful interactive companion to the written documentation.
```

---

## After All Batches

Once all 5 batches are complete, verify:
- [ ] /docs/README.md links to all 16 documents (15 markdown + 1 HTML explorer)
- [ ] All file paths and code references are accurate
- [ ] No placeholder content — everything should be derived from the actual codebase
- [ ] Documents cross-reference each other where appropriate
- [ ] business-rules.md covers all known invariants and "never do this" patterns
- [ ] The architecture explorer loads and works as a standalone HTML file

## Document Index (Complete)

| # | Document | Batch | Purpose |
|---|----------|-------|---------|
| 1 | system-architecture.md | 1 | High-level system overview, tech stack, design decisions |
| 2 | database-schema.md | 1 | Complete table/column/relationship reference |
| 3 | api-integrations.md | 1 | External service integration details + env vars |
| 4 | environment-setup.md | 1 | Dev setup, deployment, infrastructure |
| 5 | business-rules.md | 1 | **NEW** — Invariants, timezone rules, caching constraints, "never do this" patterns |
| 6 | ai-assistant.md | 2 | AI tools, system prompt, conversation flows |
| 7 | runbook.md | 2 | Troubleshooting procedures for common failures |
| 8 | backup-recovery.md | 2 | Backup/restore/disaster recovery |
| 9 | monitoring.md | 2 | Monitoring setup and alert response |
| 10 | user-guide-manager.md | 3 | Complete shop manager user guide |
| 11 | user-guide-technician.md | 3 | Technician user guide (limited access) |
| 12 | communication-templates.md | 3 | SMS/email templates and patterns |
| 13 | financial-workflow.md | 4 | Money trail, pricing, Stripe, accounting |
| 14 | data-privacy.md | 4 | Data inventory, access controls, MA compliance |
| 15 | design-system.md | 4 | UI components, colors, patterns, print styles |
| 16 | architecture-explorer.html | 5 | **NEW** — Interactive visual architecture explorer |
