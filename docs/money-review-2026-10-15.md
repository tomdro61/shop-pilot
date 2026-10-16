# Money & Accounting Review — 2026-10-15

> **Status (same day):** C-1, C-2, C-3 (record + alert), C-4, H-1 (snapshot + money-field lock),
> H-3, H-4, H-5, H-6, H-8, M-1, M-7, M-8, M-10 (unique index), M-11, M-18, the CSV
> formula-injection item and the paid-without-paid_at CHECK shipped to `staging` in Session 85 (see
> PROGRESS.md). Live-data sizes from the probe are in §7a. Still open: H-2 (zero waived jobs exist,
> so deferred), H-7 (Quick Pay parts), M-2 (page vs export labels), M-3 (fees are disabled), M-4/M-5
> (prior-period display — the math is fixed, the UI still hides the comparison), M-6, M-9, M-12,
> M-13, M-14, M-15, M-16, M-17, M-19, M-20, and netting `refunded_amount` out of revenue.

**Scope:** every surface that produces a revenue, profit, tax, payment, or A/R figure, plus the
database layer under them. Four Opus reviewers (reporting math, payment lifecycle, tax/exports/A-R,
database) read the code in parallel; every Critical and High below was re-verified by hand against
the code before it was listed. Live-database checks were **not** run (see §7).

**Verdict in one line:** the arithmetic is sound and the 1000-row cap is handled everywhere it
matters, but money state is not *locked* once collected, so revenue, tax, and payment records can
drift after the fact, and three concrete paths can lose or double-count real payments.

The structural fix for most of §2–§3 is already designed: `docs/money-layer-design.md`
(Decision 2, "freeze totals and lock inputs at payment"). Nothing from it is built.

---

## 1. How revenue is defined today (so the findings make sense)

| Figure | Definition | Where |
|---|---|---|
| Revenue | Σ `job_line_items.total` on `status='complete'` jobs, bucketed by `date_finished`, **excluding** inspection-category lines, **plus** `daily_inspection_counts × $35/$15`, **plus** `manual_income.amount` | `reports.ts:68-480`, dashboard, trends, CSV |
| Gross profit | Revenue − parts cost, where cost = `cost × qty` if set, else 60% of the part's price | same |
| Sales tax | Paid jobs by `paid_at` (cash basis): Σ taxable parts × **current** `shop_settings.tax_rate` | `reports.ts:640-803`, tax-audit CSV |
| A/R | Σ line items (no tax, no fees) on complete jobs not paid/waived | `receivables.ts` |

Inclusion rules are consistent across surfaces (verified: dashboard, revenue, trends, tech, service
mix, customers, CSV all use `complete` + `date_finished` + the same inspection exclusion). The
problems are in what those definitions leave out and in what can change after the fact.

---

## 2. Critical — real money can be lost or double-collected

### C-1. A customer can be charged twice, and the second charge erases the first
- `src/lib/actions/jobs.ts:600-645` (`recordPayment`), `src/app/api/terminal/pay/route.ts`,
  `src/app/api/stripe/webhooks/route.ts:488-495`, `src/components/dashboard/invoice-section.tsx:326`
- Marking a job paid by cash/check/ACH/terminal never voids the open Stripe invoice. The Void button
  is hidden once the job is settled. The old SMS link stays payable. When the customer taps it,
  `handleInvoicePaid` updates the job with only `.eq("id")`, overwriting `payment_method` cash→stripe
  and `paid_at`, and sends a normal receipt. Nothing flags the duplicate. The cash payment vanishes
  from the record and the tax export moves the job to the later date.
- **Fix:** void the open Stripe invoice (or refuse) in `recordPayment` and the terminal routes; in
  `handleInvoicePaid`, refuse to overwrite a job already `paid` with a non-stripe method and raise a
  Sentry error + owner SMS ("possible double payment, refund in Stripe").

### C-2. An invoiced job can be deleted; the customer's later payment lands nowhere
- `src/lib/actions/jobs.ts:436-494` (`cancelJob`, `deleteJob`), `src/lib/actions/invoices.ts:217-245`,
  `supabase/migrations/20250101000000_initial_schema.sql:134` (`invoices.job_id ON DELETE CASCADE`)
- Both guards check `payment_status === 'invoiced'`, but **nothing in the app ever writes
  `invoiced`** — `createInvoiceFromJob` and `chargeCardOnFile` leave the job `unpaid`; only the AI
  tools can set it. Comments at `invoices.ts:888` and `webhooks/route.ts:231` assume the guard works.
  So: invoice sent → Delete job → `invoices` row cascades away → customer pays link → webhook finds
  no local row, logs a warning, returns. Money is in Stripe and on no job, report, or receipt.
- Also: a `complete` + `unpaid`/`waived` job can be hard-deleted, taking already-reported revenue
  with it.
- **Fix:** `deleteJob`/`cancelJob` refuse when any `invoices` row exists (same check
  `setJobChargeSalesTax` already does at `jobs.ts:313-319`); change the FK to `ON DELETE RESTRICT`;
  refuse deleting `complete` jobs.

### C-3. Refunds and chargebacks never reach the app
- `webhooks/route.ts:45-83` handles only `invoice.paid`, `invoice.voided`, `payment_intent.succeeded`.
  No handler for `charge.refunded`, `charge.dispute.*`, `invoice.payment_failed`,
  `invoice.marked_uncollectible`. `markJobUnpaid` refuses Stripe/terminal-paid jobs and says "refund
  it in Stripe instead", which leads straight into the gap.
- A refunded $1,450 brake job stays `paid`, in revenue, in the CSV, and in the DOR tax export forever.
- **Fix:** handle `charge.refunded` and `charge.dispute.*`; store `refunded_amount`/`refunded_at`
  (or a payments ledger) and net it out of revenue and tax by refund date.

### C-4. A database blip during `invoice.paid` loses the payment permanently
- `webhooks/route.ts:45-48, 261-271, 289, 497-509`
- The route returns 200 whether or not `handleInvoicePaid` succeeded, so Stripe never redelivers.
  The invoice row is flipped to `paid` *before* the job flip; if the job update fails, even a manual
  redelivery hits the idempotency guard at line 289 and exits early. Result: invoice reads paid, job
  reads unpaid, shows on A/R with Terminal/Mark-as-Paid buttons, and staff collect a second time.
  (`invoice.voided` already returns 500 on failure; `invoice.paid` does not.)
- **Fix:** return non-2xx when the lookup or job flip fails; or flip both rows in one RPC transaction;
  or on redelivery, re-attempt the job flip when the invoice row is paid but the job is not.

---

## 3. High — figures the owner acts on are wrong or can change after the fact

### H-1. Nothing stores what was actually collected; tax and revenue are recomputed from live data
- `reports.ts:718,774`, `tax-audit/export/route.ts:107,227`, `job-line-items.ts:9-72`,
  `receipt/[token]/page.tsx:89`, `receipts/send.ts:113`
- No `tax_rate_applied`, `tax_amount`, or `amount_collected` on jobs; cash/check/terminal write no
  `invoices` row at all. Line items stay editable after payment (only the tax toggle is locked). So:
  - Change `tax_rate` in Settings (or via the AI `update_shop_settings` tool, validator accepts 0–1)
    and every past month's filed tax figure changes on screen.
  - Edit a paid job's $200 part to $180 in November and October's revenue, profit, CSV, DOR export
    and the customer's public receipt all change.
  - Delete the line items on a Quick Pay job and $X of collected money becomes $0 revenue.
- **Fix:** this is exactly money-layer-design Decision 2. Snapshot `taxable_amount`, `tax_amount`,
  `tax_rate_applied`, fees, and `amount_collected` at payment; lock line-item create/update/delete
  server-side once an invoice exists or the job is paid/waived (require Mark-as-Unpaid or Void
  first); DB trigger as backstop. Tax reports sum stored columns.

### H-2. Waived (comped) jobs count as full revenue and full profit
- `reports.ts:93,112`, `trends.ts:157`, `tech-trends.ts:74`, `category-trends.ts:122`,
  `customer-insights.ts:160`, `dashboard/page.tsx:129`, `export/route.ts:116` — all filter
  `status='complete'` only. A/R correctly excludes waived, so the app says "not owed" but "earned".
- A comped $600 warranty redo adds $600 revenue and ~$600 profit with $0 collected. Also breaks the
  ACCOUNTING.md bridge: revenue report ≠ tax page population (tax page uses paid only).
- **Fix (owner decision):** exclude `waived` from revenue, or show it as a "Comped" contra line so
  the headline is net.

### H-3. Completion dates move, silently restating closed months
- `jobs.ts:236-262` (`updateJobStatus`): every move to `complete` stamps `date_finished = today`;
  every move off nulls it; no paid/invoiced guard. `updateJobFields` lets the date editor clear it
  (`jobs.ts:276-286,341`). No DB rule ties `status='complete'` to `date_finished IS NOT NULL`.
- Reopen a Sep 28 paid job on Oct 3 to add a part → September drops $1,200, October gains it; while
  reopened, a paid job is in no revenue figure at all. A `complete` job with null `date_finished` is
  invisible to every report.
- **Fix:** keep the original `date_finished` when re-completing; refuse moving a paid/invoiced job off
  `complete`; migration `CHECK (status <> 'complete' OR date_finished IS NOT NULL)` after backfill.

### H-4. Techs can PATCH any column on their assigned jobs
- `supabase/migrations/20250101000001_rls_policies.sql:92-96` (`techs_update_assigned_jobs`):
  `FOR UPDATE USING (...)` with no column restriction and no `WITH CHECK`, never revised.
- With the browser anon key + their JWT a tech can set `payment_status='paid'`, `paid_at`,
  `charge_sales_tax`, `date_finished=null`, bypassing every `requireManager` gate. Already logged as
  R7 in `docs/split-tender-design.md:516`, still open.
- **Fix:** `REVOKE UPDATE ON jobs FROM authenticated; GRANT UPDATE (status, notes) ON jobs TO
  authenticated;` or route tech status changes through a manager-checked action.

### H-5. A/R understates what is owed, and three A/R figures disagree
- `receivables.ts:94-97,143,154-158`, `reports.ts:518-526` (`getFleetARSummary`)
- A/R = line items only: no sales tax, no fees, no Stripe partial-payment awareness. A $400-parts +
  $300-labor unpaid job owes $725; A/R says $700. Inspection lines are excluded, so an unpaid fleet
  job of only inspections has amount 0 and is **invisible** on the page. The page skips walk-ins; the
  dashboard summary does not; the AI's fleet A/R includes inspection lines. Three numbers.
- **Fix:** one shared function; amount = `calculateTotals(items, settings, charge_sales_tax)` or the
  stored invoice amount; don't exclude inspection lines from A/R.

### H-6. Terminal flow can say "canceled" for a charge that succeeded, and the webhook backstop has no guard
- `terminal-pay-button.tsx:95-112` (`handleCancel` ignores `res.ok`; Quick Pay's
  `reconcileAfterFailedCancel` handles this correctly, the job button does not),
  `api/terminal/pay/route.ts:16-38` (no job-exists / complete / unpaid / open-invoice check; amount
  comes from the client; any staff role, techs included; update error unchecked),
  `webhooks/route.ts:750-773` (`handleTerminalPayment`: no `.neq("payment_status","paid")`, returns
  200 on error so no retry, zero-row update unreported).
- Customer taps as staff hit Cancel → cancel 500s → UI shows "Payment canceled" → staff tap Collect
  again → second PaymentIntent, second charge; webhook overwrites `stripe_payment_intent_id`.
- **Fix:** copy Quick Pay's failed-cancel reconcile; compute the amount server-side; refuse paid/
  waived/open-invoice jobs; webhook returns 500 on error, guards `.neq paid`, alerts on zero rows.

### H-7. Quick Pay records parts as labor with no tax, and mixed sales double-count inspections
- `quick-pay/page.tsx:17`, `quick-pay-form.tsx:505-513`, migration
  `20260714000000_quick_pay_deferred_creation.sql:51,66-74`
- Any preset is selectable. The RPC writes one `labor` line for the whole amount with
  `charge_sales_tax=false`. A $25 wiper-blade preset collects no MA tax and shows as non-taxable
  labor. When presets don't share a category the line gets `category NULL`, so a State Inspection +
  bulb sale counts $55 as job revenue **and** $35 again when the daily inspection count is typed.
- **Fix:** RPC takes an array of items (type, category, qty, unit_cost per preset); compute
  `calculateTotals().grandTotal` for the charge; or block part presets in Quick Pay.

### H-8. Inspection-only Quick Pay jobs inflate job counts and halve ARO
- `reports.ts:171,323`, `trends.ts:112,210`, `tech-trends.ts:104`, dashboard closed-today/week/month
- Each inspection Quick Pay is a `complete` job whose only line is excluded from revenue, but it still
  counts in `jobsCurrent` and the ARO denominator. 150 repairs at $40k + 120 inspections → ARO shows
  $148 instead of $267 and "Jobs Completed" shows 270. (`category-trends.ts:194` already excludes
  them; the others don't.)
- **Fix:** exclude jobs whose non-inspection revenue is $0 from job counts and ARO denominators.

---

## 4. Medium

- **M-1. CSV revenue export ≠ screen.** `api/reports/export/route.ts:87-90,365-367` never reads
  `manual_income` and ignores the `customerType` the toolbar sends (`reports-toolbar.tsx:81-83`).
  "Fleet" filter → CSV contains every retail job plus all inspections.
- **M-2. Tax page vs tax-audit CSV disagree by rounding and labels.** Page rounds once per month
  (`Σparts × rate`, `reports.ts:774`); export and the actual bills round per job. Page "Total
  Revenue" is pre-tax, export "Total Revenue" includes tax. Neither says it's cash-basis on screen.
- **M-3. Shop supplies / hazmat fees are billed but appear in no revenue, A/R, or tax figure.**
  `calculateTotals` and `create-invoice.ts:89-107` bill them; they are never written anywhere.
  ARCHITECTURE.md:165 says supplies are taxable; `totals.ts:177-181` taxes parts only. Only matters
  if fees are enabled in `shop_settings` (unverified — see §7).
- **M-4. Prior-period math is inconsistent and never shown.** `revenueCurrent` = jobs + manual
  income (`reports.ts:172,422`); `revenuePrior` = jobs + inspections + manual (`:454,456`).
  `avgTicket` is computed before manual income is added; `avgTicketPrior` after. The AI
  `get_report_data` tool sees "revenue down 20%" on identical periods. The report pages never pass
  `changeLabel` to `KpiCard`, so the UI computes prior periods and discards them.
- **M-5. Trends Explorer headline ARO** divides revenue-incl-inspections-and-manual by job count
  (`trends-explorer.tsx:136-139`) while each bucket uses job revenue only.
- **M-6. "Gross profit" is parts-adjusted margin with undisclosed estimates.** Only the Revenue page
  discloses the 60% fallback; Overview, Trends, Service Mix, Tech Scoreboard show blended profit with
  no coverage chip. Labor has no cost model; card fees aren't deducted.
- **M-7. `updateJob` (AI `update_job`/`create_job`) bypasses invariants.** Writes
  `payment_status='paid'` with no `paid_at` (`validators/job.ts`, `ai/handlers.ts:204-254`); accepts
  `status='cancelled'`, skipping `cancelJob`'s guards → paid + cancelled jobs, excluded from revenue,
  included in the tax export.
- **M-8. AI line-item updates wipe `cost`, `category`, `part_number`** (`ai/handlers.ts:302-315`
  sends nulls into `prepareLineItemData`). "Change qty to 2" → cost nulled → profit silently falls to
  the 60% estimate.
- **M-9. `convertEstimateToJob` drops `charge_sales_tax`** (`estimates.ts:1026-1030,1079-1090`): a
  tax-off estimate approved at $X converts to a tax-on job and bills more than approved.
- **M-10. `invoices.job_id` not unique; invoice creation is check-then-insert.** Double submit (two
  tabs, AI + UI) → two Stripe invoices, two links; every later `maybeSingle()` errors on 2 rows.
  `createInvoiceFromJob` also leaves an open Stripe invoice if the local insert fails (card-on-file
  voids; this doesn't) and has no `grandTotal > 0` check.
- **M-11. Manual income:** `parseFloat(shopKeepPct) || 100` turns an entered 0% into 100%
  (`manual-income-page.tsx:82`); no server/DB validation on amount, pct range, date; income page
  total sums a `.limit(500)` list; `getManualIncomeForRange` has no count guard; new-entry date
  defaults to UTC.
- **M-12. Estimate close rate overstated:** denominator is `sent + approved`, declined drop out
  (`reports.ts:133`); `sent_at` timestamptz compared to bare dates (UTC midnight, excludes today).
- **M-13. Card on file can't be retried for 24h after a decline:** fixed idempotency keys
  `charge-cof-${jobId}-create/-pay` (`charge-card-on-file.ts:160,177,237`) replay the cached decline.
- **M-14. Parking money is commingled in the shop's Stripe account** (same `STRIPE_SECRET_KEY`),
  contradicting ACCOUNTING.md "separate bank, separate books"; `/invoices` header total mixes both
  and has no row-cap guard.
- **M-15. DVI-approved items always insert as `labor`** (`dvi.ts:782-789`), so recommended parts
  collect no sales tax; prices come from a column any authenticated user can write.
- **M-16. Receipts recompute totals from live line items + current fee settings** (`receipts/send.ts:113`,
  `receipt/[token]/page.tsx:89`) with no "equals collected amount" guard (the webhook has one).
- **M-17. Repo migrations don't reproduce production:** `customers.stripe_customer_id`,
  `invoices.stripe_hosted_invoice_url`, `estimates.approval_token`, `vehicles.license_plate` exist in
  types and docs but in no migration. Run `supabase db diff` and commit a catch-up.
- **M-18. Deprecated `/api/quick-pay/route.ts` still live** past its own delete-after date; any staff
  member can create a complete/unpaid job at any amount via the admin client.
- **M-19. `paid_at` is processing time, not payment time.** Webhook ignores
  `status_transitions.paid_at`; a 3-day redelivery re-dates a payment into the next month;
  `recordPayment` can't backdate a Friday check recorded Monday.
- **M-20. "Mark as Paid → Card"** writes `payment_method:'stripe'` (`job-payment-footer.tsx:26`),
  indistinguishable from a real Stripe payment in any by-method tally.

## 5. Low

- `record_quick_pay_job`'s `REVOKE ... FROM public` probably leaves Supabase's default `anon`/
  `authenticated` EXECUTE grants in place. Verify with `has_function_privilege`. Limited impact
  (SECURITY INVOKER + RLS).
- `is_manager()`, `get_user_role()`, `append_service_completed` have no pinned `search_path`.
- Stripe line amounts can differ from DB `total` by a cent on fractional quantities
  (`create-invoice.ts:79` rounds `q×u×100` in float; DB rounds `q×u` to 2dp). Use `Math.round(li.total*100)`.
- No CHECK constraints on `quantity>0`, `unit_cost>=0`, `cost>=0`, `shop_keep_pct 0–100`,
  inspection counts ≥0, `shop_supplies_rate<=1`. `catalog.ts:325`, `presets.ts:132` pass unvalidated
  quantity/unit_cost.
- Techs can read wholesale `cost` on assigned jobs and all `manual_income`; `job_presets` and
  `catalog_items` are writable by any authenticated user.
- `updateLineItem` accepts `job_id` from the client (moves a line to another job).
- `linkQuickPayToCustomer` doesn't verify the job is a walk-in or that the customer exists.
- `getInvoicesForParkingReservation` returns `[]` on error (`invoices.ts:998`).
- Reports overview / trends / tech / service-mix / customers pages default the year/month from
  server UTC (`reports/page.tsx:21,42-44`): after ~8pm ET on month-end the 6-month chart moves to an
  empty next month.
- AI `getDailySummary` omits inspections and manual income and counts paid-but-not-complete jobs
  received today, so it disagrees with the dashboard.
- Customer detail "lifetime spend" sums cancelled/open/waived jobs and inspection lines, no row guard.
- Customer Insights `avgTicket` includes manual income; `jobCount` doesn't.
- Per-category ARO: revenue is per line-item category, job count per primary category.
- The `Inspection` category exclusion is broad: a pre-purchase inspection billed under
  "Inspection" drops out of revenue entirely (daily counts cover only state/TNC).
- Inspection rates ($35/$15/$11.50) are constants with no history; changing them re-prices every
  past period.
- No period lock: Mark-as-Unpaid + re-pay moves a June job's tax into August after Q2 is filed.
- `estimates.tax_rate` is written and never read. `estimates.estimate_number` has no unique constraint.
- Dead code: `RevenueSparklineCard` never imported; `toDateStr` in `reports.ts:13` unused.
- Missing indexes: no composite `jobs(status, date_finished)`, nothing on `jobs(paid_at)` or
  `jobs(payment_status)` (tax report filters). Slow, not wrong.
- DATABASE_SCHEMA.md drift: `jobs` omits `paid_at` and `cancelled`; no `manual_income` or
  `daily_inspection_counts` sections; `payment_status` flow implies invoicing sets `invoiced`.
- Tests: no coverage for `handleTerminalPayment`, the Quick Pay webhook branch, terminal
  pay/status/cancel routes, signature rejection, `TerminalPayButton` cancel. `jobs.test.ts:105,146`
  test the `invoiced` guard with a state no UI path produces.

---

## 6. What is solid (verified)

- All money columns are `numeric(10,2)` or finer; no floats. `job_line_items.total` is a DB-generated
  column, so no app path can write a stale total.
- Every summed job read pages with `fetchAllRows` + `count:"exact"` + `.order("id")`; inspection and
  manual-income reads on the report paths use `assertComplete`; estimate counts use head queries.
  `fetchAllRows` fails closed.
- `date_finished` is written as an ET date everywhere (`todayET`, RPC `AT TIME ZONE`), and all
  filters compare date strings. No month-boundary timezone bug on revenue surfaces. Week/month prior
  periods are equal length; dashboard and reports share `resolveDateRange`.
- Trend buckets sum exactly to the report headline (same filters, same 60% rule).
- Webhook signature is verified on the raw body; `invoice.paid` is idempotent; `invoice.voided`
  returns 500 on failure, refuses to delete paid rows, keeps parking rows.
- `voidInvoiceForJob` checks Stripe state first, refuses duplicates, uses `.select()` on delete.
  `markJobUnpaid` refuses terminal, paid-invoice, and live-PI jobs, and flips only when `paid_at`
  matches. `recordPayment` is an atomic `.neq("payment_status","paid")` flip.
- `record_quick_pay_job` is atomic, idempotent on a non-partial unique index, converts cents
  exactly, stamps ET dates, pins `search_path`.
- `chargeCardOnFile` inserts the local row before `pay()`, voids on insert failure, rolls back only on
  a definite `StripeCardError`.
- Tax report and export use `payment_status='paid'` by `paid_at` in ET (cash basis, correct for DOR),
  handle tax-off jobs correctly (in revenue, out of taxable base), never tax labor/fees/inspections/
  manual income, and refuse to render on a missing settings row rather than guessing 6.25%.
- Both export routes gate on `requireManager()` and return JSON 500 rather than a `$0.00` CSV on
  failure. Receivables throws on a failed read (the old $0-on-error bug is fixed).
- RLS: invoices, estimates, estimate_line_items, shop_settings writes, daily_inspection_counts
  writes, manual_income writes are manager-only. No client component imports the admin client.

---

## 7. Not verified — needs the live database

Code review cannot see drift that already exists in the rows. A read-only probe script is at
`C:\Users\tomjd\AppData\Local\Temp\claude\C--Projects-broadway-motors-shop-pilot\34061084-84b1-4b79-a3f5-36f640d1221f\scratchpad\integrity.mjs`
(uses the service-role key from `.env.local`, reads only, pages all tables). It was blocked by the
session's permission policy. Run it from the shop-pilot folder with:

```
node "C:\Users\tomjd\AppData\Local\Temp\claude\C--Projects-broadway-motors-shop-pilot\34061084-84b1-4b79-a3f5-36f640d1221f\scratchpad\integrity.mjs"
```

It reports, among other things: complete jobs with null `date_finished` (invisible revenue), jobs
with >1 invoice row, paid jobs whose Stripe invoice row is still `sent` (C-1 exposure), waived
revenue per month (H-2 size), parts cost coverage per year (M-6 size), whether fees are enabled
(M-3 relevance), invoice amounts that no longer match current line items (H-1 size), and the A/R
total vs the page.

Also worth confirming in SQL:

```sql
select has_function_privilege('authenticated','record_quick_pay_job(text,bigint,text,text)','execute');
select column_name, is_generated from information_schema.columns
 where table_name='job_line_items' and column_name='total';
```

---

## 7a. What the live data showed (probe run 2026-10-15, after the owner approved it)

| Finding | Size in production |
|---|---|
| C-1 open Stripe invoices on jobs already paid another way | **106 rows, $66,400** of payable links (56 terminal, 20 cash, 7 check, 23 "stripe") |
| H-1 paid jobs whose line items no longer match the invoice | 9 jobs (e.g. RO 2059 invoiced $375, job now $928) |
| H-8 inspection-only jobs in the ARO denominator | Sep 2026: 236 jobs, 109 with revenue; ARO shown $177, real $383 |
| H-5 A/R understatement | $27,925 shown vs $29,879 owed; 6 jobs from before July still open ($5,614) |
| Tax-off jobs with part lines (owner: deliberate, no tax owed) | 71 jobs since June, $15,796 of parts |
| Paid "stripe" with no Stripe record (Wix era) | 263 jobs Feb–May, $69k; tapering to 1/month |
| Per-month vs per-job tax rounding | $0.66 for the year |
| Waived jobs / null date_finished / duplicate invoices / line-total drift | 0 / 0 / 0 / 0 |

## 8. Gaps against the ACCOUNTING.md monthly close

| Number the close needs | Available today? |
|---|---|
| Monthly revenue | Partly. Pre-tax, includes waived (H-2), excludes fees (M-3), CSV omits manual income (M-1). Step A of the bridge subtracts tax from an already pre-tax figure — fix the doc. |
| Sales tax collected | Yes, cash-basis by `paid_at`, but recomputed at the live rate from editable lines (H-1), misses Quick Pay parts (H-7), differs from the export by rounding (M-2). |
| Payments received by method | **No.** No report; no `wix` method value; no amount-collected column; "Mark as Paid → Card" is indistinguishable from Stripe (M-20). Closest: pivot the tax-audit CSV on Payment Method. |
| A/R at month-end | **No.** Current-state only, understated (H-5); can't be reconstructed for a past date because waived has no timestamp and Mark-as-Unpaid nulls `paid_at`. |

---

## 9. Recommended order

1. **Stop the bleeding (independent of the money layer, each a small PR):** C-2 delete/cancel guard
   on `invoices` row + FK RESTRICT; C-4 webhook non-2xx on failure; C-1 webhook refuses to overwrite a
   non-stripe paid job + alert, and `recordPayment`/terminal void the open invoice; C-3 handle
   `charge.refunded`/`charge.dispute.*` with at least an alert; H-4 tech column grant; H-6 terminal
   cancel reconcile + server-side amount; M-18 delete the dead Quick Pay route.
2. **Owner decisions (ten minutes, no code):** waived in or out of revenue (H-2); are shop-supplies /
   hazmat fees enabled (M-3); should parking be on a separate Stripe account (M-14); is "Inspection"
   as a category ever used for non-state work (L).
3. **Build the money layer** (`docs/money-layer-design.md` Decision 2): snapshot amount collected,
   tax rate, tax amount, fees at payment; lock line items after payment; add `payments` ledger with
   method + date so "payments by method" and "A/R as of date" become queries. This closes H-1, H-3,
   H-5, M-2, M-3, M-11, M-16, M-19, M-20 and most of §8.
4. **Reporting consistency sweep (one PR):** H-8 inspection-only jobs out of counts/ARO; M-1 CSV;
   M-4/M-5 prior-period and ARO definitions; M-6 coverage chip everywhere; M-12 close rate.
5. **DB hardening migration:** `CHECK (status<>'complete' OR date_finished IS NOT NULL)`,
   `CHECK (payment_status<>'paid' OR paid_at IS NOT NULL)`, unique partial index on
   `invoices(job_id)`, value CHECKs, `REVOKE EXECUTE ... FROM anon, authenticated` on the RPC,
   catch-up migration for the four undocumented columns.
