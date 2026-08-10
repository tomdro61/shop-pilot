# Design: Split-Tender Payments (cash + card, or two cards)

> 📋 **The authoritative plan is [Plan (v3) — the transient-tender design](#plan-v3--the-transient-tender-design).**
> Read that. Everything after it is history: **Appendix A** is the original design (v1), **Appendix B**
> is the adversarial review that killed it (v2). v1 would have caused live double-charges on day one
> and shipped a world-writable money table; v3 exists because reframing a split as a *transient
> checkout event* rather than a durable job state removes the requirement that created ~80% of those
> findings.

> ⏸️ **Parked 2026-08-10, pending [`money-layer-design.md`](./money-layer-design.md).** The dashboard
> revenue incident traced to the same root cause as this doc's Constraint 4 — the grand total exists
> only in JS, never in the database. Building split-tender first means building it against a JS-only
> total, which is exactly what forces the caller-supplied `p_total`, its forgery surface, and the
> `total_snapshot` amendment. Once `job_totals` exists, parts of v3 below delete themselves.

**Status:** v3 written, **parked behind the money layer. Nothing built.**
**Requested:** 2026-07-08 (two-card split at the counter), again 2026-08-05. Logged as roadmap §10.10.
**History:** v1 designed 2026-08-05 · decisions settled 2026-08-10 · v2 review 2026-08-10 (110 findings,
30 Critical, verdict *not bulletproof*) · v3 rewritten 2026-08-10.

---

## The ask

1. Customer pays part on one card, part on another.
2. Customer pays part cash, part card.

Today the workaround is running separate Quick Pay jobs per tender, which fragments one repair across multiple job records — wrong revenue-per-job, wrong RO history, wrong receipt.

---

## Why this isn't a one-column change

Four constraints from the current code, all verified:

**1. A job holds exactly one payment.**
`jobs.payment_status` + `payment_method` + `paid_at` + `stripe_payment_intent_id`. `recordPayment` (`src/lib/actions/jobs.ts:490-515`) *overwrites* these; there is nowhere for a second tender to go.

**2. `payment_status` is read in 28 files.**
Reports, receivables, dashboard, AI tools, validators, receipts, the invoice guards shipped in Session 70–71. Replacing it wholesale is the high-risk path.

**3. Balance is currently binary — in the UI *and* in A/R.**
`job-payment-footer.tsx`: `const balanceDue = isSettled ? 0 : grandTotal`. And `receivables.ts:52-70` filters `payment_status != paid/waived` then sums the **full** line-item total. A half-paid job reports its entire value as outstanding.

**4. The grand total is never stored.** ← the one that shapes the design
There is no `jobs.total` column. `calculateTotals(lineItems, settings, charge_sales_tax)` computes it in JS on every render. Consequences:
- A database trigger **cannot** derive "is this job fully paid" — it doesn't know the total.
- The balance moves if line items or shop settings change after a partial payment.
- Historical payment amounts can't be backfilled in SQL without reimplementing tax/supplies/hazmat logic.

**Two things that make it easier than feared:**
- `/api/terminal/pay` already takes `amountCents`, so charging a partial amount on the Terminal needs no Stripe work — just a caller that passes one.
- Revenue reporting (`reports.ts`) sums **line items**, not payments. Revenue numbers won't shift.

---

# Plan (v3) — the transient-tender design

**Status: awaiting review. Nothing built.** This is the authoritative plan. Appendix A (the original
design) and Appendix B (its review) are kept below as the record of how we got here.

## The idea that shrinks it

**A split tender is a transient checkout event, not a durable job state.** The customer is standing at
the counter; the job is half-paid for about sixty seconds, not sixty days.

v1 modeled `partial` as a first-class payment *state*, which forced it through 28 consumers, A/R, the
tax export, the AI tool schemas and every status map. That is where ~80% of the review's 30 Criticals
came from — and none of it is required by the two cases actually asked for.

**So v3 adds no new enum values.** `payment_status` keeps its existing four values. A job stays
`unpaid` while tenders accumulate and flips to `paid` the moment the ledger covers the total —
which is exactly the transition the code already makes today.

### What that dissolves

These review findings don't get *fixed*; the requirement that created them goes away:

| Review finding | Status under v3 |
|---|---|
| "Compile-time safety is false; money guards fail open" (COMP-5, OPER-7, REG-12, SEC-5) | **Gone** — no new enum value exists to mishandle |
| `partial` bypasses guards → re-bill full amount (DATA-5, CORR-4, REG-2) | **Mostly gone** — guards behave as today; one cheap guard added, see §6 |
| DOR tax basis, accrual vs cash (A12) | **Gone** — the export still filters on `paid`; behavior unchanged, nothing to ask the accountant |
| A/R receivables rework (A14) | **Gone** — behavior unchanged |
| `tenders_authoritative` cutover flag, Decision B sentinel (A17) | **Moot** — nothing derives authority from tender presence |
| `split` as an irreversible one-way door (A21) | **Gone** — not added |
| Line-item lock + DVI trigger (A9, Decision C) | **Moot** — the total can't drift during a 60-second checkout |
| `jobs.total_snapshot` (A3) | **Not needed** — the server recomputes the total per tender, the pattern `chargeCardOnFile` already uses |
| Atomic four-writer cutover (A1) | **Reduced to two small edits** — see §5 |

## 1. Schema

```sql
create table if not exists job_payments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  method payment_method not null,
  stripe_payment_intent_id text unique,   -- null for cash/check; UNIQUE is the idempotency arbiter
  reference text,
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references users(id) on delete set null,
  void_reason text
);

create index if not exists idx_job_payments_job_id on job_payments (job_id);

alter table job_payments enable row level security;

-- Financials: managers only. No tech policy (techs never read money).
-- No service_role policy — service_role is BYPASSRLS.
create policy "managers_full_job_payments" on job_payments
  for all using (is_manager()) with check (is_manager());
```

Three deliberate choices, each carrying a review finding:

- **`on delete restrict`, not cascade.** Deleting a job must not destroy money records. This departs
  from the `job_line_items` / `estimates` / `invoices` cascade precedent on purpose — note it in the
  migration so a later consistency pass doesn't normalize it back.
- **RLS is not optional.** Without it, PostgREST serves the whole ledger to anyone holding
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which ships to every browser. This repo has shipped that exact bug
  twice (`lock_boxes`, `manual_income`); `20260311100000_fix_rls_security.sql` exists because of it.
  `with check` is required separately from `using` — see `20260222000000_fix_rls_with_check.sql`.
- **The index is unfiltered.** The tender list renders voided rows too (each carries its own void
  action), so a `where voided_at is null` partial index can't serve the query.

## 2. The RPC

```
record_job_payment(p_job_id uuid, p_amount_cents bigint, p_total_cents bigint,
                   p_method payment_method, p_pi text default null,
                   p_reference text default null, p_captured boolean default false)
  returns  (balance_cents bigint, is_paid boolean, outcome text)
```

```sql
language plpgsql
security invoker                       -- the RLS policy above is the real gate
set search_path = public, pg_temp
```
```sql
revoke all on function record_job_payment(...) from public, anon;
grant execute on function record_job_payment(...) to authenticated, service_role;
```

Body order matters:

1. `select … from jobs where id = p_job_id for update` — serializes two people tendering at once
2. **Dedupe first.** If `p_pi` matches an existing row, skip the insert, fall through to the
   recompute, return `outcome = 'duplicate'`. This must precede the overpayment check, or a webhook
   retry gets rejected as an overpayment instead of recognized as a repeat
3. Overpayment guard — **unless `p_captured` is true**
4. Insert the tender
5. If `sum(non-voided) >= p_total_cents`, set `payment_status = 'paid'`, `paid_at = now()`,
   `payment_method` = this tender's method. Otherwise leave the job exactly as it is
6. Return the new balance

**`security invoker` with no in-function role gate is deliberate.** The review found that an
in-function `if auth.uid() is not null and not is_manager()` check passes for anonymous callers,
because anon and service_role both yield a null `auth.uid()`. The REVOKE plus RLS is the correct
enforcement: `anon` can't execute at all, `authenticated` runs under the managers-only policy, and
`service_role` (the webhook and status route) is BYPASSRLS.

**Integer cents across the boundary**, stored as `numeric(10,2)` for display consistency with
`invoices.amount`. In dollars, float residue rejects "pay the exact remaining balance" — the single
most common action in the feature — as an overpayment.

**`p_total_cents` is computed server-side, never accepted from the client.** The calling server action
refetches line items and shop settings and runs `calculateTotals` itself, exactly as
`chargeCardOnFile` does at `charge-card-on-file.ts:131-146`.

**`p_captured` exists because a rejected capture is stranded money.** Refunds are out of scope, so
when Stripe has already taken the money the RPC always records it — the guard is pre-capture only.
If a captured tender pushes the sum past the total, record it, flip to `paid`, and
`Sentry.captureMessage("split_tender_overcapture")` with the job id and delta. Never clamp the
amount: the ledger must equal what Stripe actually took or reconciliation is impossible.

## 3. Voiding

`void_job_payment(p_payment_id uuid, p_reason text)` — same triad (`plpgsql`, `security invoker`,
`search_path`, REVOKE/GRANT), same `for update` lock on the parent job, idempotent
(`where voided_at is null`; zero rows updated returns the current balance rather than raising).

After voiding, if the job no longer covers its total, it goes back to `unpaid` and `paid_at` is
nulled. This is the only backwards transition in the design, which is exactly why it needs a real
contract instead of a UI bullet.

## 4. UI — what you described

**Terminal Pay** opens a small dialog before arming the reader:

```
  Amount to charge
  ( • ) Full balance          $186.20
  (   ) Partial               [ $______ ]
                     [ Cancel ]  [ Charge ]
```

**Mark as Paid** gains an amount field on the same pattern — pick Cash, confirm or edit the amount,
done. "Paid the rest in cash" is just the default value being the remaining balance.

**The footer** gets the tender list and a real balance:

```
  Grand Total     Balance Due    Payment              [Charge Card] [Terminal Pay] [Mark as Paid ▾]
  $386.20         $186.20        ● Partially Paid
                                 Cash $200.00 · 2:14pm  ⌫
```

"Partially Paid" is a **display string computed in the component** from `tenders.length > 0 &&
balance > 0`. It is not a database value — no enum, no migration, none of the risk.

**`job-payment-footer.tsx:133` and `:140` currently pass `Math.round(grandTotal * 100)` to
ChargeCardOnFileButton and TerminalPayButton. They change to balance due.** Those two lines are the
entire double-charge guard — with them, the second tap offers $186.20; without them, it offers
$386.20 on a job that already collected $200.

## 5. Write paths — two Stripe edits, not four

| Path | Change |
|---|---|
| `recordPayment` (`jobs.ts:490`) | Gains an optional amount; calls the RPC. Keeps its signature so the AI tool and existing callers work — no amount means "settle the full balance" |
| `/api/terminal/status:37-53` | Calls the RPC instead of the unconditional `update … set payment_status='paid'` |
| webhook `handleTerminalPayment` (`webhooks/route.ts:518-530`) | **Must change.** It has *no* status predicate at all today, so left alone it stomps a half-paid job to `paid`. Same RPC, same PI as the idempotency key |
| webhook `handleInvoicePaid` | **Unchanged.** Invoice-settled jobs aren't counter splits |
| `chargeCardOnFile` | **Unchanged in v1** — it pays through an invoice and holds no PaymentIntent, so there's no idempotency key. Card-on-file splits are deferred |

## 6. Guards — small, and each closes a real hole

- `deleteJob` (`jobs.ts:440`) refuses when **any** `job_payments` row exists, voided or not — matching
  the FK exactly, so the operator never sees a raw 23503
- `cancelJob` (`jobs.ts:399`) refuses when a **non-voided** tender exists. Cancel deletes nothing, so
  voided-only history may cancel; the asymmetry is intentional
- `createInvoiceFromJob` and `resendInvoiceForJob` refuse when a non-voided tender exists. **This one
  does not dissolve under v3**: a job with a $200 cash tender is still `unpaid`, so today's guard
  (`paid`/`waived` only) would invoice the customer the full $386.20. Rare, because partial is
  transient — but it's a real overcharge and the guard is ten lines
- Every guard destructures `{ error }` and fails closed

## 7. What we're accepting

Stated plainly so nobody discovers these later:

- **A half-paid job reads "Unpaid" in the jobs list and counts as fully outstanding in A/R.** Invisible
  for a 60-second counter event. It only misreports if someone genuinely walks out half-paid
- **Card-on-file splits aren't supported in v1** — Terminal, cash, check and ACH are
- **Legacy paid jobs show no tender list.** The footer falls back to today's single `payment_method`
  line when there are no tenders. No backfill (Decision B stands)
- **A tech can already `PATCH /rest/v1/jobs` with `payment_status`** — `techs_update_assigned_jobs`
  (`rls_policies.sql:92-96`) has no column restriction and no `WITH CHECK`. Pre-existing, not created
  here; worth its own fix later

## 8. Build order (~3–5 days)

1. Migration: table, RLS, both RPCs, `on delete restrict` → `supabase gen types`
2. `recordJobPayment` server action + unit tests (overpay, duplicate PI, captured, concurrent)
3. Footer: amount dialog, tender list, real balance, the two `grandTotal` → balance changes
4. Terminal status route + `handleTerminalPayment` cutover; idempotency tests for double-fire
5. The §6 guards
6. `/sketch-flow` before step 2 (money code), `/verify-flow quick-pay` and a real counter split before
   declaring done, `/scoped-review` on the whole thing

## 9. Open questions for review

1. **Is a deposit-then-finish-later flow in scope?** Everything above assumes the split completes in
   one visit. If deposits are real, the "transient" premise weakens and the A/R misreporting in §7
   stops being invisible
2. **Should `Mark as Paid` keep its one-click behavior for the normal full-payment case?** Adding an
   amount step to the 95% case to serve the 5% case would be a bad trade — proposal is that the
   dialog defaults to the full balance and Enter confirms
3. **Void: manager-only, or any staff?** §3 assumes manager-only via RLS

---

## Decisions (2026-08-10) — and where they land in v3

| # | Question | Decision | Under v3 |
|---|---|---|---|
| A | Overpayment | **Block.** Amount field defaults to the remaining balance; cash change is handed back at the counter, not modeled | **Stands, with one amendment the review forced:** the block is *pre-capture only*. Once Stripe has taken the money it is always recorded (`p_captured`), because refunds are out of scope and a rejected capture is stranded money |
| B | Backfill historical payments | **No backfill** | **Stands, and gets safer** — nothing in v3 derives authority from tender presence, so the sentinel can't decay. Legacy paid jobs just show today's single payment-method line |
| C | Lock line items once partially paid | **Yes** | **Dropped.** The lock existed to stop the total drifting under a partial payment. A 60-second checkout can't drift, and the server recomputes the total on every tender anyway. This also removes the DB trigger that would have blocked the customer-facing DVI approval page |
| D | Capture card last-4 per tender | **Skip for v1** | **Stands** — `reference` is there when you want it |

---

# Appendix A — original design (v1, superseded)

> Kept for the record. **Do not build from this.** The review in Appendix B found 30 Critical problems
> with it; v3 above is what replaced it.

## Proposed design

### 1. `job_payments` becomes the source of truth

```sql
create table job_payments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method payment_method not null,
  stripe_payment_intent_id text unique,   -- null for cash/check
  reference text,                          -- check #, card last-4, "Visa ••4242"
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,                   -- corrections; never hard-delete money
  voided_by uuid references users(id)
);
create index on job_payments (job_id) where voided_at is null;
```

`numeric(10,2)` in dollars, matching `invoices.amount` and `job_line_items.total`, with the cents→dollars conversion staying at the Stripe boundary where it already lives.

Voids rather than deletes: a mis-keyed tender needs an audit trail, and `paid_at`/tax exports depend on history.

### 2. Keep the `jobs` columns, derived — don't remove them

This is the central call. `jobs.payment_status`, `payment_method`, `paid_at` stay, recomputed on every tender write:

| Column | Derivation |
|---|---|
| `payment_status` | `sum(tenders) = 0` → `unpaid`; `0 < sum < total` → **`partial`** (new enum value); `sum >= total` → `paid`. `waived` still set manually. |
| `payment_method` | Single tender → that method. Multiple → **`split`** (new enum value). |
| `paid_at` | `created_at` of the tender that closed the balance. Null while partial. |

All 28 existing consumers keep working unchanged. Adding `partial`/`split` to the enums breaks `Record<PaymentStatus, …>` maps at **compile time** — loud, not silent, and there are only a handful.

### 3. One RPC does the write, atomically

A trigger can't do this (constraint 4), so an RPC mirroring the existing `record_quick_pay_job` precedent:

```
record_job_payment(p_job_id, p_amount, p_method, p_total, p_pi, p_reference, p_created_by)
```

- `SELECT … FOR UPDATE` on the job row — serializes two people taking tenders at once
- Rejects if `sum(existing) + p_amount > p_total` (decision A — no overpay escape hatch in v1)
- Inserts the tender and recomputes the three derived columns in one transaction
- Returns the new balance

`p_total` is passed in because the server can compute it (the footer already does) and Postgres cannot.

### 4. Guard the moving-total problem

Per decision C: once a job has any non-voided tender, **lock line-item edits**. Without this, adding a part to a half-paid job silently changes what's owed with no audit trail. If edits are genuinely needed: void the tenders, edit, re-record.

### 5. UI

**Payment footer** becomes the real thing it currently pretends to be:
- `Balance Due` = total − sum(tenders), live, not `0 or grandTotal`
- A tender list: `Cash $200.00 · Aug 5` / `Visa ••4242 $186.20 · Aug 5`
- "Add Payment" opens an amount field **defaulted to the remaining balance** but editable — that single field is the whole feature
- Terminal Pay passes the entered amount instead of the grand total
- Each tender row gets a void action (manager-only)

**Receipt** lists tenders instead of one method line (`receipt/[token]/page.tsx:115`).

### 6. Integration points that must change

| Path | Change |
|---|---|
| `recordPayment` (`jobs.ts:490`) | Becomes a thin wrapper over the RPC; keep the signature so the AI tool and existing callers work |
| `/api/terminal/status` (`:40-49`) | Insert a tender instead of flipping the job to paid |
| Stripe webhook `handleInvoicePaid` | Insert a tender; keep owning `paid_at` and the receipt cascade |
| `chargeCardOnFile` | Insert a tender on success |
| `receivables.ts` | Outstanding = total − paid, not full total; include `partial` jobs |
| Tax export (`tax-audit/export`) | Emit one row **per tender** — MA DOR wants collected amounts by method and date, and a split has two of each |
| Receipt page + `paymentReceiptEmail` | Render the tender list |
| AI `record_payment` tool | Gains an optional `amount`; without it, means "settle the full balance" |

---

## Phasing

**Phase 1 — cash + manually-recorded card.** Table, RPC, derived columns, footer with real balance and Add Payment. Solves cash+card immediately, touches no Stripe code.

**Phase 2 — Terminal splits.** Pass the partial amount from the button; status route writes a tender. Solves two-cards. Small, because `/api/terminal/pay` already takes an amount.

**Phase 3 — downstream truth.** Receivables partial balances, per-tender tax export, receipts listing tenders.

Phase 1+2 is the feature that was asked for. Phase 3 is what stops the reports quietly disagreeing with the counter, and shouldn't lag far behind — the tax export especially, since it feeds DOR filings.

---

## Not in scope

Refunds (voids only), partial refunds to card, payment plans / scheduled installments, split across multiple *jobs*, deposits taken before work starts. Each is a separate feature; none is needed for the two cases described.

---

# Appendix B — review outcome (v2) — 2026-08-10

> This review is what killed v1. It is preserved in full because three of its findings apply to v3 as
> well — the missing RLS, `on delete cascade` destroying money records, and the
> `grandTotal`-instead-of-balance double-charge vector — and because it is the evidence for the six
> load-bearing code claims v3 still rests on.

**This section supersedes Appendix A wherever they disagree.** Source: `/harden-plan`, 122 agents across 7
lenses, every finding adversarially verified against HEAD `ee3fa1a`. 113 findings raised, **110
survived** verification, 3 refuted. Critical 30 · High 50 · Medium 25 · Low 5. Gate verdict:
**`isBulletproof: false`**.

The 30 Criticals are roughly **8 distinct problems**, each found independently by 5–7 different lenses.
That convergence is the signal — no single reviewer's judgment is carrying any of them.

## The six load-bearing claims: all CONFIRMED at HEAD

The factual foundation held. Re-verified against `ee3fa1a`, not the 2026-08-05 snapshot:

| # | Claim | Verdict |
|---|---|---|
| 1 | No `jobs.total`; `calculateTotals` computes in JS (`src/lib/utils/totals.ts:122`) | **Confirmed** — the RPC-with-`p_total` shape is correctly motivated |
| 2 | `payment_status` read in 28 files | **Confirmed** — 35 raw hits − 6 test files − generated `supabase.ts` = 28 |
| 3 | `receivables.ts:52-70` sums the full line-item total | **Confirmed, and worse** — `getReceivablesSummary` also discards `{ error }` entirely |
| 4 | `/api/terminal/pay` accepts `amountCents` | **Confirmed — but it is a liability, not a head start.** No server-side cap, `requireStaff()` only, discarded `.update()` error at `route.ts:33-38` |
| 5 | `recordPayment` overwrites the columns (`jobs.ts:490-515`) | **Confirmed** |
| 6 | `record_quick_pay_job` is a valid precedent | **Confirmed** — but copying its `GRANT … TO service_role` verbatim would break every manager tender |

## The eight Critical problems

**1. Phase 1 is NOT shippable in isolation. "Touches no Stripe code" is the plan's most load-bearing
wrong claim.** *(All 7 lenses, independently.)* Phase 1 makes `jobs.payment_status` derived while four
writers keep flipping it directly — `/api/terminal/status:40-49`, webhook `handleTerminalPayment`
(`webhooks/route.ts:518-530`, **absent from §6 entirely**, and it has *no status predicate at all*, so
it is the path most likely to stomp a `partial` job to `paid`), webhook `handleInvoicePaid:315-322`,
and `recordPayment`. Worse than the desync: `showMarkAsPaid` admits `partial`, so **Terminal Pay and
Charge-Card-on-File render on a half-paid job pre-loaded with the FULL grand total. That is a live
double-charge on day one**, not a reporting bug.

**2. The DDL ships a world-writable money table.** §1 has no `enable row level security` and no
policies; §3 has no `REVOKE`. Supabase grants ALL on new public-schema tables to `anon`/`authenticated`
and PostgREST auto-exposes both the table and `/rest/v1/rpc/record_job_payment`. Anyone with the
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — which ships to every browser — could read every customer's tender
history and mint paid jobs. **This repo has shipped this exact bug twice** (`lock_boxes`,
`manual_income`); migration `20260311100000_fix_rls_security.sql` exists solely because of it.

**3. §2's "breaks at compile time — loud, not silent" is FALSE where it matters.** Exactly five
`Record<…>` maps break (`constants.ts:68,75,98`; `job-payment-footer.tsx:28,35`) — and only after
someone manually runs `npx supabase gen types`. **Every guard that decides whether to move money is a
string comparison that compiles clean and fails OPEN.**

**4. A partially-paid customer gets billed the full amount again.** `chargeCardOnFile`,
`createInvoiceFromJob`, and `resendInvoiceForJob` guard only `paid`/`waived`. A job with $200 already
collected is re-billed the entire grand total. All three are missing from §6.

**5. `on delete cascade` silently destroys money records.** `deleteJob`/`cancelJob` guard
`paid`/`invoiced` but not `partial`, so deleting a half-paid job takes the tender ledger with it.

**6. Decision A will strand captured money.** The block as written rejects a tender for money Stripe
has *already captured*, and refunds are explicitly out of scope — so there is no recovery path.

**7. Void is unspecified.** It is the only backwards transition in the design and Decision C makes it
a routine editing step ("void, edit, re-record"), yet it appears in exactly one UI bullet with no RPC,
no auth gate, no derived-column recompute, and no answer for a delivered receipt or a settled PaymentIntent.

**8. No idempotency contract.** The Stripe webhook and `/api/terminal/status` fire more than once per
PaymentIntent *by design*, and `handleInvoicePaid` holds no PaymentIntent id at all to key on.

## 10 BLOCKING decisions — settle these in this doc before any SQL is written

| # | Decision | Why it blocks |
|---|---|---|
| A1 | **Rewrite §Phasing.** Phase 1 = ledger + *every* writer cut over + every amount source made balance-aware, in one atomic deploy | Reshapes the whole work item. No partial-cutover state exists in which the column is trustworthy |
| A2 | **SECURITY INVOKER + RLS + in-function role gate + provenance trigger** vs **SECURITY DEFINER + column-level REVOKE on `jobs`** | Mutually exclusive (C1). The plan specifies neither |
| A3 | **Does `jobs.total_snapshot` ship?** | Everything downstream assumes a stable total; constraint 4 guarantees there isn't one. Fixes the forgeable `p_total`, the shop-settings drift the line-item lock can't reach, and A/R's three incompatible "totals" at once |
| A4 | **State the capture invariant** — the block is pre-capture only | Otherwise Decision A strands captured money with no refund path |
| A6 | **Specify `void_job_payment`** | Only backwards transition in the design |
| A10 | **Derivation precedence for `invoiced` and `waived`** | Currently undefined behaviour in a money column; either choice silently disarms a guard |
| A18 | **Cents or dollars across the RPC boundary** | In dollars, float residue rejects the most common action in the feature as an overpayment |
| A21 | **Keep or drop `split`** | `ALTER TYPE ADD VALUE` is irreversible — a one-way door |
| A17 | **Replace Decision B's zero-tender sentinel with an explicit `tenders_authoritative` flag** | Quick Pay and three Stripe writers keep minting that shape *post*-cutover, so the heuristic decays |
| A12 | **DOR basis** — Phase 1 filter fix ships in the same PR; accrual-vs-cash needs the owner/accountant | A filing-accuracy defect created by Phase 1, not a reporting nicety |

## Corrected shape

- **Phase 1 (atomic):** tender ledger + RLS/grants + both RPCs + `total_snapshot` + all four writers cut
  over + all amount sources balance-aware + the three re-bill guards + delete/cancel guards + DOR filter
  fix + kill switch. `job-payment-footer.tsx:133,140` pass `Math.round(balanceDue * 100)`, **not**
  `grandTotal`.
- **`chargeCardOnFile` does NOT insert its own tender** — it settles through `handleInvoicePaid`, which
  owns `paid_at` and the receipt cascade. Writing in both double-counts.
- **The rule to write into §2:** *any path that computes an amount to charge, or decides a job is safe
  to bill / cancel / delete, consults `sum(non-voided tenders)` — never `payment_status` alone. The
  derived column is for display; the tender table is the authority.*
- **`on delete restrict`**, not cascade. Money rows outlive their job.
- **Line-item lock is a DB trigger, not N server-action guards** — `dvi.ts:792` writes line items via
  `createAdminClient()` from the *unauthenticated* customer-facing DVI page and no action guard can reach it.
- **Two migration files, two `supabase db push` invocations** — Postgres refuses to evaluate a new enum
  value before its adding transaction commits.
- **Ship behind `shop_settings.split_tender_enabled`** — and add it to `shopSettingsSchema`, or
  `updateShopSettings`'s `.partial().safeParse()` silently strips it and the toggle does nothing.

## Residual risks the gate found — in the amendments themselves

The final gate re-attacked the amended plan and found four contradictions **between amendments** that
everything upstream missed. These are open:

| # | Risk | Severity |
|---|---|---|
| R1 | A2's single-writer trigger **blocks A24's kill switch and A19's rollback SQL** — the flag-off path writes `payment_status='paid'` directly with no GUC, so the trigger raises. The kill switch is inoperable in exactly the emergency it exists for. `service_role` does not help: BYPASSRLS does not bypass triggers | Critical |
| R2 | A5's three-arbiter `ON CONFLICT` **is not expressible as one clause** — a conflict on a non-arbitrated constraint raises 23505 uncaught inside the webhook → non-2xx → three days of Stripe retries against a permanent failure | Critical |
| R3 | **TOCTOU survives A3 + A9** — A9's trigger checks for tenders without taking the `jobs` row lock, so a concurrent line-item insert lets the RPC snapshot a stale lower total and flip to `paid` below the real bill. Two iPads on the shop floor is the ordinary case | Critical |
| R4 | A16's `receipt_issued_at` gate **404s every historical receipt link** — the column is written only going forward and Decision B forbids backfill | Critical |
| R5 | The money unit is specified **three incompatible ways** across amendments (cents / `numeric(10,2)` / `amount_cents bigint`) | High |
| R6 | Add Payment's `jobStatus === "complete"` gate (`job-payment-footer.tsx:64-67`) is load-bearing and unstated | High |
| R7 | A tech can already `PATCH /rest/v1/jobs` with `payment_status` — `techs_update_assigned_jobs` (`rls_policies.sql:92-96`) has no column restriction and no `WITH CHECK`, so "one writer for payment state" is false at the DB layer | High |

**Also flagged by the gate:** two amendments assert things about the code that are **false** — A4's claim
that `getShopSettings()` returns null in API-route contexts (`tax-audit/export/route.ts:54` already calls
it successfully), and A21's instruction to add `??` fallbacks where three already exist. *Two wrong claims
surviving a second hardening pass is itself the signal: this plan has now been verified twice and still
asserts untrue things about the code.* Verify every citation at implementation time.

## Full artifacts

All 113 findings, 25 amendments, 15 reconciled contradictions and per-agent detail:
`~/.claude/projects/C--Projects-broadway-motors-shop-pilot/b1c80d8e-747f-42b5-baba-89b8e213ef8d/subagents/workflows/wf_da0f2669-506/journal.jsonl`
