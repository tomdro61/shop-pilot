# Design: Split-Tender Payments (cash + card, or two cards)

> 🛑 **STOP — read before implementing.** v3 below is **parked** (see the park notice) and
> was reviewed on 2026-08-31: **not bulletproof**, 83 verified findings, 16 Critical.
> The authoritative current state is [Review outcome (v4)](#review-outcome-v4--2026-08-31)
> at the end of this file. v3's §4 and §5 contain claims that cause a **silent overcharge**
> if implemented as written.

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

---

# Review outcome (v4) — 2026-08-31

> 🛑 **The park stands, and this review is the evidence for it.** v3 was picked up for
> implementation on 2026-08-31 by someone who read from §1 and missed the park banner at the top
> of this file. Twenty minutes in, the `void_job_payment` signature defect surfaced — which is
> precisely the class of problem the park notice predicted: scaffolding forced by the absence of a
> stored grand total. **Do not implement v3 before `job_totals` exists.** Read the banner first.

**Method:** `/harden-plan` — 7 adversarial lenses, every finding verified against HEAD `5a8c40c`
before counting, then synthesis, then a gate that re-attacks the amended plan.

**Scale:** 93 findings raised, **83 survived** verification, 10 refuted. Critical 16 · High 26 · Medium 23 · Low 18.

**Gate verdict: NOT bulletproof.** Even with all 31 amendments applied, the gate found four
new defects created by the amendments themselves — two of them contradictions *between* amendments.

## The single strongest signal

**Seven of the seven lenses independently found the same Critical**: §4's claim that
`job-payment-footer.tsx:133`/`:140` are *"the entire double-charge guard"* is false.
`ChargeCardOnFileButton`'s `amountCents` prop is consumed **only by two label strings**
(`charge-card-on-file-button.tsx:76,91`); the handler calls `chargeCardOnFile(jobId)` (`:44`) and
the action recomputes and bills the full grand total. Following §4 as written produces a confirm
dialog reading "$186.20" while Stripe charges "$386.20". **The plan's fix is worse than no fix.**
(SEC-4, DATA-1, CORR-1, REG-1, COMP-1, OPER-2, FIRS-1.)

## Blocking prerequisites — settle before any implementation

1. §3's `void_job_payment(p_payment_id, p_reason)` cannot decide what §3's prose says it decides (no `jobs.total`; constraint 4). The migration already diverged to a three-arg form. The plan text must be corrected before anyone implements from it, or the two-arg version gets built and `CREATE OR REPLACE` leaves both overloads resident with PostgREST resolving by named argument.

2. §4's claim that `job-payment-footer.tsx:133` and `:140` are "the entire double-charge guard" is false, and acting on it causes a silent overcharge. `ChargeCardOnFileButton.amountCents` is consumed only by two label strings (charge-card-on-file-button.tsx:76,91); the handler calls `chargeCardOnFile(jobId)` (`:44`) and the action recomputes and bills the full grand total. The sentence must be struck and the card-on-file path closed by a server guard before any footer work begins.

3. §5's "two Stripe edits, not four" is wrong in both directions. `/api/terminal/pay` (the only pre-capture point, and the sole enforcement site left for Decision A) is absent; `handleInvoicePaid` and `chargeCardOnFile` are marked unchanged but are reachable on a tendered job; `updateJob` is missing entirely. The writer set is six, not two, and the plan cannot be costed or sequenced until it is corrected.

4. §2's `p_total_cents` recipe is unavailable in the two contexts §5 cuts over. `getShopSettings()` uses the cookie-scoped `createClient()` and returns `null` on failure (settings.ts:10-23); `calculateTotals` then substitutes `DEFAULT_SETTINGS`. In the webhook the line-item read is also anon and returns `[]` with no error, so `p_total_cents` is 0 and the RPC flips the job to `paid` on the first tender. A shared helper taking an injected client, and a `p_total_cents <= 0` raise in the RPC, must be specified before step 2.

5. Decision A ("Block" overpayment) has no enforcement point on the card rail. `createTerminalPaymentIntent` uses automatic capture, so `/api/terminal/status` and `handleTerminalPayment` both run post-capture and must pass `p_captured = true`, which short-circuits the RPC guard by construction. The block must be relocated to `/api/terminal/pay` (which today validates only `amountCents > 0`) or Decision A must be restated as cash/check-only.

6. §8's build order loses money in a shipped state. Step 3 ships the partial-amount dialog; step 4 cuts the Terminal writers; step 5 ships the guards. Between 3 and 4 a partial Terminal charge flips the job to `paid` with no tender row, `showMarkAsPaid` goes false, the remaining balance becomes uncollectable in-app, and no later step heals a row created in that window. Between 3 and 5 a half-paid job can be invoiced for the full total.

7. §5's "`recordPayment` keeps its signature" is unimplementable. Its third parameter is `paymentStatus: PaymentStatus = 'paid'` (jobs.ts:490-493) and the AI `record_payment` tool passes all four enum values. `record_job_payment` can only insert money and flip toward `paid`. Routing unconditionally would make "waive this job" insert a full-balance tender; keeping the direct write for the other three re-introduces an unguarded writer.

8. `updateJob` (jobs.ts:184) writes `payment_status` and `payment_method` through `prepareJobData` (validators/job.ts:59-60) with no guard, and the AI `update_job` tool exposes the field. Under v3 it can mark a half-paid job `paid` with no tender, or reset a fully-tendered job to `unpaid` — and nothing recomputes, because the RPC only re-evaluates on a tender write. This is unrecoverable in-product and must be closed in the same deploy as the RPC.

9. v3's design choice to leave a half-paid job at `payment_status = 'unpaid'` silently disarms an existing guard: `setJobChargeSalesTax` (jobs.ts:275-297) refuses only when `payment_status !== 'unpaid'` or an `invoices` row exists. A half-paid job has neither, so the sales-tax toggle is live between tenders and the second tender is measured against a total the first was not. The "Moot — the total can't drift during a 60-second checkout" row in the dissolution table is false as written.

## Contradictions the synthesis had to reconcile

Recorded because each is a place where two verified findings gave opposite instructions; the
reconciliation is the authoritative reading.

1. §4 ("change :133 and :140 to balance due") vs §5 ("chargeCardOnFile — Unchanged"): the plan already contradicts itself, and both halves cannot be satisfied. RECONCILE: keep `:133` passing `Math.round(grandTotal * 100)` (it is what will actually be charged), hide `ChargeCardOnFileButton` when a non-voided tender exists, and add the server refusal. Only `:140` becomes balance-due. Amendment A3 supersedes §4's sentence entirely.

2. DATA-7 proposes NULLing `jobs.payment_method` on a multi-tender split as a safe sentinel; COMP-8/CORR-11 propose keeping `p_method` and making readers tender-aware. These cannot both hold. RECONCILE in favour of keeping `p_method`: `receipts/send.ts:126` and `webhooks/route.ts:621` both do `job.payment_method || "stripe"`, so a NULL prints "paid via stripe" on a customer-facing receipt — strictly worse than the last-method label. Amendment A15 keeps `p_method` and fixes the readers.

3. SEC-3 requires `void_job_payment` to become SECURITY DEFINER (because it UPDATEs a table whose UPDATE grant is being revoked); SEC-11 requires both functions to stay SECURITY INVOKER. RECONCILE: promote ONLY `void_job_payment`, with an explicit `IF NOT is_manager() THEN RAISE` as its first statement and `SET search_path = pg_catalog, public, pg_temp` (pg_temp stays trailing, per SEC-11's correction). `record_job_payment` stays INVOKER with no in-function gate — adding one would reject every service_role call and strand captured money. Amendment A25.

4. REG-12 and COMP-13 want a cross-job PI collision to `RAISE EXCEPTION ... ERRCODE 23505`; SEC-8 and DATA-11 want it never to raise. Raising inside `handleTerminalPayment` on a permanently-failing condition produces ~3 days of Stripe redelivery and risks endpoint auto-disable. RECONCILE toward not raising: return `outcome = 'duplicate_other_job'`, skip the paid-flip entirely, return the true balance, and have the caller fire Sentry and 2xx. Amendment A12.

5. CORR-13/DATA-8/FIRS-13 say stop writing `jobs.stripe_payment_intent_id` from `/api/terminal/pay`; REG-12 says do not drop that column's write; FIRS-6 says keep writing it or the tech receipt gate 403s. These resolve once the two writes are distinguished: REG-12 is about the write INSIDE the RPC, the others about the arm-time write in the route. RECONCILE: delete the arm-time write (verified safe — the poller uses the response body, the webhook uses PI metadata, Quick Pay writes through `record_quick_pay_job`), KEEP the RPC's write but flip it to `COALESCE(p_pi, stripe_payment_intent_id)` so the settling tender wins, and do NOT touch `receipts/send/route.ts:72`. Amendments A5, A24, A27.

6. On tenders against an invoiced job: REG-8/COMP-1 want a hard refusal, CORR-5/FIRS-2 want warn-only, DATA-2 wants a partial-only refusal. A blanket refusal breaks the workflow `createInvoiceFromJob`'s own comment contemplates (invoiced job, customer walks in with cash) and would start failing the AI `record_payment` tool on ordinary settlements. RECONCILE to DATA-2's shape: refuse only when `amount < balance` AND a non-`paid` `invoices` row exists; a full-balance tender proceeds and returns a warning the footer surfaces with a Void Invoice action. Amendment A13.

7. FIRS-3 says explicitly do NOT change `handleInvoicePaid`; SEC-9, DATA-2, CORR-5, REG-8, COMP-1 and FIRS-2 all say it must change. FIRS-3's reasoning depends on the §6 guards making an invoice-on-a-tendered-job unreachable, but the reverse ordering (invoice first, tender second) is not covered by any §6 guard and `showMarkAsPaid` admits `invoiced`. RECONCILE against FIRS-3: `handleInvoicePaid` records a tender via the RPC with `p_captured = true`. Amendment A4.

8. COMP-3's corrected fix states "Drop `updateJob` from any cutover list — it cannot write `payment_status`." This is refuted by the code: `prepareJobData` returns `payment_status: data.payment_status || "unpaid"` at validators/job.ts:60 and `updateJob` passes it straight to `.update()`. RECONCILE in favour of COMP-5/REG-6/FIRS-7/OPER-3: `updateJob` is a real writer and must be guarded. Amendment A8.

9. Placement of the `chargeCardOnFile` guard is given as step 2 (COMP-1), step 3 (REG-1/CORR-1), and step 5 (the plan's §6). RECONCILE by rule rather than by step number: every guard that prevents a full-total bill on a half-paid job ships in the same deploy as, or before, the first code that can create a tender. Under the reordered §8 that is the writers+guards deploy, which precedes all UI. Amendment A1 makes this normative so the step numbers stop being the authority.

10. Void's forward flip scope is given three ways: `= 'unpaid'` (CORR-6), `IN ('unpaid','invoiced')` (COMP-13), `<> 'waived'` (REG-7). RECONCILE to `<> 'waived'` for BOTH RPCs: `invoiced → paid` is today's behaviour on `recordPayment` and the terminal status route, so excluding it would diverge the RPC from the callers §5 leaves unchanged; `waived` is the only value that must be protected. Amendment A9/A24.

11. CORR-7 requires void to refuse any tender carrying a PaymentIntent; DATA-3 requires void to succeed but skip the status change when the job was settled outside the ledger; §4's mock puts a ⌫ on every tender row; DATA-13 wants a purge hatch for voided rows. These are compatible only if sequenced: the card refusal fires FIRST (before the idempotent `WHERE voided_at IS NULL` update, so a re-void of a card tender still reports the refusal), DATA-3's `voided_needs_review` branch then governs the remaining cash/check cases, §4 renders ⌫ only for `cash`/`check`/`ach` with a null PI, and DATA-13's purge is restricted to `stripe_payment_intent_id IS NULL` rows. Amendments A9, A28.

12. COMP-7 wants `record_job_payment`'s flip made symmetric (un-pay when the total rises); DATA-3 establishes that the ledger may only reverse what the ledger recorded. A symmetric ELSE would un-pay legacy jobs and invoice-settled jobs on any small tender. RECONCILE: do not add the symmetric downgrade. Use DATA-6's `total_stale` outcome instead — when `p_total_cents` is below the live line-item subtotal, record the tender, skip the flip, return `outcome = 'total_stale'` and alert. Amendment A17.

13. SEC-6's original fix would have `p_captured` narrow rather than disable the overpayment check, raising when the captured amount exceeds an authorized amount. That directly contradicts §2's own stranded-money rule and every other finding's treatment of `p_captured`. RECONCILE: the RPC never raises post-capture. Detection moves to a distinct `outcome` value plus Sentry, and prevention moves upstream to the `/api/terminal/pay` cap. Amendments A10, A21.

14. SEC-5, SEC-6, CORR-8 and COMP-2 each propose raising `/api/terminal/pay` or `/api/terminal/status` from `requireStaff()` to `requireManager()`; the verification of all four rejects it. Raising the status route breaks tech Quick Pay (quick-pay-form.tsx:432,553) and, while `/api/terminal/pay` stays `requireStaff`, would let a tech arm a reader and take a capture the UI can never confirm. RECONCILE: change no auth gate as part of this work. Record the boundary in §7 and raise manager-only Terminal collection as its own decision. Amendment A27.

15. OPER-1 wants the footer's read-only tender list and derived balance to ship WITH the writer cutover (so a `p_total_cents` mismatch is diagnosable); COMP-3 and FIRS-3 want all footer work last. RECONCILE by splitting the footer: the tender list, derived balance and "Partially Paid" string are read-only and ship with the writers; the amount dialog and the `:140` balance-due change ship last, as the commit that turns the feature on. Amendment A1.

16. DATA-8, REG-10 and FIRS-6 propose broadening `/api/receipts/send:72`'s tech gate to accept any PI in `job_payments`; the verification of DATA-8 and REG-10 rejects it as widening a deliberately narrow gate on an unauthenticated, non-expiring surface to serve a scenario that cannot occur (the tech receipt surface is Quick Pay only). RECONCILE: leave `:72` alone; add the §7 acceptance line instead. Amendment A27.

## Amendments

### Rewrite §8 as a deploy contract, not a task list — writers and guards precede all partial-amount UI

**Severity:** Critical · **Applies to:** §8 Build order (replaces steps 3–5 wholesale) · **From:** DATA-4, CORR-3, REG-3, COMP-3, OPER-1, FIRS-3, COMP-6, COMP-1, REG-1

Step 3 ships the partial-amount dialog; step 4 cuts the Terminal writers; step 5 ships the guards. Between 3 and 4 a partial Terminal charge sets payment_status='paid' with no tender row — showMarkAsPaid goes false, the remaining balance is uncollectable in-app, the job leaves A/R, and no later step heals it. Between 3 and 5 createInvoiceFromJob bills the full total on a half-paid job. Both are permanent losses produced purely by sequencing.

Replace §8 with: (1) Migration + `supabase gen types` — inert, nothing reads the table. (2) `recordJobPayment` / `voidJobPayment` server actions + the shared `getJobTotalCents` helper (A6) + unit tests — inert, no callers. (3) ALL WRITERS AND ALL GUARDS, ONE DEPLOY, NO AMOUNT INPUT: `/api/terminal/status`, `handleTerminalPayment`, `handleInvoicePaid`, `/api/terminal/pay` cap, `recordPayment` branch, `updateJob` strip, plus every §6 guard (deleteJob, cancelJob, createInvoiceFromJob, resendInvoiceForJob, chargeCardOnFile, setJobChargeSalesTax, line-item mutations, recordPayment/updateJob status guards) and the read-only half of the footer (tender list, derived balance, "Partially Paid" string). Behaviourally a no-op: with no amount input live every call is still a full-balance tender. (3b) `voidJobPayment` action + per-tender void UI (A19). (4) LAST — the amount dialog on Terminal Pay and Mark as Paid, and the `:140` grandTotal→balance change. This is the only commit that changes what the shop can do. (5) `/verify-flow quick-pay` + a real counter split + `/scoped-review`. Add verbatim as a normative rule: "No UI capable of producing an amount less than the full balance ships before every writer of `jobs.payment_status` routes through `record_job_payment` and every §6 guard is live. Steps 3–4 may not be reordered or interleaved." Add: "No backfill will repair a job charged during a bad interim — a terminal amount with no `job_payments` row makes `void_job_payment`'s later coverage recompute flip a genuinely paid job back to `unpaid`. That is why this rule is normative, not advisory." Move `/sketch-flow` out of the numbered list into a short Gates subsection (it must run before step 2, so it cannot be step 6).

### §5's writer table is wrong — six writers of jobs.payment_status, not two Stripe edits

**Severity:** Critical · **Applies to:** §5 Write paths table (structural rewrite) · **From:** REG-6, COMP-5, DATA-8, COMP-2, SEC-6, CORR-8, REG-13

§5 declares the writer set closed at five paths and concludes two need editing. A grep of every jobs.payment_status write finds three more, and two of the five marked "Unchanged" are reachable on a tendered job. Because §5 states the set is closed, an implementer following it will not audit the rest — which is exactly how chargeCardOnFile and updateJob fell out of the plan.

Rewrite the table with these rows: `recordPayment` (jobs.ts:490) — MUST CHANGE, branches by status (A7). `updateJob` (jobs.ts:184) + AI `update_job` — MUST CHANGE, strips payment fields (A8). `/api/terminal/pay` — MUST CHANGE, server-side amount cap; this is the amount-origination path and the only pre-capture point (A5). `/api/terminal/status` — MUST CHANGE, calls the RPC with `p_captured => true`. `handleTerminalPayment` (webhooks/route.ts:750-777, dispatched at :80-81 — the current citation :518-530 is inside `handleInvoicePaid`) — MUST CHANGE, plus non-2xx on failure (A11). `handleInvoicePaid` (webhooks/route.ts:251, flip at :488-495) — MUST CHANGE, records a tender (A4). `chargeCardOnFile` — no Stripe-write change but gains a §6 refusal (A3); correct the row's rationale, which currently argues from idempotency ("holds no PaymentIntent, so there's no idempotency key") when the real disqualifier is that it has no amount parameter at all. `voidInvoiceForJob` + the `invoice.voided` webhook branch — UNCHANGED AND SAFE, both `.eq('payment_status','invoiced')`-scoped, recorded so a reader auditing §5 against post-plan code sees they were considered. Add the closing rule: "Any writer of `jobs.payment_status` other than `record_job_payment` / `void_job_payment` must be listed here with a reason, and must never write `paid` without a covering tender."

### chargeCardOnFile: strike §4's guard claim, hide the button, add a server refusal — do NOT re-price line :133

**Severity:** Critical · **Applies to:** §4 (footer amounts), §5 (chargeCardOnFile row), §6 (new guard), src/lib/actions/charge-card-on-file.ts — writers+guards deploy · **From:** SEC-4, DATA-1, CORR-1, REG-1, COMP-1, FIRS-1, OPER-2

Verified: `ChargeCardOnFileButton.amountCents` is consumed only at charge-card-on-file-button.tsx:76 and :91 (dialog copy and button label); the handler calls `chargeCardOnFile(jobId)` at :44 with no amount, and the action refetches line items + settings and bills `totals.grandTotal`. Its only payment gates are `payment_status === 'paid' | 'waived'` (:56-61), which a half-paid job passes by design. Applying §4's prescribed edit produces a dialog reading "Charge $186.20" while Stripe charges $386.20 — converting a visible overcharge into an invisible one.

§4: strike "Those two lines are the entire double-charge guard" and replace with: "Line :140 (TerminalPayButton) is the only footer amount that reaches Stripe — it rides through to the PaymentIntent. Line :133 is display-only; `chargeCardOnFile` recomputes and bills the full grand total server-side, so that path is closed by hiding the button and by the §6 server guard, not by changing the number. Line :133 keeps `Math.round(grandTotal * 100)`." Add a one-line comment at the prop declaring it display-only. §4 UI: render `ChargeCardOnFileButton` only when `tenders.every(t => t.voided_at)` — non-voided predicate, matching `cancelJob`, so a job whose only tenders were voided is fully chargeable again. Render a short inline hint where the button was rather than letting it vanish silently. §5: change the row from "Unchanged" to "No Stripe-write change, but gains a §6 guard — it bills a server-recomputed grand total and takes no amount parameter, so it must refuse a tendered job outright; deferring card-on-file *splits* does not by itself stop a card-on-file *re-bill*." §6, immediately after the `waived` check at :61 and before `stripe.invoices.create` at :158: `const { count, error: tenderError } = await supabase.from("job_payments").select("id", { count: "exact", head: true }).eq("job_id", jobId).is("voided_at", null); if (tenderError) return { ok: false, error: "Couldn't check existing payments — try again" }; if ((count ?? 0) > 0) return { ok: false, error: "This job has a partial payment recorded — collect the balance on the Terminal" };` Use `{ count: "exact", head: true }` rather than fetching rows (CLAUDE.md 1000-row rule) and fail closed on both `tenderError` and a null count. Add a comment noting the read is safe on the user-scoped client only because `requireManager()` at :37 guarantees `is_manager()` — an RLS denial returns `[]` with no error and would fail open. Add the refusal case to `charge-card-on-file.test.ts` alongside the existing paid/waived/no-card/existing-invoice preflight block. Note in the plan that this is a pre-check with a TOCTOU window against a terminal tender landing mid-charge, acceptable at counter timescales.

### handleInvoicePaid must record a tender — §5's "invoice-settled jobs aren't counter splits" is an assumption, not an invariant

**Severity:** Critical · **Applies to:** §5 (handleInvoicePaid row), src/app/api/stripe/webhooks/route.ts:488-518 — writers+guards deploy · **From:** SEC-9, DATA-2, CORR-5, REG-8, COMP-1, FIRS-2, COMP-14

`showMarkAsPaid` (job-payment-footer.tsx:65-68) admits `invoiced`, and `createInvoiceFromJob` explicitly permits it. So a job can hold a live, payable Stripe invoice AND counter tenders. When the customer pays the link, `handleInvoicePaid` writes `payment_status:'paid'` unconditionally at :488-495 with no tender row and fires the receipt: $586.20 collected on a $386.20 job, ledger showing $200, nothing surfacing it. §6's guards only cover the tender-then-invoice ordering.

Change the §5 row from "Unchanged" to "Records a tender (job branch only — leave the parking branch alone)." Move the existing `job_line_items` / `charge_sales_tax` fetch (currently at :511-518, AFTER the flip) above it, compute `p_total_cents` via the shared helper (A6) on the admin client already in scope, and replace the raw `.update({payment_status:'paid'})` with `record_job_payment(p_job_id, p_amount_cents => stripeInvoice.amount_paid, p_total_cents, p_method => 'stripe', p_pi, p_captured => true)`. Do not run both — the RPC's step 5 performs the flip, and running both hides which one won. For `p_pi`, use `stripeInvoice.payment_intent` when present and fall back to a deterministic `inv:<stripe_invoice_id>`: `invoice.paid` is redeliverable and `payment_intent` is null for out-of-band / manually-marked-paid invoices, and a null unique key gives no idempotency at all. Document in §1 that `stripe_payment_intent_id` holds namespaced values (`pi_…` or `inv:…`) so the dedupe cannot confuse them. Keep the existing receipt cascade and the "continue on error so the receipt still sends" behaviour. Service_role is BYPASSRLS so `security invoker` is satisfied. Consequence to state in §5: an invoice landing on a tendered job now produces an arithmetically visible overpayment that fires `split_tender_overcapture`, instead of a silent stomp.

### /api/terminal/pay is the third required Stripe edit — server-side amount cap, fail-closed settings, checked error, no PI stamp

**Severity:** Critical · **Applies to:** §5 (new row), §2 (Decision A rationale), src/app/api/terminal/pay/route.ts — writers+guards deploy · **From:** SEC-6, CORR-8, REG-2, COMP-2, DATA-8, FIRS-13, CORR-13, COMP-4

Verified: the route validates only `!jobId || !amountCents || amountCents <= 0` (:18-23), never loads the job, never computes a total, never consults the ledger, discards the `{ error }` from its jobs update (:34-38), and unconditionally overwrites `jobs.stripe_payment_intent_id`. Today the amount is always the computed grand total so the gap is unreachable; v3 turns it into a free-text field. Because every card tender is recorded post-capture with `p_captured = true`, this route is the ONLY place Decision A can be enforced on the Terminal rail.

Add as a §5 row marked MUST CHANGE, framed as "the amount-origination path". Before `createTerminalPaymentIntent`: (a) compute the job total with the shared `getJobTotalCents` helper (A6), failing closed if shop settings won't load — a `DEFAULT_SETTINGS` fallback computes a LOWER total and would reject legitimate full-balance tenders; (b) `SELECT COALESCE(SUM(amount),0) FROM job_payments WHERE job_id = $1 AND voided_at IS NULL`, with `{ error }` checked; (c) reject 400 when `amountCents > Math.round(grandTotal*100) - paidCents` (this also covers an already-settled job); (d) require `Number.isFinite(amountCents)` and integer — the current check admits `1.5`; (e) also reject when `payment_status` is `paid`/`waived`. Destructure and check `{ error }` on whatever write remains. DELETE the arm-time `jobs.stripe_payment_intent_id` write entirely — verified safe: `terminal-pay-button.tsx` polls with the id from the response body, `handleTerminalPayment` resolves the job from `pi.metadata.job_id`, and Quick Pay writes the column through `record_quick_pay_job`, not this route. Removing it also fixes today's arm-then-cancel staleness. Do NOT raise the route to `requireManager()` — techs legitimately take counter payments and the route uses `createAdminClient()` anyway, so the role gate is orthogonal to the amount cap. Add to §2: "On the Terminal rail the pre-capture guard lives in `/api/terminal/pay`, not in the RPC — the RPC's guard is unreachable there by construction and must not be described as protection it does not provide. The cap is best-effort, not atomic: Stripe capture cannot join the DB transaction, so two simultaneously-armed readers can both pass. Its job is fat-finger and stale-tab; `split_tender_overcapture` catches the residual." Add a §8 test: POST with an amount above the server-computed remaining balance is rejected 400 before any PaymentIntent is created, including from a second tab opened before the first tender.

### Specify how p_total_cents is computed outside a session — the prescribed recipe returns null or zero in the webhook

**Severity:** Critical · **Applies to:** §2 (p_total_cents paragraph), §5 (new sub-section), new src/lib/jobs/total.ts + migration — before step 2 · **From:** DATA-5, CORR-4, REG-4, REG-11

Verified: `getShopSettings` (settings.ts:10-23) is `cache(async …)` over the cookie-scoped `createClient()`, logs and returns `null` on error. In the webhook there is no session, `shop_settings`' only SELECT policy is authenticated-only, so it returns null and `calculateTotals` falls back to DEFAULT_SETTINGS (no supplies, no hazmat). Worse, the anon `job_line_items` read returns `[]` with NO error, making `p_total_cents` 0 — and migration:136 then flips the job to `paid` on the first tender at a zero total. `/api/terminal/status` has a session but `requireStaff()` admits techs and `techs_read_line_items` is assigned-jobs-scoped, so the same zero-total path is reachable there.

Replace §2's "exactly as chargeCardOnFile does at charge-card-on-file.ts:131-146" with a rule binding every caller: "`p_total_cents` is computed by the caller, never accepted from the client, and always through a service-role client. Never `getShopSettings()` and never a cookie-scoped `createClient()` from an API route." Add `getJobTotalCents(client: SupabaseClient<Database>, jobId: string): Promise<{ ok: true; totalCents: number } | { ok: false; error: string }>` in `src/lib/jobs/total.ts`, taking the client as a required first parameter so no caller can inherit the wrong one. It selects `charge_sales_tax, job_line_items(type, description, quantity, unit_cost)` and `shop_settings` on the PASSED client and returns `{ ok: false }` when either read errors, when settings come back null, when the job row is missing, or when the computed total is <= 0. Rather than inventing a third settings reader, extract `getShopSettingsVia(client)` from the existing `getReceiptShopSettings()` (receipts.ts:55, which already solves session-less settings via the admin client) and have `getShopSettings()`, `getReceiptShopSettings()` and the new helper all use it. Every RPC caller uses `getJobTotalCents` — `recordPayment`, `/api/terminal/status`, `handleTerminalPayment`, `handleInvoicePaid`, and the void action. Ban `getShopSettings()` in `src/app/api/**`. Add the SQL backstop to the migration alongside the existing `p_amount_cents <= 0` check at :87: `IF p_total_cents <= 0 THEN RAISE EXCEPTION 'total must be positive' USING ERRCODE = '22023'; END IF;` — a zero total is never legitimate and this makes the empty-line-items path fail loudly instead of marking the job paid. Tests: a failed/empty `shop_settings` read produces no RPC call; an empty `job_line_items` read produces no RPC call; `record_job_payment(..., p_total_cents => 0, ...)` raises.

### recordPayment branches by status — it cannot "keep its signature" and route to the RPC

**Severity:** Critical · **Applies to:** §5 (recordPayment row), §6 (new guard), src/lib/actions/jobs.ts:490 — writers+guards deploy · **From:** CORR-9, REG-5, COMP-9, OPER-3, FIRS-7

Verified signature: `recordPayment(jobId, paymentMethod, paymentStatus: PaymentStatus = "paid")`, and the AI `record_payment` tool exposes all four enum values. `record_job_payment` only inserts positive money and only ever writes `paid`. Routing unconditionally makes "waive this job" insert a full-balance cash tender — a fabricated row in the money table that then feeds paid_at-bucketed revenue, receivables and the DOR export. Keeping the direct write for the other three re-introduces an unguarded writer that can strand a tendered job at `waived`.

Rewrite the §5 row as an explicit fork: `recordPayment(jobId, method, paymentStatus = 'paid', amountCents?)`. (a) `'paid'` routes to `record_job_payment`; an omitted `amountCents` means the REMAINING BALANCE (server-recomputed total minus non-voided tender sum), NOT the grand total — passing the grand total on a job that already holds $200 trips the RPC's own overpayment guard and fails the assistant's ordinary "mark it paid". (b) If the remaining balance is <= 0, skip the RPC entirely and flip `jobs` directly or return success — `p_amount_cents <= 0` raises `22023`, and today a second `recordPayment` on a settled job is a harmless no-op that would become a hard error. (c) `'waived'` / `'invoiced'` / `'unpaid'` keep today's direct `jobs` update, record NO tender, reject any supplied `amountCents`, and REFUSE when a non-voided `job_payments` row exists: "This job has $200.00 in recorded payments — void them first." Without that refusal, `jobs.payment_status` and the ledger diverge with nothing to reconcile them: `void_job_payment`'s downgrade is a no-op on a job already reading `unpaid`, so the desync survives the only backwards transition in the design. Add the precedence sentence to §3: "`waived` and a non-empty non-voided ledger are mutually exclusive; the ledger wins. The operator's path is void-then-waive." Prefer server-side refusals over narrowing the AI tool's enum — narrowing removes the assistant's ability to set `invoiced` and to un-mark a job, which is a capability change the owner should approve rather than a side effect of this PR. Tests: `recordPayment(id,'cash','waived')` inserts zero tenders and leaves `paid_at` null; the same call on a job with a non-voided tender errors and mutates nothing; `recordPayment(id,'cash')` on a $200-tendered $386.20 job records $186.20 and returns `is_paid = true`; `recordPayment(id,'cash')` on an already-paid job does not raise.

### updateJob and the AI update_job tool must stop writing payment state

**Severity:** Critical · **Applies to:** §5 (new row), §6 (guard), src/lib/actions/jobs.ts:184, src/lib/ai/tools.ts + handlers.ts — writers+guards deploy · **From:** COMP-5, REG-6, FIRS-7, OPER-3, REG-5

Verified: `prepareJobData` returns `payment_status: data.payment_status || "unpaid"` and `payment_method` (validators/job.ts:59-60), and `updateJob` passes the whole prepared row to `.update()` with no guard. The `update_job` tool advertises the field and the handler threads it through. Under v3 the model can set `paid` on a job holding one $200 tender — the balance disappears with no tender row — or set `unpaid` on a fully-tendered job, which nothing ever flips back because the RPC only re-evaluates on a tender write. That job then sits at full value in all three A/R surfaces forever.

Do NOT strip the fields inside `prepareJobData` — it is shared with `createJob` (jobs.ts:173) and `jobSchema.payment_status` is non-optional (validators/job.ts:33), so mutating it either breaks insert or forces a schema change that ripples into `job-form.tsx`. Omit at the update call site instead: `const { payment_status: _ps, payment_method: _pm, ...updatable } = prepareJobData(parsed.data);` then `.update(updatable)`, with a comment stating that payment state has exactly two writers. Remove `payment_status` and `payment_method` from the `update_job` tool schema AND from the handler call — schema alone is advisory, as the `update_job_status` runtime allowlist already documents. Add a unit test in `src/lib/validators/job.test.ts` asserting neither key appears in the update payload. Add `updateJob` as a §5 row and to §6's guard list. Note in §2/§3 that with this in place the RPC's `SELECT … FOR UPDATE` on `jobs` becomes the sole serialisation point for payment state — put that in the migration comment so a future full-row writer does not silently reintroduce the lost update.

### §3 void contract: correct the signature, forbid reversing what the ledger did not record, refuse card tenders, scope both flips

**Severity:** Critical · **Applies to:** §3 Voiding + supabase/migrations/20260831000000_job_payments_split_tender.sql (void_job_payment) · **From:** DATA-3, CORR-6, CORR-7, DATA-12, COMP-13, FIRS-4, REG-7, COMP-14, OPER-11

§3 and the migration already disagree on the signature (the confirmed defect), and §3's prose authorises only a backwards transition while the SQL performs an unpredicated forwards one. Beyond that, summing `job_payments` alone cannot tell whether the ledger is what made the job paid — §5 leaves writers that flip `paid` without inserting tenders — and voiding a card tender removes money from the ledger that Stripe still holds, with refunds out of scope.

§3 signature becomes `void_job_payment(p_payment_id uuid, p_total_cents bigint, p_reason text default null)` with one sentence: "The total must be passed in for the same reason `record_job_payment` takes it — constraint 4, there is no `jobs.total`." Then, in order inside the function: (1) resolve `job_id, method, stripe_payment_intent_id` into locals; (2) BEFORE the idempotent `WHERE voided_at IS NULL` update, refuse card money — `IF v_pi IS NOT NULL OR v_method IN ('stripe','terminal') THEN RAISE EXCEPTION 'card tenders cannot be voided; refund in Stripe' USING ERRCODE = '23514'; END IF;` — the `method` arm covers the Mark-as-Paid path, which reaches the RPC with a null PI and can carry a real capture. Placing it before the idempotent update means re-voiding an already-voided card tender still reports the refusal instead of silently returning `already_voided`; (3) capture `v_paid_before` (the pre-void non-voided sum) under the same `FOR UPDATE`; (4) forward branch: `UPDATE jobs SET payment_status='paid', paid_at=COALESCE(paid_at,now()) WHERE id = v_job_id AND payment_status <> 'waived'` — never promote out of a deliberate waiver; (5) downgrade branch, only when `v_paid_before >= p_total_cents` (the ledger alone covered it, so the ledger alone may un-cover it): set `payment_status = CASE WHEN EXISTS (SELECT 1 FROM invoices WHERE job_id = v_job_id AND status <> 'void') THEN 'invoiced' ELSE 'unpaid' END, paid_at = NULL, payment_method = NULL, stripe_payment_intent_id = CASE WHEN j.stripe_payment_intent_id IS NOT DISTINCT FROM v_voided_pi THEN NULL ELSE j.stripe_payment_intent_id END WHERE id = v_job_id AND payment_status = 'paid'` — restoring `invoiced` keeps `cancelJob`/`deleteJob`'s "void the invoice first" guard armed; clearing `payment_method` stops a voided tender's method persisting into the daily summary, CSVs and receipt; the conditional PI clear avoids wiping a second tender's in-flight id; (6) otherwise return `outcome = 'voided_needs_review'` — void the tender, leave `payment_status` alone, and have the server action say "Tender voided. This job was also settled outside the tender list — reconcile in Stripe; the job stays marked paid" plus `Sentry.captureMessage("void_tender_mixed_settlement")`. Do not refuse there; refusing strands a wrong tender in the ledger. Add to §3 the invariants in prose: void may only reverse what the ledger recorded; void moves a job only between `unpaid`/`invoiced` and `paid` and never out of `waived`; a card tender is corrected by a Stripe refund, not a void. §4: render `⌫` only for `cash`/`check`/`ach` tenders with a null PI; show a disabled control with the refund tooltip otherwise. §9: add an open question on how a Stripe refund reconciles back to `job_payments` — this is the second place "no refunds" leaves stranded money.

### Restate Decision A honestly and make over-capture detectable — the RPC's return contract cannot currently signal it

**Severity:** Critical · **Applies to:** §2 (p_captured / never clamp), Decisions table row A, §5, migration record_job_payment · **From:** REG-2, COMP-2, SEC-6, CORR-8, OPER-4, OPER-5, FIRS-13

`createTerminalPaymentIntent` uses automatic capture, so both §5 callers run strictly post-capture and must pass `p_captured = true` — which short-circuits migration:117 unconditionally. The pre-capture guard therefore only ever runs for cash/check. Meanwhile §2 promises `Sentry.captureMessage("split_tender_overcapture")`, but `outcome` is only `'recorded'`/`'duplicate'` and `is_paid` is true in both the normal and the over-capture case, so the alert as specified can never be wired.

Decisions row A becomes: "Blocked pre-capture at `/api/terminal/pay` for cards (A5), blocked in the RPC for cash/check, recorded-and-alerted — never clamped — if it slips past either." §2: state plainly that `record_job_payment` is a post-capture recorder for every Stripe path and that its `NOT p_captured` branch serves only cash/check/ACH. Drop `DEFAULT false` from `p_captured` so both Stripe callers must pass it explicitly — the default is a trap that converts "money already taken" into a `23514` raise, i.e. stranded money on an `unpaid` job. State that `p_captured => true` is passed only once Stripe reports `succeeded`, never for `requires_capture`. Require both card callers to pass the STRIPE-REPORTED captured amount (`status.amount` in the status route, `pi.amount` in the webhook), never a client or recomputed value — the plan currently never says where the amount comes from. Extend the return contract to `outcome ∈ {'recorded','duplicate','duplicate_other_job','total_stale','overcaptured'}` and set `'overcaptured'` after the post-insert recompute when `v_outcome = 'recorded' AND v_paid_cents > p_total_cents`. Caller spec, matching the repo's Sentry precedent: `if (outcome === "overcaptured") Sentry.captureMessage("split_tender_overcapture", { level: "error", tags: { source: "split-tender" }, extra: { jobId, deltaCents: -balanceCents, paymentIntentId, method } })` at both `/api/terminal/status` (which imports no Sentry today — the cutover adds it) and `handleTerminalPayment`. On a pre-capture `23514` from the cash path, the server action raises `split_tender_overpay_blocked` at `warning` and surfaces a real message, never a raw Postgres error. §8 step 2's "overpay" test must be labelled as covering the cash/check path only. Do NOT amend `p_captured` to raise post-capture under any condition — that recreates the stranded-money bug the parameter exists to prevent.

### Webhook error contract: classify permanent vs transient, and make handleTerminalPayment return non-2xx on transient failure

**Severity:** High · **Applies to:** §2 (new caller-error paragraph), §5 (webhook rows), src/app/api/stripe/webhooks/route.ts — writers+guards deploy · **From:** REG-4, CORR-4, DATA-5, FIRS-8, OPER-5, COMP-2

Today `handleTerminalPayment` logs, captures to Sentry and lets the route return 200. Under v3 that RPC call becomes the only record that captured money exists, so a swallowed failure is unrecoverable with no Stripe retry — while the neighbouring `quick_pay` branch already returns 500 for exactly this reason (:71-79). But a blanket "non-2xx on any error" over-retries: `P0002` and `22023` are permanent and would put Stripe into ~3 days of redelivery against a condition that can never resolve, risking endpoint auto-disable for every other branch.

Add to §2: "`.rpc()` returns `{ error }`; it does not throw. Callers MUST classify. PERMANENT — `P0002` (job not found), `22023` (bad amount/total), `23514` (pre-capture overpay), `duplicate_other_job`: Sentry and return 2xx; retrying cannot fix them. TRANSIENT — connection, deadlock, RLS, a failed settings/line-item read, or an unknown code: return non-2xx so Stripe redelivers. Redelivery is free because the RPC dedupes on `stripe_payment_intent_id`. Do not copy `recordQuickPayJob`'s null-on-any-error shape — `record_quick_pay_job` cannot raise permanently and `record_job_payment` can." Change `handleTerminalPayment` to return a boolean like `handleInvoiceVoided`, and at the dispatch site (:80-81) do `const recorded = await handleTerminalPayment(pi); if (!recorded) return NextResponse.json({ error: "terminal record failed" }, { status: 500 });` — matching the `invoice.voided` (:52-57) and `quick_pay` (:71-79) precedents. Apply the same treatment to `/api/terminal/status`'s error branch, which currently `console.error`s and returns 200 with the status payload: the poller must not report success on an unrecorded capture. Add an explicit Sentry tag `split_tender_record_failed` with the PaymentIntent id on every RPC failure in both paths — a missing or stale function otherwise looks identical to a healthy quiet one. State the deliberate trade in §5: the job stays `unpaid` with captured money until a retry succeeds, which is strictly better than a false `paid`. Ship the non-2xx change in the SAME commit as `p_captured => true`; with the default `false` a 23514 is permanent and a 500 becomes a poison-pill loop.

### Dedupe is global — a cross-job PaymentIntent must not be reported as a benign duplicate, and must never touch the passed job

**Severity:** High · **Applies to:** §2 body order step 2 + migration record_job_payment (:101-143) · **From:** SEC-8, DATA-11, REG-12, COMP-13

`stripe_payment_intent_id` is globally UNIQUE and the dedupe SELECT has no `job_id` predicate, so a PI recorded on job A returns `outcome = 'duplicate'` for job B — a success shape — and then the function recomputes B's sum and, if it meets the caller-supplied total, executes `UPDATE jobs SET payment_status='paid'` on a job that received no money. Every planned caller reads `duplicate` as "already handled", so the anomaly produces no error, no Sentry event and no log.

Keep the lookup global (the constraint is global) but read the owning job and branch: `IF p_pi IS NOT NULL THEN SELECT id, job_id INTO v_existing_id, v_existing_job FROM job_payments WHERE stripe_payment_intent_id = p_pi; END IF;` then `IF v_existing_id IS NOT NULL THEN v_outcome := CASE WHEN v_existing_job = p_job_id THEN 'duplicate' ELSE 'duplicate_other_job' END; ...`. When `v_outcome = 'duplicate_other_job'`, SKIP the flip block (:136-143) entirely — that call recorded nothing for `p_job_id` and must not touch `payment_status`, `payment_method`, or `stripe_payment_intent_id`. Still fall through to the recompute so the caller gets a truthful balance. Wrap the INSERT in `EXCEPTION WHEN unique_violation THEN v_outcome := 'duplicate_other_job';` so the one genuinely unserialised race (two jobs, two different `FOR UPDATE` locks, same PI) lands on the designed path instead of a 500. Do NOT `RAISE` on the cross-job case: it is deterministic and unresolvable, so a non-2xx inside `handleTerminalPayment` becomes a ~3-day retry loop and a 500 on a GET the counter UI polls every two seconds. Callers treat `'duplicate'` as success/2xx and `'duplicate_other_job'` as 2xx plus `Sentry.captureMessage("split_tender_pi_job_mismatch")` with the PI, the passed job id and the owning job id. Amend §2 step 2 to state the scope explicitly. §8 step 4 tests: "same PI, different job id" asserts `duplicate_other_job`, no insert, and the `jobs` row for `p_job_id` completely unchanged.

### Guard the invoice-then-tender ordering — partial-only refusal plus a surfaced warning, not a blanket block

**Severity:** High · **Applies to:** §6 (new guard), §7, src/lib/actions/jobs.ts recordJobPayment — writers+guards deploy · **From:** DATA-2, CORR-5, REG-8, OPER-10, COMP-11, FIRS-2, COMP-14

§6 guards only the tender-then-invoice ordering. The reverse — invoice texted days ago, customer walks in and pays part in cash — is at least as likely and is entirely unguarded. But a blanket refusal breaks the workflow `createInvoiceFromJob`'s own comment contemplates (an invoiced job that stays billed and still owed), would leave the manager with no in-app way to record real cash, and would start failing the AI `record_payment` tool on ordinary settlements.

In the `recordJobPayment` server action, before invoking the RPC, read the job's `invoices` row (`.neq("status","void")`, destructured `{ data, error }`, fail closed on error). Note that `voidInvoiceForJob` DELETES the local row on success, so "a row exists" is equivalent to "a live invoice exists". Then: (a) if `amountCents < remainingBalance` AND a non-`paid` invoices row exists, REFUSE — "This job has an open invoice for the full amount. Void it first, then take partial payments" — wired to the Void Invoice action, which still works at that moment because the job is not yet `paid`; (b) if the tender covers the full balance, PROCEED and return `{ ok: true, warning: "This job has a live payment link for $X — void it so the customer isn't billed twice." }` for the footer to surface inline. Never refuse a captured tender on this basis: `handleTerminalPayment` and the status route call the RPC after Stripe has the money, and a refusal there is stranded money — for captured tenders on an invoiced job, record and `Sentry.captureMessage("tender_on_invoiced_job")`. Do NOT add a tender guard to `voidInvoiceForJob` — it is Stripe-first, refuses on uncertainty, and a guard there would block the correct remediation for this very case. Note in §7 that the double-collection risk is pre-existing (`recordPayment` has the same hole today) and that A4's `handleInvoicePaid` change is what converts it from silent to alarmed; the guard reduces frequency, detection is what limits harm.

### Restore the sales-tax lock and guard line-item mutation — v3 disarms an existing anti-drift guard

**Severity:** High · **Applies to:** §6 (new guards), the "What that dissolves" Decision C row, src/lib/actions/jobs.ts:275-297, src/app/(dashboard)/jobs/[id]/page.tsx — writers+guards deploy · **From:** COMP-6, COMP-7, DATA-6

Verified: `setJobChargeSalesTax` refuses only when `payment_status !== 'unpaid'` or an `invoices` row exists. A half-paid job under v3 has neither, so the toggle is live between tenders and flipping it moves the grand total by the full MA rate on taxable parts — the second tender is then measured against a different total than the first. This is a guard v3 actively breaks, not one it inherits, and the dissolution table writes the whole drift problem off as "Moot".

§6, new guard: in `setJobChargeSalesTax`, after the existing two checks, `const { data: tender, error: tenderError } = await supabase.from("job_payments").select("id").eq("job_id", id).is("voided_at", null).limit(1).maybeSingle(); if (tenderError) return { error: tenderError.message }; if (tender) return { error: SALES_TAX_TENDERED_MSG };` — non-voided only, so an all-voided job unlocks. Add `const SALES_TAX_TENDERED_MSG = "Sales tax is locked once a payment has been taken."` as a DISTINCT string; reusing `SALES_TAX_LOCKED_MSG` ("locked once the job is invoiced") sends the operator hunting for an invoice that does not exist. Extend the block comment at jobs.ts:265-272 with the third condition. Page prop becomes `salesTaxLocked={!!invoice || paymentStatus !== "unpaid" || hasNonVoidedTender}` — free, since §4 already loads the tender list. §6, second guard: `createLineItem` / `updateLineItem` / `deleteLineItem` refuse (or require explicit confirm) when a non-voided tender exists. Do NOT add a `job_line_items` DB trigger: verified that `approveRecommendations` (dvi.ts:697) refuses when `job.status === "complete"`, and `showMarkAsPaid` (job-payment-footer.tsx:65-68) requires exactly that status before any tender is possible — so the unauthenticated DVI path cannot reach a half-paid job. Record that dependency explicitly in §6: "the DVI approval guard at dvi.ts:697 is load-bearing for split-tender; relaxing it to allow approvals on complete jobs reintroduces an unauthenticated total-mover." Rewrite the Decision C dissolution row: "Reduced, not moot. Manager line-item edits can still move the total mid-checkout, so §6 guards them; the sales-tax toggle's existing lock stops firing under v3, so §6 restores it; the DVI path is already blocked by dvi.ts:697. Decision C's DB trigger stays dropped, with that footnote."

### Add total-drift detection to the RPC via a `total_stale` outcome — never a raise, never a clamp

**Severity:** High · **Applies to:** §2 (p_total_cents server-side invariant), §9, migration record_job_payment · **From:** DATA-6, COMP-7

§2 says `p_total_cents` is "never accepted from the client", but the RPC is `GRANT EXECUTE … TO authenticated` and PostgREST auto-exposes it, so the paid-flip has no invariant a reviewer can point at. Separately, the total genuinely can move between the server action computing it and the RPC taking its lock. A raise is the wrong response — post-capture it strands money, which is precisely what `p_captured` exists to prevent.

Inside the `FOR UPDATE` lock, after the insert: `SELECT COALESCE(SUM(total),0)*100 INTO v_subtotal_cents FROM job_line_items WHERE job_id = p_job_id;` The labour+parts subtotal is a strict lower bound of `calculateTotals`' grand total (supplies, hazmat and tax are additive and non-negative). If `p_total_cents < v_subtotal_cents`, do NOT raise: SKIP the paid-flip, leave the job `unpaid`, and return `outcome = 'total_stale'`. The tender is still recorded — money always lands in the ledger — and the operator's UI re-reads the job, sees the higher balance and collects the difference. Caller emits `Sentry.captureMessage("split_tender_total_drift")`. Document it in §2 as the server-side invariant on the paid-flip and note that it also makes an understated `p_total_cents` unusable for minting a `paid` job from a direct PostgREST call. Do NOT make `record_job_payment`'s flip symmetric (adding an ELSE that un-pays when the total rises) — that would un-pay legacy and invoice-settled jobs on any small tender, violating DATA-3's "the ledger may only reverse what it recorded". Add the drift window to §9 open questions, and note that `docs/money-layer-design.md` §4's `job_totals` view deletes `p_total_cents`, its forgery surface and this whole window at once — the check is a bridge if v3 ships first.

### Correct the method-attribution claims — "nothing to ask the accountant" is false, and the cash drawer goes wrong on day one

**Severity:** High · **Applies to:** §7, the "What that dissolves" A12 row, src/lib/actions/reports.ts getDailySummary, both CSV exports · **From:** DATA-7, CORR-11, REG-9, COMP-8, FIRS-5, OPER-8

Verified: `getDailySummary` buckets the whole `jobTotal` under `job.payment_method || "unrecorded"` (reports.ts:582-583), and the RPC sets that column to whichever tender closed the balance. A $386.20 job split $200 cash + $186.20 card reports $386.20 terminal and $0 cash, so the drawer runs $200 over against the read CLAUDE.md itself names as the cash-drawer read. The DOR CSV and jobs CSV carry the same single value. The dissolution table's "nothing to ask the accountant" is what would stop someone from looking.

KEEP `payment_method = p_method` in the RPC flip — it is the correct legacy fallback and, under Decision B (no backfill), the only value legacy paid jobs will ever have. Do NOT adopt a NULL sentinel: `receipts/send.ts:126` and `webhooks/route.ts:621` both do `job.payment_method || "stripe"`, so a NULL would print "paid via stripe" on a cash customer's receipt. Rewrite the A12 dissolution row to scope it to the tax BASIS only: "Gone for the accrual/cash question — the export still filters on `paid` and totals are unchanged. NOT gone for method attribution; see §7." Strike "nothing to ask the accountant" and "Revenue numbers won't shift" (true for totals, false for the by-method split). Add a §7 bullet naming all consumers: `reports.ts:582` revenue-by-method (also the AI daily-summary tool), the DOR tax-audit CSV's Payment Method column, the jobs CSV export (both columns), and the customer receipt. Fix in the same release: (a) `getDailySummary` allocates `jobTotal` PRO RATA across non-voided tenders by tender share, distributing the rounding residue to the largest tender so the buckets re-sum exactly to `jobTotal` — do NOT add raw tender amounts, which are grand-total basis (tax, supplies, hazmat, inspection items) while `jobTotal` is inspection-filtered pre-tax line items, so mixing them makes `revenueByMethod` stop summing to `totalRevenue`; fall back to `jobs.payment_method` when a job has zero non-voided tenders; read tenders as a SEPARATE top-level `fetchAllRows` query keyed by the day's job ids, never an embedded select, because `{ count: "exact" }` counts top-level rows only; add `requireManager()` to the A/R and daily-summary reads or the managers-only RLS returns `[]` with no error and silently degrades to the wrong number behind a guard a reviewer would count as covered. (b) Both CSVs keep ONE ROW PER JOB — the DOR export's per-job loop accumulates totalLabor/totalParts/totalTax/totalSubtotal, so a second row per job inflates every summary figure — and render the Payment Method cell as `Split` or a joined list when tenders exist. Per-tender detail, if wanted, is a separate appended section keyed by RO#, the way MANUAL INCOME is already appended.

### Receipts render the tender list — the only customer-facing artifact of the feature, dropped between v1 and v3 without a note

**Severity:** High · **Applies to:** §4 (new subsection), §5 (receipts row), §8 (ships with the footer), src/lib/actions/receipts.ts, src/app/receipt/[token]/page.tsx, src/lib/resend/templates.ts, src/lib/receipts/send.ts · **From:** CORR-14, REG-10, COMP-10, FIRS-6, OPER-8

Appendix A §6 required this; v3 removed it from every section including §7's honest-acceptance list. Both the hosted page and the email read `job.payment_method`, so a customer who handed over $200 cash and a card receives a document saying "$386.20 — Card". Because the label depends on tender ORDER, a cash-last split produces a receipt captioned "Cash" for the full amount — a receipt that overstates cash collected, which is the direction that matters for a cash-handling record. This is a surface the plan changes the data behind without touching the code, which is exactly why it fell out.

Patch `getReceiptByToken`'s enumerated select (receipts.ts:34-39) to add `job_payments(amount, method, created_at)` filtered `voided_at is null`. Enumerate columns — never `created_by`, `note`, `reference`, `void_reason` — the existing comment at receipts.ts:12-22 establishes that rule because `/receipt/[token]` is unauthenticated and non-expiring. A voided tender on a customer receipt is worse than no tender list. Render `method · amount · time` rows on the hosted page (`:124`) and in `paymentReceiptEmail` (templates.ts:212-231) when more than one non-voided tender exists; fall back to today's single line at zero or one tender — mandatory, not optional, because Decision B means every legacy job has zero tenders. Make the template change ADDITIVE (an optional `tenders` prop): `paymentReceiptEmail` has a third caller inside `handleInvoicePaid` (webhooks/route.ts:613) and a required-prop change would break it. `receipts.ts:31` and `/api/receipts/send:47` both use `createAdminClient()`, so the managers-only RLS is not an obstacle — but add a test pinning that, because a PostgREST embed the caller cannot read returns `[]` with HTTP 200, so moving the tech route off the admin client would silently degrade every split receipt with no error anywhere. When tenders exist, take the headline figure from the tender sum and refuse to send if it disagrees with `calculateTotals`, matching the rule already enforced at webhooks/route.ts:590-603. Ships with or after the writer cutover, never before — a receipt listing one tender against a full-balance total while `handleTerminalPayment` still stomps the job would be worse than today.

### Complete §6's guard list and gate the invoice UI, not just the server action

**Severity:** High · **Applies to:** §6 Guards (rewrite), src/components/dashboard/invoice-section.tsx — writers+guards deploy · **From:** FIRS-9, COMP-11, COMP-14, REG-6, DATA-13, CORR-1

§6 lists four guards. The verified set is nine. Separately, `invoice-section.tsx` decides whether to offer billing from `settled = paymentStatus === 'paid' || 'waived'`, and v3 keeps a half-paid job at `unpaid` — so the manager still sees a Create & Send card quoting the full grand total and only discovers the refusal after clicking. The comment on that line records that it was hoisted specifically so it suppresses the Create card, not just Resend; the same reasoning applies to tenders.

§6's list becomes: `deleteJob` (any row, voided or not — matching the FK); `cancelJob` (non-voided only); `createInvoiceFromJob` and `resendInvoiceForJob` (non-voided); `chargeCardOnFile` (non-voided, A3); `setJobChargeSalesTax` (non-voided, A14); line-item mutations (non-voided, A14); `recordPayment` and `updateJob` status transitions (non-voided, A7/A8); plus `recordJobPayment`'s open-invoice check (A13). Add `voidInvoiceForJob` and the `invoice.voided` branch as explicit NO-CHANGE entries with the reason recorded (both `.eq('payment_status','invoiced')`-scoped, so they no-op on a tendered job, which is correct) — a reader auditing §6 against post-plan code needs to see they were considered rather than missed. §4 UI: `/jobs/[id]/page.tsx` reads non-voided tenders once and passes `hasTenders` to both `JobPaymentFooter` and `InvoiceSection`. In `invoice-section.tsx`, do NOT overload `settled` — add `const billingBlocked = settled || hasTenders;` and use it for the no-invoice Create card and for `canResend`, while `VoidInvoiceButton` stays on `!settled` (a half-paid job that was already invoiced is exactly where voiding matters most). When `hasTenders && !settled`, render the amber/stone card with "Partially paid at the counter — finish collecting the balance below", not "nothing to bill": there IS a balance, it just isn't billable through Stripe. Split `deleteJob`'s message: non-voided tender → "This job has recorded payments — void them first"; voided-only → "This job has voided payment history and can't be deleted; a manager must clear it first." Never a raw 23503.

### §8 has no step that builds voiding — add the server action, the UI and the tests

**Severity:** High · **Applies to:** §8 (new step 3b), §3, §4 · **From:** DATA-10, COMP-13, CORR-7

§4's mock shows a per-tender ⌫ and §3 gives the RPC a real contract, but §8's six steps contain no step that builds the void server action, the void UI, or any void test. And now that `void_job_payment` requires `p_total_cents`, nothing in the plan says where that value comes from on the void path — the one backwards transition in the design is the one with no implementation step.

Insert §8 step 3b: "`voidJobPayment(paymentId, reason)` server action — `requireManager()` at the top (do not rely on the RLS policy alone), `await createClient()`, destructures `{ data, error }` from the RPC and reads `data?.[0]` since the function `RETURNS TABLE` and PostgREST hands back an array (failing closed on an empty array — note this in §2, since §5's prose implies a scalar). It loads the tender's parent job and computes `p_total_cents` with the same shared `getJobTotalCents` helper as `recordJobPayment`, never from the client. It maps `23514` to 'This tender was charged through Stripe — refund it in Stripe rather than voiding it', and `voided_needs_review` to the mixed-settlement message, never letting a Postgres exception string reach the footer. UI: per-tender ⌫ on the footer tender list, manager-only, rendered only for cash/check/ACH tenders with a null PI, behind a confirm dialog capturing `void_reason`." Add void cases to step 2's test list: void the only tender (job → unpaid, `paid_at` nulled, `payment_method` cleared); void one of two (job stays unpaid, balance grows); void on an already-paid job; double-void (`already_voided`, balance unchanged); void a card tender (refused, tender unchanged, and still refused on a re-void); void executed as a tech (must not mutate `jobs`); void racing a concurrent `record_job_payment` on the same job (both take the same `FOR UPDATE` lock — assert the final `payment_status` matches the final ledger sum regardless of order); and void on a job made paid outside the ledger (`voided_needs_review`, `jobs` untouched).

### Make a stranded half-paid job findable — §7 accepts blindness on the screens built to catch unpaid work

**Severity:** High · **Applies to:** §7 (first bullet, rewritten), §6.1 (new), src/lib/actions/receivables.ts · **From:** COMP-12, FIRS-12, REG-9, OPER-4

Every §7 acceptance is conditioned on "invisible for a 60-second counter event", and the design contains nothing that enforces or observes that condition. When it fails — second card declines, customer leaves for an ATM — the job reads Unpaid in the jobs list, appears at FULL value in three A/R surfaces with no indication money was collected, is excluded from the DOR export entirely, and the $200 exists only in one job's footer that nobody will open. §7 also says "A/R" singular; there are four consumers, one of which the assistant answers questions from.

Rewrite §7's first bullet to name all four: `getReceivablesSummary` (receivables.ts, overview tile), `getReceivablesData` (A/R table + aging + fleet aging), `getFleetARSummary` (reports.ts, also the assistant's `get_ar_summary`) — all three OVER-state what is owed; and `getTaxReportData` (`.eq("payment_status","paid")`) which DROPS a stranded partial's collected cash and its sales tax from the DOR export entirely. Say that last one out loud; it is the one acceptance that touches a filed return. Then pick ONE coherent visibility option and write it into the plan — do not ship the half-measure: (a) DISPLAY-ONLY (recommended for v1) — add `job_payments(amount, voided_at)` to `getReceivablesData`'s select, carry a `collected` field, render a "$200.00 collected" sub-line and sort those rows to the top, leaving every total untouched; or (b) NET EVERYWHERE — apply the subtraction in all three A/R functions in one commit. Patching `getReceivablesData` alone makes the tile, the table and the AI disagree, replacing an old bug with a new one. Either way add `requireManager()` to these financial reads: the managers-only RLS returns an empty embedded array with NO error to a non-manager, so the guard would silently render "$0.00 collected" on a job holding $200. New §6.1: a `/api/cron/*` route (sibling to the health route, registered in `vercel.json`, authed via the existing shared cron secret, and PROBED against production after ship per the July 2026 CRON_SECRET incident) running `select j.id, j.created_at from jobs j where j.payment_status not in ('paid','waived') and exists (select 1 from job_payments p where p.job_id = j.id and p.voided_at is null) and j.updated_at < now() - interval '1 hour';` — emitting both `console.log` and `Sentry.captureMessage("split_tender_stranded", { level: "warning" })`. Given the owner's fixed constraint that a split completes in one visit, any row is by definition an anomaly, so this is near-zero-noise; a non-empty result falsifies the transient premise and reopens §7.

### Ship behind an env-var kill switch and write the rollback paragraph

**Severity:** Medium · **Applies to:** §8 (new step 0 and a Rollback paragraph) · **From:** OPER-6, CORR-3, DATA-4

Appendix B required a flag; v3 drops it with no discussion — it is not in §8, not in §7, and not in the dissolution table (which moots a different flag for a different purpose). Step 3 replaces the sole mechanism by which a Terminal payment gets recorded, at a shop whose counter runs on that reader, and the only recovery documented anywhere is an implicit git revert.

§8 step 0: a plain server env var `SPLIT_TENDER_ENABLED` (NOT `NEXT_PUBLIC_`, and NOT `shop_settings` — the latter needs a migration plus a `shopSettingsSchema` addition or `updateShopSettings`'s `.partial().safeParse()` strips it). The footer's parent is a server component, so read it there and pass it down. Default OFF; turned on only after the writer cutover verifies. Flag OFF ⇒ the amount dialog's Partial control is ABSENT FROM THE DOM, not merely `disabled` — a disabled radio in a client component is one devtools edit from a partial charge on live hardware. New §8 "Rollback" paragraph stating the three things `/post-deploy-check` cannot know: (1) the kill switch does not by itself recover an RPC-side failure — to make it do so, keep the pre-cutover `update jobs set payment_status='paid'` in the status route and `handleTerminalPayment` as an explicit `else` branch taken when the flag is off, guarded by `.neq("payment_status","paid")` AND the absence of any non-voided tender, and delete that branch in a follow-up commit only after a full week; (2) the migration is NEVER reverted — `job_payments` rows are inert when nothing writes partials, and dropping the table destroys the money records `ON DELETE RESTRICT` exists to protect; (3) after a revert, any job carrying non-voided tenders needs manual reconciliation, because the restored code writes `payment_status` directly, the §6 guards are gone, and `deleteJob`/`cancelJob` surface a raw 23503 from the surviving FK — include `select job_id from job_payments where voided_at is null;` as the find-them query.

### Replace §8 step 1 with a migration runbook — the only Supabase project is production

**Severity:** Medium · **Applies to:** §8 step 1, §7 · **From:** OPER-7, OPER-11

§8 step 1 is one line for the riskiest step. There is no CI, no `supabase/config.toml`, no shadow database and no second project, so the migration is hand-applied against the live database while Vercel auto-deploys independently. A fresh function is also routinely invisible to PostgREST for a short window after `db push`, which presents identically to "the migration didn't apply".

Replace with: (a) apply by ONE named mechanism and record which — `npx supabase db push --project-ref naazdudqubyrgakiffum`; if applied via the Supabase MCP instead, the local file MUST be `IF NOT EXISTS`-guarded and written immediately afterward (see `20260727170427_jobs_receipt_token.sql` and the `20260731185436_applied_out_of_band.sql` placeholder for why a stamped-but-fileless version silently blocks every later push). (b) Verify in SQL, schema-qualified: `select p.oid::regprocedure, p.prosecdef from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('record_job_payment','void_job_payment');` — exactly two rows with the expected argument lists; plus `select policyname from pg_policies where tablename = 'job_payments';`. (c) Smoke the PostgREST surface once (`.rpc` with a bogus job id → expect `P0002`, not `PGRST202`); on `PGRST202`, `notify pgrst, 'reload schema';` and retry. (d) `npx supabase gen types typescript --project-id naazdudqubyrgakiffum > src/types/supabase.ts`, then `npm run build` locally BEFORE pushing code. (e) `/post-deploy-check` after the migration and again after the Terminal cutover reaches master. Add to §7: "There is one Supabase project and it is production. Local dev and `staging` preview deploys both write to it, so any split rehearsed anywhere inserts real `job_payments` rows and can flip a real customer's job to `paid`."

### Migration defects beyond the void signature: overload guard, uuid function, and the PI COALESCE direction

**Severity:** Medium · **Applies to:** supabase/migrations/20260831000000_job_payments_split_tender.sql · **From:** OPER-11, REG-12, DATA-12, CORR-13, COMP-13

Both functions use `CREATE OR REPLACE`, so the plan's two-arg `void_job_payment` and the migration's three-arg form are not alternatives — applying one after the other leaves BOTH resident, and PostgREST resolves `.rpc()` by named arguments, so a caller omitting `p_total_cents` silently binds to the broken overload and nulls `paid_at` on a fully-paid job. Separately, `stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_pi)` is first-writer-wins, which preserves whatever `/api/terminal/pay` stamped at arm time rather than the tender that actually settled.

Prepend to any migration that defines or redefines either function a name-based (not signature-enumerated) overload drop, so it catches signatures nobody thought of: `do $$ declare r record; begin for r in select oid::regprocedure as sig from pg_proc where pronamespace = 'public'::regnamespace and proname in ('record_job_payment','void_job_payment') loop execute 'drop function if exists ' || r.sig; end loop; end $$;`. Note in §8 that `supabase db push` will not re-run an applied version, so editing this file after pushing is a no-op — a correction must ship as a NEW migration carrying the same DO block. Change `uuid_generate_v4()` at line 16 to `gen_random_uuid()`, matching every table since March 2026 and dropping a `uuid-ossp` dependency the codebase has moved off. Flip the jobs write to `stripe_payment_intent_id = COALESCE(p_pi, stripe_payment_intent_id)` so the SETTLING tender's PI wins — with the arm-time write deleted (A5) the RPC becomes the column's only writer, the UNIQUE-index 23505 risk becomes unreachable, and the value is the one `/api/receipts/send:72` would want to match. Keep the `record_job_payment` forward flip's new `AND payment_status <> 'waived'` predicate (A9) — right now two sibling functions carry the same unpredicated UPDATE with no stated intent, which is how this class of defect got in.

### RLS hardening: revoke UPDATE/DELETE, promote only void to SECURITY DEFINER, and correct §2's rationale

**Severity:** Medium · **Applies to:** §1 (RLS), §2 (security invoker paragraph), §7, migration · **From:** SEC-3, SEC-11, SEC-5, FIRS-14, DATA-10

`FOR ALL` plus Supabase's default `GRANT ALL ON TABLES TO anon, authenticated, service_role` (this repo issues no explicit table grants anywhere) means a manager session can `PATCH /rest/v1/job_payments` to rewrite `amount`, clear `stripe_payment_intent_id` (the idempotency arbiter), or `DELETE` rows outright — none of which runs the recompute, and all of which defeat the "never hard-delete money" guarantee the design rests on. Separately, §2's stated rationale for having no in-function role gate is wrong in a way that will mislead the next reader.

Add two lines to the migration: `-- The RPCs are the only intended mutation path; any future need goes through a new RPC.` / `REVOKE UPDATE, DELETE ON job_payments FROM anon, authenticated;`. Keep the single `FOR ALL` policy (it costs nothing once the verbs are revoked and matches house style). Because `void_job_payment` performs the UPDATE, promote ONLY that function to `SECURITY DEFINER` owned by `postgres`, with `SET search_path = pg_catalog, public, pg_temp` (pg_temp stays TRAILING — naming it last is the documented secure arrangement, and removing it makes the temp schema searched first for relations) and an explicit first statement `IF NOT is_manager() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;`. This also closes a real fail-open: under a tech's session the managers-only policy hides `job_payments` rows, so today's UPDATE matches zero rows, `SUM(amount)` evaluates to 0, and the ELSE branch flips the job to `unpaid` — which `techs_update_assigned_jobs` permits. Do NOT touch `record_job_payment`: leave it SECURITY INVOKER with no in-function gate, because `service_role` (the terminal route and webhook) must call it and any role gate would reject those calls, raising after Stripe captured. Correct §2's rationale to say exactly that — the reason `record_job_payment` has no gate is that service_role must call it, NOT the `auth.uid() is null` argument currently written, which would lead the next reader to add symmetric gates and break the webhook. Add to §7, beside the existing `techs_update_assigned_jobs` bullet: "`/api/terminal/pay` and `/api/terminal/status` are gated at `requireStaff` and write with `service_role`, so on the Terminal path the managers-only RLS policy is not the effective gate — `requireStaff` is. Pre-existing (techs can already flip `payment_status` through this route today); v3 changes the artifact from a status flip to a ledger row, not the reachability." Amend §1's "Financials: managers only" comment to match. File `is_manager()` / `get_user_role()` search_path hardening as a SEPARATE repo-hygiene migration — it changes the gate behind 43 policies across 8 migrations, and that blast radius does not belong inside a feature's schema step where a failure would be diagnosed as a split-tender bug (both must stay SECURITY DEFINER: the `users` SELECT policy is itself `is_manager() or auth_id = auth.uid()`, so an INVOKER version recurses; schema-qualify `public.users` and the `public.user_role` return type; verify with `npx supabase db lint`'s `function_search_path_mutable` rule).

### Add a `source` discriminator and actor plumbing — created_by is NULL on exactly the tenders most likely to be disputed

**Severity:** Medium · **Applies to:** §1 (schema), §2 (signature), migration · **From:** SEC-10, DATA-5, FIRS-14

`created_by` is derived as `(SELECT id FROM users WHERE auth_id = auth.uid())`, and every card tender is written by service_role — from `/api/terminal/status` via `createAdminClient()` and from the webhook — so `auth.uid()` is NULL and the subquery yields NULL. The ledger ends up attributing cash tenders and not card ones, which inverts the useful case, and there is nothing to distinguish a browser-originated tender from a webhook-originated one.

§1: add `source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','terminal-status','webhook'))`, mirroring the `source` field `recordQuickPayJob` already threads through. Omit `'invoice'` for now and add it when A4's `handleInvoicePaid` tender lands (or include it there). §2: add `p_source text DEFAULT 'manual'` and `p_actor_auth_id uuid DEFAULT NULL`, and in the INSERT use `(SELECT id FROM users WHERE auth_id = COALESCE(p_actor_auth_id, auth.uid()))`. Resolving inside the function is what makes this safe — it keeps the FK correct regardless of which id the caller holds, and a bogus value degrades to NULL instead of raising 23503 and killing a tender insert after Stripe captured. Do NOT add a `p_created_by uuid` fed from `requireStaff().userId`: that is the Supabase auth id and would violate the `users(id)` FK on every terminal tender. Callers: `/api/terminal/status` passes `p_actor_auth_id: auth.userId, p_source: 'terminal-status'` (it already holds `auth` from `requireStaff()` at :8); `handleTerminalPayment` passes `p_source: 'webhook'` and no actor; `recordPayment` passes `'manual'` and no actor. §1 prose: state the contract honestly — `created_by` is best-effort and is NULL whenever `source = 'webhook'`, and also for a `terminal-status` row on the losing side of the poll/webhook race the `p_pi` dedupe exists for. `source` is the column to reason from. Do NOT add a CHECK tying NULL `created_by` to `source = 'webhook'` — it would reject legitimate rows and could fail a tender insert after capture.

### Fill out §7's accepted-limitations list with the seven consequences the plan currently leaves unstated

**Severity:** Low · **Applies to:** §7 What we're accepting · **From:** DATA-13, DATA-8, CORR-7, CORR-13, REG-10, COMP-11, OPER-2, FIRS-14, COMP-7

§7 exists so nobody discovers these later, and it currently lists four items. Verification surfaced seven more consequences that are real, defensible, and invisible in the current draft — several of them the direct result of amendments above, which makes writing them down part of adopting those amendments rather than a separate exercise.

Add: (1) "A job that has ever carried a Stripe tender is permanently undeletable, and so is its customer (`jobs.customer_id` is ON DELETE RESTRICT). That is the intended trade." (2) "A half-paid job has no receipt path at all, by design — `paid_at` is NULL and every receipt surface gates on it." (3) "`jobs.stripe_payment_intent_id` is legacy/single-payment convenience, set only by `record_job_payment` on the flip, so it holds the SETTLING tender's PI — NULL when a split settles in cash, and never an armed-but-unsettled id. `job_payments.stripe_payment_intent_id` is the sole per-tender arbiter. It remains the tech authorization key at `api/receipts/send/route.ts:72`, which is safe only because that surface is Quick Pay-only; any future tech-facing receipt control on the job footer must validate against `job_payments`, not this column." (4) "A card/terminal tender cannot be corrected in ShopPilot. Refund it in Stripe; the job stays `paid` and the ledger stays overstated by the refunded amount until refunds are in scope. This is today's behaviour for a refunded job and is not a regression." (5) "Once any non-voided tender exists, Charge Card on File disappears for that job. The balance must be collected on the Terminal, in cash, by check, or by ACH. Card-on-file is all-or-nothing in v1." (6) "A job with a live tender cannot be invoiced (§6). A customer who pays part in cash and asks to be billed for the rest is a deposit, which is out of scope (§9 Q1). The counter path is void the tender, return the cash, then invoice in full." (7) "If the total moves below the tendered sum, the job strands as `unpaid` until an operator voids a tender or restores the line item, and is invisible to the DOR export while stranded." Also add the trust-boundary line from A25 and the single-Supabase-project line from A23.

### Name the deleteJob escape hatch before it is improvised under pressure

**Severity:** Low · **Applies to:** §6 (deleteJob bullet), migration header comment · **From:** DATA-13

§6 has `deleteJob` refuse when ANY row exists, voided included, and `ON DELETE RESTRICT` enforces the same at the FK, and nothing in the app can delete a `job_payments` row. So a single mis-keyed tender that was immediately voided blocks that job's deletion forever — test jobs, duplicate ROs, jobs created against the wrong customer. The plan makes the trade deliberately but names no exit, so the first time it bites someone will reach for the production SQL editor with no documented procedure.

Either ship `purgeVoidedTenders(jobId)` in the guards deploy — `requireManager()`; deletes only `WHERE job_id = $1 AND voided_at IS NOT NULL AND stripe_payment_intent_id IS NULL`; refuses if any non-voided tender exists; refuses with an explicit message if any voided tender carries a PI, because that row is the only local record of money Stripe actually took and its UNIQUE value is the design's idempotency arbiter, so freeing it would let a late webhook retry insert a duplicate; `Sentry.captureMessage` with job id, row ids and amounts before deleting — or, defensibly for v1, state in §6 that the escape hatch is manual SQL and put the exact statement in the migration header next to the RESTRICT rationale, with the PI-null restriction baked in: `-- DELETE FROM job_payments WHERE job_id = '<uuid>' AND voided_at IS NOT NULL AND stripe_payment_intent_id IS NULL;`

### Re-anchor the three stale citations and switch §§5–6 to symbol-based references

**Severity:** Low · **Applies to:** §4 constraint 3, §5 table, §8 step 1 note · **From:** CORR-15, REG-13, FIRS-15

§5 cites `handleTerminalPayment` at `webhooks/route.ts:518-530`; that range is now inside `handleInvoicePaid`'s receipt-fetch block and the function is at :750 — so an implementer following §5 literally would open the one function the same table declares Unchanged and edit it. This is the third recorded drift in a document whose own opening note already concedes the problem, which is evidence that the note has not prevented what it warns about. Verified clean: `recordPayment` at jobs.ts:490, `deleteJob` at :440, `cancelJob` at :399, and the footer's :133/:140 are all still exact.

Correct §5's row to `handleTerminalPayment (webhooks/route.ts:750-777, dispatched at :80-81)` and fix the repeat later in the doc. Correct constraint 3's `receivables.ts:52-70` to `getReceivablesSummary (predicate and full-total sum)` and note that `getReceivablesData` has the identical shape and needs the same edit. Then stop citing bare line numbers in §5 and §6: every path they name has exactly one declaration in its file, so `handleTerminalPayment in src/app/api/stripe/webhooks/route.ts` is a strictly stronger locator that cannot rot. Keep line numbers only where the target genuinely has no name — §4's `job-payment-footer.tsx:133/:140`, two anonymous JSX props — and there quote the ~40 characters being changed (`amountCents={Math.round(grandTotal * 100)}`) so a drifted number self-corrects. Add under §8 step 1: "refs re-verified at <SHA> on <date>". Scope re-verification to the three files git shows have moved since the plan was authored — `webhooks/route.ts`, `invoices.ts`, `receivables.ts`. Note that the same churn shipped `voidInvoiceForJob` and the `invoice.voided` branch, which §6's guard list predates: citation rot is the cheap symptom, the stale guard list is the expensive one.

### Give §8 step 6 an acceptance protocol — and do not document deleting money rows as the cleanup

**Severity:** Low · **Applies to:** §8 step 6 · **From:** OPER-9

"A real counter split before declaring done" against the only Supabase project means production, with refunds out of scope, so a rehearsal on the live reader is an irreversible charge to a real card. All of the state-machine risk — dedupe, overpayment guard, `p_captured`, concurrent tenders, webhook retry mid-call — can be exercised in Stripe test mode with no real money at all.

(a) Rehearse in Stripe TEST mode: point `.env.local` at `sk_test_…` plus a test-mode simulated reader id in `STRIPE_TERMINAL_READER_ID` — both are plain env reads, no code change. This is where "declaring done" should be earned. (b) If a live confirmation on the physical reader is still wanted, state plainly that it is a REAL sale: walk-in customer (`WALK_IN_CUSTOMER_ID`, already excluded from receivables and customer-insights), one $1.00 line item, split $0.50 cash + $0.50 card, job id recorded in PROGRESS.md. (c) Do NOT document `delete from job_payments where job_id = …` as sanctioned cleanup — the card really was charged, so the tender row is a true record, and deleting it makes Stripe and the ledger disagree, which is exactly the unreconcilable state `deleteJob`'s existing comment cites. Instruct instead: leave the $1 in the books; it is real revenue and real collected tax, and it is below any DOR materiality threshold. (d) Add an explicit TERMINAL-FIRST ordering case to the walkthrough ("partial on the reader, then cash for the remainder") — the money-losing sequence in the build-order finding is precisely the one a cash-first walkthrough would miss. (e) Add the stale-footer case: record a $200 cash tender, then arm Terminal Pay from a second tab opened BEFORE the tender; the request must be refused server-side by A5's cap.

### Make the footer's tender read fail closed — a failed read renders a full balance and re-arms a full charge

**Severity:** Medium · **Applies to:** §4 (read contract), §8 acceptance criteria · **From:** COMP-4

§4 makes the footer balance load-bearing and computes "Partially Paid" from `tenders.length > 0 && balance > 0`, but never says what happens when the tender read fails. Every failure mode collapses identically: `tenders = []` → `balance = grandTotal` → the footer renders "Unpaid", the amount dialog defaults to the full total, and Terminal Pay arms for the full amount on a job that already collected $200. This is the exact class CLAUDE.md codifies after the receivables `$0 outstanding` incident, applied to the number the plan is introducing.

Add to §4: "The tender read destructures `{ data, error }` and THROWS on error — `getJob`'s contract is the precedent and the page's error boundary is the correct outcome, never a rendered balance. When the tender read fails the footer must not render Terminal Pay, Charge Card on File, or Mark as Paid at all. Note that an RLS denial returns zero rows with NO error, so throw-on-error is necessary but not sufficient — which is why A5's server-side cap in `/api/terminal/pay`, not the rendered number, is the real guard. A guard that lives in a client component's props is not a guard." Add to §8: step 3's acceptance criteria gain "a failing tender query surfaces an error rather than a full-total balance", and the case is added to the `/verify-flow` definition.

### Narrow /api/terminal/status's response — a pre-existing read oracle over the shop's payment history

**Severity:** Low · **Applies to:** src/app/api/terminal/status/route.ts — standalone commit, NOT part of the split-tender cutover · **From:** SEC-5

The route returns `{ ...status, jobId }`, where `status` carries `amount` and the raw Stripe `metadata` (including Quick Pay notes and job ids), behind a `requireStaff()` gate that admits techs, keyed on an unvalidated `pi` query parameter that is never checked against the job being modified. This is a pre-existing leak that §5 does not create, so it should not be entangled with the cutover — but the cutover is what makes anyone look at the file.

Narrow the response to `{ status, jobId }`, dropping `amount` and `metadata` — verified safe against both consumers. Ship as its own commit before or after the split-tender work, not inside it. Separately, as defence-in-depth within the cutover: have `TerminalPayButton` (which already holds `jobId` as a prop) send `&jobId=<id>`, and have the route refuse the record-a-tender branch unless `status.metadata.job_id === jobId`. Leave the `quick_pay` branch alone — it has no job yet by design. Frame this as defence-in-depth rather than an exploitable hole: the branch already requires a genuine succeeded capture and the UNIQUE `stripe_payment_intent_id` dedupes replays. Do not raise either terminal route's auth gate as part of this.

## Residual risks after all amendments

| Risk | Severity | Mitigation |
|---|---|---|
| THE PARK DECISION IS UNRESOLVED. The plan's own header (docs/split-tender-design.md:11-16) marks it parked behind docs/money-layer-design.md, whose §4 `job_totals` view supplies a SQL-visible grand_total and thereby deletes `p_total_cents` — the parameter that A6 (getJobTotalCents), A9 (void signature), A17 (total_stale) and the confirmed defect all exist to service. Applying 30 amendments now means building, reviewing and then deleting roughly a third of them. | Critical | Before any implementation, get an explicit owner decision on ordering. If the money layer ships first, re-scope this plan against `job_totals`: delete p_total_cents from both RPC signatures, delete getJobTotalCents/A6, delete A17 entirely (the view IS the total), and shrink A9 to `void_job_payment(p_payment_id, p_reason)` — i.e. the confirmed defect dissolves rather than being patched. If split-tender ships first, add a line to §2 stating that p_total_cents is a bridge parameter with a named removal ticket, so it is not treated as permanent API. |
| `is_paid` returns TRUE on a job the RPC deliberately left `unpaid`. A17 skips the paid-flip when `p_total_cents < v_subtotal_cents`, but the migration derives `is_paid` arithmetically (`v_paid_cents >= p_total_cents`), which is true in exactly that case. Callers act on `is_paid`: the footer would render Paid, `/api/terminal/status` would report success, and A11's classifier would see no error. Separately, `outcome` is one scalar but A10's 'overcaptured' and A17's 'total_stale' can both hold in a single call, with no precedence defined anywhere in the amendment set. | Critical | Derive `is_paid` from whether the flip actually executed: wrap the `UPDATE jobs` in `GET DIAGNOSTICS v_flipped = ROW_COUNT` and return `v_flipped > 0`, never the comparison. Define outcome precedence explicitly in the migration comment and in §2 — `total_stale` > `overcaptured` > `duplicate_other_job` > `duplicate` > `recorded` — or change the return column to `flags text[]` so a caller can see both. Add two tests to §8 step 2: a `total_stale` call must return `is_paid = false` and leave `jobs.payment_status = 'unpaid'`; a call that is simultaneously stale and over-captured must return a deterministic single outcome. |
| A1 and A18 assign contradictory jobs to `SPLIT_TENDER_ENABLED`. A18 makes the flag select a pre-cutover `update jobs set payment_status='paid'` else-branch inside the Terminal writers so the switch can recover an RPC-side failure; A1 requires the writers deploy to be live, exercised and verified before any UI ships. If the flag gates the writers and defaults OFF as A18 specifies, the RPC path never runs in production during the deploy A1 designed to de-risk it, and the flag flip becomes the untested cutover on the shop's counter reader. | Critical | Split into two server env vars with disjoint jobs. `SPLIT_TENDER_ENABLED` gates ONLY the partial-amount UI (A1 step 4) and defaults OFF — that is A18's DOM-absence requirement and it stays. A separate break-glass `SPLIT_TENDER_LEGACY_WRITER` selects the pre-cutover direct update in `/api/terminal/status` and `handleTerminalPayment`, defaults OFF so the RPC is live and verified from the writers deploy, and is deleted in a follow-up commit after one full week. Write both into §8 step 0 and state which one `/post-deploy-check` should confirm at each stage. |
| A13's warning names a remediation that the tender itself disables. Verified at src/lib/actions/invoices.ts:738-744, `voidInvoiceForJob` returns 'This job is already settled — voiding would delete the record of the bill' when `payment_status === 'paid'`, and A16 keeps `VoidInvoiceButton` gated on `!settled`. In A13 branch (b) the full-balance tender flips the job to `paid` before the warning renders, so the manager is told to void a live, payable Stripe invoice with neither the button nor the server action available. The customer can still pay the link. | Critical | Pick one and write it into A13. Either (i) reword the warning to 'Void this invoice in Stripe — the payment link is still live' and render the `invoices.stripe_invoice_id` deep link in the footer so the manager has a one-click path out of the app; or (ii) add a narrow carve-out to `voidInvoiceForJob`: permit `payment_status = 'paid'` when the job's non-voided `job_payments` sum covers the recomputed total AND the local `invoices.status` is not 'paid', leaving the Stripe-first ordering and the duplicate-rows refusal untouched. Add the case to `void-invoice.test.ts` either way. Do not ship the warning text alone. |
| A11's 'P0002 is permanent' rule is only sound for a BYPASSRLS caller. The RPC raises P0002 from `PERFORM 1 FROM jobs WHERE id = p_job_id FOR UPDATE; IF NOT FOUND`, which under SECURITY INVOKER fires for a row the caller merely cannot SEE, not only for a row that does not exist. Any future move of a caller to a cookie-scoped client (or an RLS change) converts 'captured money, retry later' into 'Sentry + 2xx, money dropped forever'. | High | Make it normative in §2, adjacent to A6's service-role rule so the two are read together: 'Every `record_job_payment` call from `/api/terminal/status`, `handleTerminalPayment` and `handleInvoicePaid` uses `createAdminClient()`. P0002 may be classified PERMANENT only from a service_role client; from any user-scoped client it is TRANSIENT.' Add a comment at the `RAISE ... P0002` site in the migration saying the same thing, since that is where the next reader will be. |
| Direct PostgREST INSERT into `job_payments` stays open. A25 revokes UPDATE and DELETE but cannot revoke INSERT, because `record_job_payment` is SECURITY INVOKER and inserts as the caller. So any holder of a manager JWT can `POST /rest/v1/job_payments` with an arbitrary amount and job_id: no overpayment guard, no dedupe, no flip. It cannot mint a `paid` job, but it silently inflates the ledger that A15's daily summary, A29's receipt tender list and A19's A/R 'collected' line all read. A25's own migration comment ('The RPCs are the only intended mutation path') is not enforced by the grants beneath it. | High | Promote `record_job_payment` to SECURITY DEFINER owned by postgres with `SET search_path = pg_catalog, public, pg_temp` and a first statement `IF auth.uid() IS NOT NULL AND NOT is_manager() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;`, then `REVOKE INSERT ON job_payments FROM anon, authenticated`. §2's stated objection to that gate ('anon and service_role both yield a null auth.uid()') is moot once `REVOKE ALL ON FUNCTION ... FROM public, anon` is in place — anon cannot execute the function at all, so service_role is the only null-uid caller that reaches it. A25 already corrects §2's rationale halfway; finish the correction. If the owner prefers to keep INVOKER, move the exposure into §7 as an accepted limitation rather than leaving it as a comment the grants contradict. |
| A19's stranded-job cron predicate cannot fire correctly. It keys on `j.updated_at < now() - interval '1 hour'`, but the entire design point is that a tender leaves the job row untouched ('Otherwise the job is left EXACTLY as it is'), and `jobs` carries an `update_updated_at` trigger — so `updated_at` is the last EDIT time, not the last tender time. A job edited two hours ago and tendered ten seconds ago alerts immediately at the counter; a job created and tendered in the same minute never alerts until somebody happens to edit it. The monitor A19 exists to provide is inverted. | High | Key the staleness on the tender, not the job: `and (select max(p.created_at) from job_payments p where p.job_id = j.id and p.voided_at is null) < now() - interval '1 hour'`. PostgREST cannot express this — expose it as a read-only `SECURITY DEFINER` RPC (`list_stranded_partial_jobs()`) granted to service_role only, and have the cron route call `.rpc()`. Keep A19's requirement to probe the deployed endpoint after ship; a cron rejected at its auth gate leaves no trace (July 2026 CRON_SECRET). |
| A15's pro-rata allocation over-credits the cash drawer on exactly the stranded job A19 is meant to catch. Verified at reports.ts:576-583: `getDailySummary` buckets a job's full `jobTotal` when `payment_status === 'paid' OR status === 'complete'` — so a complete-but-unpaid job is already counted at full value under 'unrecorded'. Allocating that full `jobTotal` pro rata across non-voided tenders on a job holding one $200 tender against a $386.20 total books $386.20 of cash revenue for $200 that actually arrived. That is the same direction of error (drawer over) that A15 was written to fix. | High | Gate the pro-rata branch on settlement: allocate across tenders only when `job.payment_status === 'paid'`. A job with tenders that is not yet paid keeps its whole `jobTotal` in `unrecorded` (or a distinct `partial` bucket if the owner wants it visible), so no method bucket is ever credited money the shop does not hold. Add the test explicitly: complete + unpaid + one $200 tender on a $386.20 job contributes zero dollars to the cash bucket and leaves `revenueByMethod` summing to `totalRevenue`. |
| A15 removes assistant capability from techs inside a payments PR, contradicting A7's own stated rule. Verified: `/api/ai/chat/route.ts:12-19` gates on `supabase.auth.getUser()` with no role check, so techs use the assistant today and `get_daily_summary` / `get_ar_summary` (handlers.ts:418, and getFleetARSummary) answer for them under RLS scoping. A15 adds `requireManager()` to both. A7 says verbatim that narrowing the assistant 'is a capability change the owner should approve rather than a side effect of this PR' — A15 does exactly that to two tools without raising it. | High | Raise it in §9 as an explicit owner question ('should techs keep the AI daily summary and A/R answers?') rather than deciding it inside the split-tender PR. In the meantime get the fail-closed property without the capability change: throw on a tender-query ERROR (per A32's contract), and when the caller is not a manager omit the 'collected' sub-line and the pro-rata allocation entirely rather than computing a silently wrong net from an RLS-emptied embed. |
| A26's `source` CHECK omits 'invoice' while A1 ships A4's `handleInvoicePaid` tender in the same deploy. A26 defers it with '(or include it there)', which is not a specification. Literal implementation gives two bad outcomes: passing `p_source => 'invoice'` raises 23514 after Stripe collected — and A11 classifies 23514 as PERMANENT, so it is Sentry'd and 2xx'd, the flip never happens, the job sits at `invoiced` in A/R forever with the customer's money taken; or passing nothing defaults to 'manual' on the one caller where `created_by` is guaranteed NULL, which is the exact case the discriminator was added to disambiguate. | High | Put `'invoice'` in the CHECK in the initial migration — `CHECK (source IN ('manual','terminal-status','webhook','invoice'))` — and add a row to A26's caller table: `handleInvoicePaid` passes `p_source: 'invoice'`, no actor. Cost is one enum member; the alternative is a post-capture raise on the first customer who pays a payment link after cutover. More generally, audit the amendment set for other 'add it when X lands' deferrals where A1 puts X in the same deploy. |
| A17's lower-bound invariant holds only by accident of the current enum. `line_item_type` is `enum ('labor','part')` (initial_schema.sql:19) and `calculateTotals` filters to exactly those two types (totals.ts:145-151), so `SUM(job_line_items.total)` is a valid floor today. Adding any future value — `fee`, `sublet`, `discount`, `tire_disposal` — makes the unfiltered SQL sum EXCEED the grand total, so `total_stale` fires on every legitimate tender and jobs silently stop flipping to `paid`. The failure mode is a feature that stops working with no error, triggered by a schema change nobody would connect to split-tender. | Medium | Restrict the check to the types the total actually includes: `SELECT COALESCE(SUM(total),0)*100 INTO v_subtotal_cents FROM job_line_items WHERE job_id = p_job_id AND type IN ('labor','part');` with a comment naming totals.ts:145-151 as the thing it must mirror. Add a vitest asserting `line_item_type` has exactly two members — there is precedent at src/types/line-items-parity.test.ts — so the enum change fails CI rather than silently disarming the flip. |
| A5's server-side cap can reject a legitimate full-balance charge with a bare 400 at the counter. `TerminalPayButton` posts `Math.round(grandTotal * 100)` computed at render (job-payment-footer.tsx:140); the route recomputes from live line items and settings. Any shop-settings change, line-item edit, or simply a tab left open makes the client amount exceed the server remainder, and the operator sees 'amount exceeds the remaining balance' on a job that looks fully unpaid on their screen. | Medium | Return a typed body — `{ error: 'amount_exceeds_balance', balanceCents }` — and have `TerminalPayButton` render 'The job total changed. Refresh and try again — $X due' with the server's figure, never the raw message. Add the stale-settings variant to §8's test list beside the stale-tab case A30 already specifies, and add it to the `/verify-flow` definition A32 extends. |
| With A5 deleting the arm-time PI write and A24 making the RPC the column's only writer, `jobs.stripe_payment_intent_id` is NULL for every split that settles in cash even when a real card capture occurred. A29 records the fact but not the consequence: the only in-app pointer from a job to its Stripe charge is gone for exactly the mixed-tender jobs most likely to need a refund — and refunds are out of scope (A29 item 4), so Stripe is the only remediation path. | Medium | State the consequence in §7 next to A29 item (4), and make §4's tender list render the PaymentIntent id (or its last 8 characters, copy-on-click) for card tenders. That turns reconciliation from a Stripe dashboard search by amount and timestamp into a paste, and it costs one column in a list the plan already builds. Confirmed safe: grep shows `jobs.stripe_payment_intent_id` has exactly one reader, the tech gate at api/receipts/send/route.ts:72, and nothing passes it to `stripe.paymentIntents.retrieve` — so A4's namespaced `inv:` values cannot break a Stripe call. |
| A20's name-based DO block drops EVERY overload of both function names on each apply, and A20 itself notes it must be copied verbatim into every future migration touching them — with nothing enforcing that. A22's verification step checks that the functions exist with expected argument lists but does not assert that no extra overload survived, which is the failure A20 was written to prevent (PostgREST binds `.rpc()` by named argument, so a surviving two-arg `void_job_payment` silently nulls `paid_at` on a fully-paid job). | Medium | Strengthen A22 step (b) to assert exact cardinality: `select proname, count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('record_job_payment','void_job_payment') group by 1;` must return exactly one row per name with count 1, and the runbook must fail if it does not. Add the DO block to the migration checklist in DATABASE_SCHEMA.md rather than relying on a future author remembering a note buried in a design doc's §8. |
| A2's closing rule as written is not satisfied by A2's own table. Five call sites write `jobs.payment_status` that the table omits: `createJob` via `prepareJobData`, dvi.ts:740, estimates.ts:856, appointments.ts:391, and /api/quick-pay/route.ts:42. All are INSERTs of new jobs at 'unpaid' and all are harmless, but a rule stating 'any writer of jobs.payment_status must be listed here with a reason' either produces five false findings on the next audit or teaches the auditor that the rule is decorative. | Low | Narrow the rule to updates: 'Any code that UPDATEs `jobs.payment_status` on an existing row, other than `record_job_payment` / `void_job_payment`, must be listed here with a reason and must never write `paid` without a covering tender. Inserts of new jobs at `unpaid` are out of scope.' One clause, and the rule becomes greppable and true. |
| A9 and the declared DATA-7/COMP-8 reconciliation state opposite rules about NULLing `jobs.payment_method`. The reconciliation forbids a NULL sentinel because receipts/send.ts:126 and webhooks/route.ts:621 do `job.payment_method \|\| 'stripe'`, which would print 'paid via stripe' on a cash customer's receipt; A9 step (5) sets `payment_method = NULL` on the void downgrade. Both are correct in their own scope — the downgraded job is `unpaid` with `paid_at` NULL, and every receipt surface gates on `paid_at` — but the plan never says so, so a future reader reconciling them will pick one and break the other. | Low | Add one sentence to §3 beside A9 step (5): 'NULLing `payment_method` here is safe and is not the DATA-7 sentinel — it applies only on the downgrade to `unpaid`, where `paid_at` is also nulled and no receipt surface can read the column. `payment_method` is never NULL on a job reading `paid`.' Cite receipts/send.ts:126 so the next reader does not have to re-derive it. |

## Gate verdict (verbatim)

**Not bulletproof.** With all 30 amendments applied the plan is dramatically safer than v3-as-written — the money-losing build order, the missed writers, the `chargeCardOnFile` re-bill and the void contract are genuinely closed. But the amendment set introduces four new defects of its own and leaves ten residual risks, three of them Critical. Two of the Criticals are *contradictions between amendments*, which is exactly the class the synthesis was supposed to eliminate.

**The largest issue is above the amendment set entirely.** The plan file's own header (line 11) reads: *"⏸️ Parked 2026-08-10, pending `money-layer-design.md`… Once `job_totals` exists, parts of v3 below delete themselves."* The focus brief calls the status "awaiting review. Nothing built" — that string is on line 47, but line 16 says **"v3 written, parked behind the money layer. Nothing built."** Verified: `docs/money-layer-design.md` §4 (line 118) proposes a `job_totals` view whose `grand_total` column deletes `p_total_cents` outright — and `p_total_cents` is the parameter that A6, A9, A17, A19 and the confirmed void-signature defect all exist to service. Roughly a third of the hardened plan is scaffolding around a missing column that a *different, already-written* design removes. Hardening this plan without first settling the park decision means building, reviewing and then deleting `getJobTotalCents`, the `total_stale` outcome, its forgery surface and the `p_total_cents` argument on both RPCs. **Nothing below matters until the owner says whether split-tender still ships before the money layer.**

**Four new defects the amendments created:**

1. **`is_paid` lies whenever A17 fires.** A17 skips the paid-flip on `total_stale`, but the migration computes `is_paid` arithmetically as `v_paid_cents >= p_total_cents` (migration line ~148) — which is *true* in exactly that case. The RPC returns `is_paid = true` for a job it deliberately left `unpaid`. Compounding it, `outcome` is a single scalar and A10 + A17 can both be satisfied by one call with no precedence defined.
2. **A1 and A18 disagree on what the kill switch gates.** A18's recovery mechanism requires `SPLIT_TENDER_ENABLED` to select a legacy `else` branch inside the Terminal writers; A1 requires the writers deploy to be live and verified before any UI ships. If the flag gates the writers and defaults OFF, the RPC is never exercised in production and flipping the flag *becomes* the untested cutover.
3. **A13 points the operator at a remediation the same action disables.** Verified at `src/lib/actions/invoices.ts:738-744`: `voidInvoiceForJob` refuses when `payment_status === 'paid'`, and A16 keeps `VoidInvoiceButton` on `!settled`. A13(b)'s full-balance tender flips the job to `paid` *before* rendering "void it so the customer isn't billed twice" — both the action and its button are gone by then, on a live payable Stripe invoice.
4. **A26 never assigns a `source` to A4's caller.** A26's CHECK is `('manual','terminal-status','webhook')` and says to add `'invoice'` "when A4 lands" — but A1 lands them in the same deploy. Literal implementation either raises `23514` post-capture inside `handleInvoicePaid` (A11 classes 23514 permanent → 2xx → money collected, job stuck `invoiced`, in A/R forever) or silently labels invoice settlements `'manual'` on the one path where `created_by` is always NULL, defeating the discriminator.

**What I verified as correct:** the confirmed void-signature defect and its A9 fix; A2's six writers (`recordPayment` jobs.ts:490, `updateJob` jobs.ts:184 via `prepareJobData`, `/api/terminal/pay`, `/api/terminal/status:43`, `handleTerminalPayment` webhooks:757, `handleInvoicePaid` webhooks:491); A3's finding that `ChargeCardOnFileButton.amountCents` is display-only and the action bills `totals.grandTotal` server-side; A5's audit of `/api/terminal/pay` (no job load, discarded `{ error }`, unconditional PI stamp); A6's `getShopSettings` null-on-error + `cache()` + cookie client; A14's `setJobChargeSalesTax` gate (`payment_status !== 'unpaid'` only); A15's `getDailySummary` method bucketing at reports.ts:582; A25's `is_manager()` definition and the absence of any explicit table GRANTs; A27's `/api/terminal/status` response leak; A31's citation drift (`handleTerminalPayment` is at :750, not :518). A20's `uuid_generate_v4()` and COALESCE-direction findings are both real in the draft migration.

I did not rubber-stamp any amendment: A15, A17, A19 and A26 each contain a defect, and A11's error classification has a soundness hole (below).

## All surviving findings

| ID | Lens | Severity | Title |
|---|---|---|---|
| COMP-1 | COMP | Critical | §5 calls chargeCardOnFile "unchanged" and safe — it ignores every amount and charges the full recomputed grand total on a half-paid job |
| COMP-2 | COMP | Critical | "The block is pre-capture only" is unimplementable — the only pre-capture hook, /api/terminal/pay, is missing from §5 and has no server-side amount cap |
| CORR-1 | CORR | Critical | §4's "entire double-charge guard" is false for Charge Card on File — the amount prop is display-only |
| CORR-3 | CORR | Critical | §8 build order ships the partial-amount UI (step 3) before the Terminal writers are cut over (step 4) |
| CORR-4 | CORR | Critical | §5 never says how the two service-role writers obtain p_total_cents — the obvious reuse returns null in a webhook and understates the total |
| DATA-1 | DATA | Critical | chargeCardOnFile re-bills the FULL grand total on a half-paid job — §4's "entire double-charge guard" claim is false |
| DATA-3 | DATA | Critical | void_job_payment downgrades to `unpaid` using a ledger that v3 deliberately keeps incomplete — voiding a tender can re-open a job Stripe has already settled |
| DATA-4 | DATA | Critical | §8 build order has a money-losing window: step 3 ships the partial-amount dialog before step 4 cuts over the Terminal writers |
| DATA-5 | DATA | Critical | handleTerminalPayment cannot compute p_total_cents — getShopSettings returns null in every webhook, so §5's prescribed cutover is not implementable as written |
| FIRS-1 | FIRS | Critical | §4's "entire double-charge guard" is cosmetic for Charge Card on File — and §6 omits the guard that path actually needs |
| FIRS-4 | FIRS | Critical | void_job_payment reverts a job to `unpaid` even when it was settled by a paid Stripe invoice — 404s the receipt and drops the job from the DOR export |
| OPER-2 | OPER | Critical | §4's "those two lines are the entire double-charge guard" is false — chargeCardOnFile ignores the amount it is passed and is not in §6's guard list |
| OPER-3 | OPER | Critical | §5's "recordPayment keeps its signature and calls the RPC" cannot serve waived/invoiced/unpaid — the AI tool would mint a phantom full-amount cash tender |
| REG-1 | REG | Critical | §4's "entire double-charge guard" is false: chargeCardOnFile ignores the amount and always charges the full grand total |
| REG-2 | REG | Critical | §2's overpayment block is unreachable on the Terminal path — capture_method is 'automatic', so p_captured is always true for the primary use case |
| SEC-4 | SEC | Critical | §5's "chargeCardOnFile unchanged" is false — it ignores its button's amount and charges the full grand total on a half-paid job; §4's line-133 change makes the confirm dialog lie |
| COMP-3 | COMP | High | §8's build order has a money-losing window: step 3 ships partial amounts before step 4 cuts over the writers that flip a job to paid |
| COMP-4 | COMP | High | A failed tender read renders a full balance and re-arms a full charge — the plan never states the balance must fail closed |
| COMP-5 | COMP | High | §5's writer table omits updateJob — a fifth path that writes payment_status/payment_method wholesale, reachable from the AI assistant |
| COMP-8 | COMP | High | §7's "DOR export behavior unchanged, nothing to ask the accountant" is wrong — the cash drawer, the DOR CSV and the job CSV all book a split's whole total under one method |
| COMP-9 | COMP | High | §5's "recordPayment keeps its signature" cannot hold — the RPC has no waived / invoiced / un-mark semantics |
| CORR-7 | CORR | High | Void has no restriction on Stripe-backed tenders — it un-pays a job whose money Stripe still holds |
| CORR-8 | CORR | High | With p_captured=true the RPC never rejects, and /api/terminal/pay has no server-side cap — the only bound on a Terminal charge becomes a client dialog |
| CORR-9 | CORR | High | recordPayment cannot "keep its signature" and route to the RPC — the AI tool passes unpaid/invoiced/waived |
| DATA-2 | DATA | High | handleInvoicePaid is not safely "unchanged": a tender on an `invoiced` job plus the customer paying the live Stripe link over-collects with no ledger record |
| DATA-7 | DATA | High | Per-method revenue attribution breaks on every split — the daily summary the cash drawer is counted against, plus the CSV and DOR exports |
| FIRS-2 | FIRS | High | A partial tender on an `invoiced` job leaves a live full-amount Stripe payment link — no guard in §6 covers the invoice-first ordering |
| FIRS-3 | FIRS | High | §8 build order has a money-losing window: step 3 ships the balance-aware footer before step 4 cuts the Stripe writers over |
| FIRS-5 | FIRS | High | "DOR behavior unchanged" and "revenue numbers won't shift" are false for payment-method attribution — the feature regresses cash-drawer reconciliation versus today's workaround |
| FIRS-7 | FIRS | High | §5's "recordPayment keeps its signature" collides with its third parameter — routing waive/unpaid/invoiced through the RPC mints a false tender |
| FIRS-8 | FIRS | High | §5 never states that the Stripe writers pass p_captured=true, and a RAISE inside the webhook becomes a three-day Stripe retry loop |
| OPER-1 | OPER | High | §8 build order puts partial amounts in the UI one step before the writers that respect them — a live money-loss window |
| OPER-5 | OPER | High | §5 tells the two Stripe writers to "call the RPC" but never says they pass p_captured, and never says what the webhook does when the RPC errors |
| OPER-6 | OPER | High | No kill switch and no stated rollback for a cutover that replaces the only path that records Terminal payments |
| OPER-8 | OPER | High | §7's "invisible for 60 seconds" is wrong for three surfaces where a split leaves permanent damage — including the daily cash-drawer close |
| REG-3 | REG | High | §8's build order has a window where captured Terminal money never enters the ledger and half-paid jobs get re-billed the full total |
| REG-4 | REG | High | §5 tells handleTerminalPayment to call the RPC but never says how the webhook computes p_total_cents, or that it must fail closed |
| REG-5 | REG | High | §5's "recordPayment keeps its signature" is not implementable — its third parameter is a full PaymentStatus the RPC cannot express |
| REG-8 | REG | High | §6's guards are one-directional: nothing stops a tender on a job that already has an open invoice, so the customer can pay twice |
| REG-9 | REG | High | §7's acceptance list omits the DOR tax export: a stranded half-paid job's collected cash is invisible to the filing, and a completed split reports one method for both tenders |
| SEC-6 | SEC | High | The overpayment guard is dead on every card path: `p_captured` disables it and `/api/terminal/pay` has no server-side amount cap |
| SEC-9 | SEC | High | §6's guard list is one-directional — nothing stops a tender being recorded against a job that already has a live Stripe invoice, and §5 leaves `handleInvoicePaid` unchanged |
| COMP-10 | COMP | Medium | Receipt surfaces were dropped between v1 and v3 with no replacement and no entry in §7's accepted list |
| COMP-12 | COMP | Medium | No surface anywhere lists a job with stranded tenders — the only place a partial payment is visible is that one job's footer |
| COMP-14 | COMP | Medium | voidInvoiceForJob and the invoice.voided webhook branch — shipped after the plan was written — are absent from §6 |
| COMP-6 | COMP | Medium | Keeping a half-paid job at 'unpaid' disarms the sales-tax lock — the total becomes editable exactly while a split is in flight |
| COMP-7 | COMP | Medium | Nothing recomputes "is it paid" when the total moves, and nothing stops the total moving — a job can become permanently unsettleable |
| CORR-11 | CORR | Medium | A split misattributes the whole job to one payment method in the daily cash-drawer report and the tax-audit CSV — the decisions table claims this is "Gone" |
| CORR-14 | CORR | Medium | The receipt still renders a single payment-method line for a split, and v3 dropped it without listing it in §7 |
| CORR-5 | CORR | Medium | §6's re-bill guard is one-directional — an already-sent Stripe invoice plus a counter tender double-collects |
| CORR-6 | CORR | Medium | void_job_payment's success branch can promote a waived or invoiced job to 'paid' |
| DATA-10 | DATA | Medium | §8 never builds voiding, and §3 never says who computes p_total_cents for it |
| DATA-6 | DATA | Medium | p_total_cents has no server-side invariant, and v3's grounds for dropping Decision C are falsified by the DVI page's admin-client line-item write |
| DATA-8 | DATA | Medium | §5's write-path table omits /api/terminal/pay, a third writer of jobs, and the receipt-send authorization gate that reads the column it writes |
| FIRS-12 | FIRS | Medium | "Transient" is the load-bearing assumption and nothing detects when it fails |
| FIRS-13 | FIRS | Medium | p_captured is doing work that a server-side amount cap in /api/terminal/pay should do — the overcapture path is over-engineered relative to the unguarded input |
| FIRS-6 | FIRS | Medium | Receipts are absent from v3 entirely — the split job's receipt will state one method and one amount |
| FIRS-9 | FIRS | Medium | §6 guards only the server actions; the UI still renders "Create & Send Invoice" for the full total on a half-paid job |
| OPER-10 | OPER | Medium | The invoice-then-tender direction is unguarded: the RPC overwrites 'invoiced' → 'paid', which then makes voidInvoiceForJob refuse and strands a live payable Stripe invoice |
| OPER-4 | OPER | Medium | §2 prescribes a Sentry over-capture alert the RPC's return contract cannot signal, and it is the plan's only monitoring |
| OPER-7 | OPER | Medium | The migration is a hand-run one-time step against the only Supabase project — which is production — and §8 names no owner, no ordering against the Vercel deploy, and no verification |
| REG-10 | REG | Medium | Receipts are absent from v3 entirely, and the tech receipt-send gate keys on a column /api/terminal/pay overwrites per tender |
| REG-11 | REG | Medium | §2 cites chargeCardOnFile's totals pattern but omits its fail-closed guard, so a shop_settings read failure silently marks jobs paid below the real bill |
| REG-6 | REG | Medium | §5's writer table is incomplete — three more payment_status writers exist, one of them shipped after v3 was written |
| REG-7 | REG | Medium | Both RPCs clobber 'invoiced' and 'waived', and the void path writes 'unpaid' over a job with a live Stripe invoice — disarming the cancel/delete guards |
| COMP-11 | COMP | Low | §6's invoice guard leaves a half-paid job unbillable, with no escape stated |
| COMP-13 | COMP | Low | Draft migration: void_job_payment's forward flip has no status predicate, and the dedupe lookup isn't scoped to the job |
| CORR-13 | CORR | Low | jobs.stripe_payment_intent_id has no defined meaning under split, and /api/terminal/pay overwrites it on every arm while discarding the error |
| CORR-15 | CORR | Low | §5's line citation for handleTerminalPayment points inside handleInvoicePaid — the function §5 says is unchanged |
| DATA-11 | DATA | Low | The dedupe lookup is not scoped to the job, so a PI belonging to another job returns 'duplicate' and the payment is silently never recorded |
| DATA-12 | DATA | Low | void_job_payment leaves payment_method and stripe_payment_intent_id set on a job it reverts to `unpaid`, and nulls paid_at out of an already-filed tax period |
| DATA-13 | DATA | Low | ON DELETE RESTRICT plus §6's "any row, voided or not" makes a job permanently undeletable with no escape hatch |
| FIRS-14 | FIRS | Low | §1's "Financials: managers only" is inaccurate about writes — the tender-creation path is reachable by techs through a requireStaff route |
| FIRS-15 | FIRS | Low | §5 and §8 cite line numbers that are already wrong, and §8's step 6 contradicts its own ordering |
| OPER-11 | OPER | Low | Plan and draft migration have already diverged on RPC signatures, and CREATE OR REPLACE will silently create an overload rather than replace |
| OPER-9 | OPER | Low | §8's acceptance step ("a real counter split") has no protocol, and §6's own guard makes the test job permanently undeletable |
| REG-12 | REG | Low | Draft migration defects beyond the known void-signature drift: unscoped PI dedupe and an unconditional jobs.stripe_payment_intent_id write against a unique index |
| REG-13 | REG | Low | Three of the plan's file:line citations are stale, including the one for the writer it calls out as most dangerous |
| SEC-10 | SEC | Low | `created_by` is always NULL on card tenders, so the ledger cannot attribute exactly the payments most likely to be disputed |
| SEC-11 | SEC | Low | v3 makes `is_manager()` — a SECURITY DEFINER function with no `SET search_path` — the sole gate on a money table, and adds `pg_temp` to the new functions' search path |
| SEC-3 | SEC | Low | The RPCs are not the only write path — `FOR ALL` plus Supabase's default table grants leave the money ledger directly PATCH/DELETE-able via PostgREST |
| SEC-5 | SEC | Low | §5 turns `/api/terminal/status` into a tech-reachable, BYPASSRLS ledger writer keyed on an attacker-supplied PaymentIntent id |
| SEC-8 | SEC | Low | The dedupe SELECT is not job-scoped, so a PaymentIntent belonging to another job returns `outcome='duplicate'` — a success shape — while the passed job can still be flipped to paid |

Refuted on verification and therefore NOT actionable: p_total_cents is a forgeable authority parameter on a PostgREST-exposed RPC granted to `authenticated`; Money arithmetic is computed from RLS-filtered SELECTs, so a permission denial returns a wrong balance instead of an error; §7 defers the tech `jobs` UPDATE hole, but v3 promotes it from nuisance to money-loss vector by creating a second, tech-writable authority; Migration has no rollback path and CREATE OR REPLACE on a changed signature leaves an orphaned overload with default PUBLIC EXECUTE; Managers-only RLS on job_payments plus staff-reachable Terminal Pay = a tech sees balance = full total and charges it; The dedupe lookup is not scoped to the job, so a PI recorded against another job returns 'duplicate' and silently swallows the payment; The RPC gives the caller no signal that an over-capture happened, but §2 makes the caller responsible for reporting it; /api/terminal/pay overwrites jobs.stripe_payment_intent_id on every arm, breaking the tech receipt route after a two-card split; "p_total_cents is computed server-side, never accepted from the client" is false at the PostgREST boundary; The p_total_cents defect is structural, not a missing parameter: record-time and void-time totals are computed independently and can disagree.
