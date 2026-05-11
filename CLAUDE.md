# ShopPilot - AI-Powered Shop Management System

## Authoritative companion docs

- **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — current shape of the system: features, integrations, outstanding work. Read this when you need to know *what exists*.
- **[`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md)** — table-by-table schema with the *why* behind each column. Canonical types are in `src/types/supabase.ts`.
- **[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)** — design tokens, component primitives, layout patterns. Owns everything visual. Read this before making UI changes; do **not** redocument design rules in CLAUDE.md.
- **[`../SHOPPILOT_ROADMAP.md`](../SHOPPILOT_ROADMAP.md)** — master roadmap: strategy, OS architecture, feature phases (0–6), agent platform, costs, metrics. Predecessor docs archived in `../archive/`.
- **[`UI-AUDIT.md`](./UI-AUDIT.md)** — running list of UI consistency findings.
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

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js App Router (server components), Tailwind CSS, shadcn/ui |
| Backend/DB | Supabase (PostgreSQL, Auth, RLS, Storage, Real-time) |
| AI | Claude API (Anthropic) with function calling — Haiku 4.5 |
| Payments | Stripe (Invoicing, Terminal WisePOS E, Card on File) |
| SMS | Quo (formerly OpenPhone) — triple-line routing |
| Email | Resend |
| Hosting | Vercel — auto-deploy from `master` |

For per-integration detail (env vars, routes, edge cases), see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Status

- **Phase 1 (Foundation): COMPLETE**
- **Phase 2 (Payments & Comms): COMPLETE**
- **Phase 3 (AI Assistant): COMPLETE**
- **Phase 4 (next):** Operational Excellence — vehicle history, work orders, labor rates, inventory, accounting

Per-feature inventory in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Per-session changelog in [`PROGRESS.md`](./PROGRESS.md).

## Session Workflow

### After Every Change

Whenever code is committed, update **all** of the following that are affected:

1. **`PROGRESS.md`** — session entry (date, what shipped, files touched, what's next, known issues)
2. **`ARCHITECTURE.md`** — only if the *current shape* of the system changed (new feature, retired feature, changed integration). Do NOT add session-level history here.
3. **`DATABASE_SCHEMA.md`** — only if a migration added/changed/removed columns or tables.
4. **`src/types/supabase.ts`** — regenerate after any migration.

**Do not wait until the end of a session.** Update docs as part of each commit's workflow.

### At the Start of a New Session

Read `PROGRESS.md` first to pick up where we left off.

## Development Conventions

- **TypeScript** — strict mode, no `any` types
- **Components** — functional components with hooks, shadcn/ui as base
- **Naming** — PascalCase for components, camelCase for functions/variables, kebab-case for files/routes
- **Database** — snake_case for all table and column names
- **Migrations** — all schema changes via Supabase migrations (never edit schema manually in dashboard)
- **Environment variables** — all secrets in `.env.local`, never committed. Use `NEXT_PUBLIC_` prefix only for client-safe values.
- **Git** — conventional commits (feat:, fix:, chore:, etc.). Work on the `staging` branch. Push feature changes to `staging` first so they can be validated before merging to `master`. Only merge to `master` when the user explicitly asks.
- **Mobile-first** — design for phone screens first, then expand to desktop
- **Front-end design / UI changes** — ALWAYS invoke the front-end design skill before making visual changes, restructuring layouts, or proposing redesigns. Read [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) first for the canonical tokens and patterns.

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

Static review reads the diff. Static review can be wrong about runtime behavior, third-party API contracts, and cross-flow side effects. Before concluding "no bug exists" or "this isn't our bug," verify all four:

1. **Trace the JS data flow** end-to-end — input → Zod parse → server action → Supabase write → re-read → component prop → DOM. Read every transformation. If you skip a layer, the bug lives there.
2. **Check the DB column types** — schema-drift bugs are invisible at the JS layer. A `text` column where the schema expected `text[]` looks fine in TypeScript and breaks at insert. The `as string[]` cast on `shop_settings.job_categories` (T-1, T-2 in May 2026) hid this for months until the runtime check shipped.
3. **Verify third-party API contracts** — don't assume the SDK comments match the live behavior. Quo SMS responses, Stripe webhook payloads, Resend send results, Supabase nested-select shapes (`customers(...)` inside an `estimates` query returns null when the join FK is null — that's how FH-1 broke the standalone-estimate approval page).
4. **Click through the customer flow** — `/verify-flow <keyword>` exists for this. Use it. Reading the diff isn't enough. The May 2026 broken-submit-button bug had two rounds of multi-agent review mark the form "OK but redundant"; the cause was that react-hook-form's `handleSubmit` flips `isSubmitting=true` BEFORE invoking the user handler, so `if (form.formState.isSubmitting) return` short-circuited every submission. No diff reader caught it; one click would have.

If you skip any of these and conclude "no bug," you'll be wrong like the May 2026 estimate-approval investigation was: schema check would have caught the `jobs.customers` traversal returning null for standalone estimates, and clicking through the public approval page would have shown blank customer/vehicle on every emailed link. Both gates were skipped, both bugs shipped to staging, and the final whole-diff sweep caught them only because the prompt said "walk every customer-facing surface." Make the four checks routine, not heroic.

**The two skills that operationalize this:**
- `/verify-flow <keyword>` — clicks through customer flows in the dev server (handles step 4)
- `/post-deploy-check` — production-side equivalent after merge to master

## Anti-patterns to avoid (these are what the review keeps catching)

These are the recurring failure modes from `REVIEW-FINDINGS.md`. Treat them as hard rules during writing, not just review-time checks.

**Server actions that mutate (`src/lib/actions/*`):**
- MUST call `requireManager()` from `src/lib/auth.ts` at the top, OR have an inline comment explaining why no auth check is needed (e.g., public form endpoint)
- MUST destructure `{ data, error }` from every Supabase call and check `error` — never `const { data } = await supabase.from(...)`
- MUST validate foreign-key inputs (`customer_id`, `vehicle_id`, etc.) before writing — don't trust client-supplied UUIDs
- MUST use `await createClient()` from `@/lib/supabase/server`, NEVER `createAdminClient()` (service role is API-routes-only)
- **Never expose Supabase service role key** to the client. Use anon key + RLS for client-side, service role only in API routes.

**Stripe / external APIs:**
- Always verify Stripe webhook signatures to prevent spoofed events
- Phone numbers MUST be standardized to E.164 format on input for Quo API compatibility

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
npm test                 # Run vitest

# Supabase
npx supabase db push     # Push migrations to remote
npx supabase gen types typescript --project-id <id> > src/types/supabase.ts

# Deployment
git push origin staging  # Push to staging for validation
git checkout master && git merge staging && git push  # Merge to production (only when user approves)
```
