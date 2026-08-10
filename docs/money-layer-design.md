# Design: The Money Layer — move job totals into the database

**Status:** proposed, nothing built. Awaiting owner decisions (§8).
**Written:** 2026-08-10, after the dashboard revenue incident below.
**Supersedes nothing. Blocks:** [`split-tender-design.md`](./split-tender-design.md) — see §7.

---

## 1. The incident

On 2026-08-10 the dashboard showed **$885** of revenue for a day that actually did **$2,261**. Not a
rounding error — 61% of the day was missing, and the shop noticed because the "Completed Today" column
listed 8 jobs while the revenue card's subtitle claimed 6.

Cause: `dashboard/page.tsx` pulled every completed job from Jan 1 through month end and summed the line
items in JavaScript. PostgREST caps every response at **1000 rows** and reports no error when it
truncates. The shop crossed 1,002 completed jobs a few days earlier, so the query silently started
dropping two of them — and because there was no `ORDER BY`, *which* two was arbitrary.

Measured at the time:

```
completed jobs Jan 1 – Aug 31   : 1,002
rows the query actually returned: 1,000
today's completed jobs          : 8 exist, 6 reached the revenue math
Today's Revenue    shown $   885.00  |  actual $  2,261.00  |  missing $1,376.00
This Month         shown $10,027.00  |  actual $ 11,403.00  |  missing $1,376.00
```

The cap cannot be argued with from the client — verified against the live database:

```
.limit(5000)      -> 1000 rows
.range(0, 4999)   -> 1000 rows
.range(1000,1999) ->    2 rows   (the data is there; the query just can't ask for it in one go)
```

**Fixed same day** by narrowing the range to last-month-start (1,002 → 288 rows) and adding
`assertComplete()`, which requests `{ count: "exact" }` and throws when the row set comes back short.
That stops the bleeding. It does not address why a revenue figure was ever assembled this way.

## 2. Root cause: one fact, three faces

**The database does not know what a job is worth.**

`calculateTotals(lineItems, settings, chargeSalesTax)` in `src/lib/utils/totals.ts:122` is the only
place that math exists. Postgres holds line items and shop settings and has never been told how to
combine them. Everything below follows from that one fact:

**Face 1 — every consumer must fetch raw rows to compute anything.** Dashboard, reports, trends,
receivables and the tax report all pull jobs plus nested line items across the network and sum them in
JS. That is the *only* reason a row cap could ever touch a dollar figure. An aggregate query returns
one row and cannot truncate.

**Face 2 — every consumer re-derives the total differently, and they disagree today.** This is not
hypothetical and does not require a bug:

| Surface | What it calls "the job's value" |
|---|---|
| Job page / footer | `calculateTotals().grandTotal` — labor + parts + supplies + hazmat + tax |
| `receivables.ts:62-64`, `:118-121` | raw `sum(job_line_items.total)`, inspection categories dropped — **no tax, no supplies, no hazmat** |
| `revenue.ts:sumJobRevenue` | raw `sum(total)`, inspection categories dropped — same omissions |
| `reports.ts` tax report | parts only for the taxable base, plus its own revenue sum |

So A/R understates every taxed job by the tax, supplies and hazmat it never adds. Your A/R page and
your job page already disagree about what a customer owes.

**Face 3 — it is what made split-tender expensive.** Constraint 4 of the split-tender review — *"the
grand total is never stored"* — is this same fact seen from the payments side. It is why that design
needed an RPC taking a caller-supplied `p_total`, why a database trigger was impossible, why no SQL
backfill could ever work, and why amendment A3 proposed `jobs.total_snapshot`.

One cause. Fix it once.

## 3. Measured state of every money query (2026-08-10)

Live counts against production. The cap is 1,000:

```
receivables (unpaid complete)                    19   ok
dashboard revenue AFTER today's fix             288   ok
tax report (ALL paid jobs, no date filter)      983   !! 17 rows from the cap
all completed jobs, all time                  1,002   *** already truncating ***
all jobs, all time                            1,038   *** already truncating ***
all job_line_items                            2,305   *** already truncating ***
```

**`getTaxReportData` is the urgent one.** It queries every paid job in the shop's entire history with
**no date filter at all**, then narrows to the requested year in JavaScript (`reports.ts:625`). So the
cap bites before the year filter runs. At ~8 completed jobs a day it crosses 1,000 within days, and
when it does, the DOR filing number starts dropping arbitrary jobs with no error. **This needs a SQL
date filter now, independent of everything else in this document.**

`receivables.ts` has two further defects found while writing this, unrelated to volume:
- `:48` and `:94` destructure `{ data }` and **discard `error` entirely** — a failed query renders
  **$0 outstanding**, indistinguishable from "everyone has paid." Direct violation of the
  `CLAUDE.md` rule on this.
- `.limit(10000)` on both queries, which we now know does nothing against the cap. It reads as
  protection and provides none.

## 4. Proposed architecture

### Layer 1 — `job_totals`, the canonical money view

One row per job, computed in SQL, matching `calculateTotals` exactly:

```sql
create view job_totals as
select
  j.id                as job_id,
  j.date_finished,
  j.payment_status,
  j.charge_sales_tax,
  labor_total,                    -- sum(total) where type = 'labor'
  parts_total,                    -- sum(total) where type = 'part'
  shop_supplies,                  -- method/rate/cap, scoped by category
  hazmat,                         -- flat amount, scoped by category
  tax_amount,                     -- parts_total * rate, only when charge_sales_tax
  grand_total,                    -- labor + parts + supplies + hazmat + tax
  service_revenue                 -- grand_total excluding inspection-category items
from jobs j ...
```

Note the tax base is **parts only** — not labor, not supplies, not hazmat (`totals.ts:177-181`). The
SQL must reproduce that, along with the category-scoping of both fees (`feeAppliesToJob`) and the
`total ?? quantity * unit_cost` fallback for null totals.

**This must be proven equivalent, not assumed.** A differential test runs `calculateTotals` and the
view over every existing job and asserts they agree to the cent. That test then guards the pair
forever — change one without the other and it fails.

Then:
- Dashboard revenue = `select sum(service_revenue) from job_totals where date_finished between $1 and $2`
  — **one row back. No cap. No JS summing. Cannot truncate.**
- A/R outstanding reads `grand_total` from the same view, which fixes Face 2 for free
- Tax report sums the same view
- Split-tender finally has a total Postgres can see

### Layer 2 — aggregation RPCs, not row fetches

```
get_revenue_summary(p_from date, p_to date)
  returns (service_revenue, job_count, labor, parts, tax, supplies, hazmat)
```

The dashboard stops downloading jobs entirely. Same for `getDailySummary`, the tax report, trends and
receivables. **Rule: a screen that displays a number should not download the rows behind it.**

### Layer 3 — guardrails, because the real defect is that nothing noticed

The bug shipped with no code change. It appeared because a row counter crossed a threshold. Every gate
in the workflow was structurally blind to it:

| Gate | Why it missed this |
|---|---|
| Unit tests | Fixtures are small. Nothing has 1,000 rows |
| `/scoped-review` | There was no diff to review — the code was months old |
| Typecheck / lint | Types were correct. Truncation is a runtime property of data volume |
| `/verify-flow` | Clicking through renders a number; nothing says it's the *wrong* number |

So:
1. **`assertComplete()`** on every remaining row-fetch that feeds a figure. *(shipped 2026-08-10)*
2. **A volume test** — seed >1,000 jobs, assert every money figure still matches ground truth. This is
   the gate that would have caught it, and the only one that would have.
3. **A daily drift cron** — recompute yesterday's revenue two independent ways (view vs JS) and
   `Sentry.captureException` on mismatch. Mirrors the split-tender review's A20.
4. **A review rule:** any `.select()` feeding a money figure must either aggregate in SQL, or carry
   `{ count: "exact" }` + `assertComplete`. Add to `CLAUDE.md` anti-patterns.

## 5. The hard decision inside Layer 1: settings drift

Shop settings are **inputs** to the total — tax rate, supplies method/rate/cap, hazmat amount, and the
category scoping of both fees. They change over time.

A view that reads *current* settings is correct for open jobs and **wrong for history**: raise the
hazmat fee and last year's revenue silently changes. Re-file a prior quarter and the number won't match
what you filed.

Two options:

**(a) Freeze totals at completion.** When a job is marked complete, write `grand_total` and a
`totals_breakdown` snapshot onto the row. History becomes immutable and cheap to read. Requires
deciding what happens when a completed job is edited.

**(b) Version shop settings.** Timestamp every settings change; the view joins the settings row that
was in effect on `date_finished`. Nothing is frozen, everything is reconstructible, but every read pays
a temporal join and the settings table gets more complex.

**Recommendation: (a).** It matches how the shop actually behaves — a finished job is a finished
transaction — and it is the same decision the split-tender review reached independently as amendment
A3. Making it once serves both projects.

## 6. Consumer migration inventory

| File | Today | After |
|---|---|---|
| `dashboard/page.tsx` | fetches 288 job rows, sums in JS | one `get_revenue_summary` call |
| `reports.ts` `getTaxReportData` | **all paid jobs ever**, filters year in JS | SQL date filter + view aggregate |
| `reports.ts` `getDailySummary` | rows → JS, and buckets by `payment_method` into an untyped map | view aggregate |
| `reports.ts` (4 more job queries) | unaudited | audit + migrate |
| `receivables.ts` ×2 | raw line-item sums, `error` discarded, useless `.limit(10000)` | view aggregate, `{ error }` checked |
| `trends.ts:137` | unaudited | audit + migrate |
| `revenue.ts` `sumJobRevenue` | the JS definition | kept only as the differential-test oracle |

## 7. Sequencing: this comes before split-tender

Both projects need the same thing — the grand total in the database.

Build split-tender first and it gets built against a JS-only total, which is precisely what forced the
caller-supplied `p_total`, its forgery surface, the `total_snapshot` amendment and the line-item lock.
Build the money layer first and a meaningful chunk of that design deletes itself: the RPC stops needing
`p_total` at all, and the balance becomes derivable in SQL.

**Recommendation: money layer first.** Split-tender v3 stays parked until `job_totals` exists.

Rough sizing: Layer 1 + the freeze decision 2–3 days · Layer 2 + migrating six consumers 2–3 days ·
Layer 3 guardrails 1–2 days. **~1–1.5 weeks**, and it makes split-tender smaller rather than just safer.

## 8. Open decisions

1. **Freeze totals at completion, or version shop settings?** (§5 — recommend freeze.) This is the one
   that shapes everything else.
2. **What happens when a completed job is edited after its total is frozen?** Recompute, or refuse the
   edit? Ties directly to split-tender Decision C.
3. **Fix `getTaxReportData` now, ahead of this project?** It is 17 rows from silently corrupting a DOR
   filing surface. Recommend yes — it is a one-line SQL date filter.
4. **Is a year-to-date revenue figure wanted on the dashboard?** It has never had one; today's fix
   removed the vestigial Jan-1 reach-back that made it look like it did. Cheap to add properly once
   Layer 2 exists.

## 9. Out of scope

Materialized views or a reporting warehouse (a single shop's volume does not warrant either), changing
what counts as revenue, the inspection-counts and manual-income tables (they already aggregate small,
bounded row sets), and multi-location rollups.

## Appendix — reproducing the measurements

Diagnostics used for §1 and §3 are read-only Node scripts in this session's scratchpad
(`check-dash.cjs`, `check-tax.cjs`, `check-month.cjs`, `blast-radius.cjs`). Each reads `.env.local`,
runs count and range queries, and prints shown-vs-truth. Re-run any of them with
`NODE_PATH=./node_modules node <script>` from the repo root to confirm current state.
