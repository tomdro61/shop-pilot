---
name: verify-flow
description: End-to-end verification of customer-facing and high-stakes internal flows on shop-pilot. Walks real user journeys (public estimate approval, DVI inspect, parking submit, quote requests, Quick Pay, estimate creation, job cancel) using the local dev server and Playwright when available. Use after any change to checkout/approval/public-API/payment surfaces — code review reads diffs, this clicks through. Existing flows&#58; estimate-approval, dvi-inspect, estimate-create, parking-form, quote-form, quick-pay, job-cancel.
---

# /verify-flow — End-to-end customer-flow verification

You are walking through a real user journey in the running app, not just
reading a diff. Static review can declare "ship it" while a flow is still
broken — the broken Create Estimate button bug from May 2026 got past
two rounds of multi-agent review (`feature-dev:code-reviewer` and the
H-batch validator both marked the form "OK but redundant"). The user
clicked the button, nothing happened, and the cause was a single
runtime detail — react-hook-form flips `isSubmitting=true` BEFORE
invoking the handler — that no diff reader could catch. This skill
closes that gap.

The same session shipped FH-1: the standalone-estimate approval page
rendered blank for every customer who clicked an emailed approval link,
because `getEstimateByToken` joined customer/vehicle through `jobs`
which is `NULL` for estimates created via the new first-class flow. Per-
file review didn't catch it — the join + the public page lived in
different agents' scope. End-to-end verification on the public surface
would have caught both immediately.

**Context this skill needs:**
- Dev server: `npm run dev` from `shop-pilot/`, runs on `http://localhost:3000`
  (Next.js auto-falls to 3001/3002 if 3000 is taken).
- `.env.local` points to **staging Supabase**, so dev server can read real
  data. There's a sent-status estimate in staging used as the canonical
  approval-flow test fixture (see flow scenarios below — token TBD per
  session, ask user if not known).
- Stripe is in **test mode** locally — use card `4242 4242 4242 4242`
  for any flow that touches payment.
- Quo SMS is **not** wired in dev — SMS sends fall back to test mode and
  log to console. Don't assert SMS receipt in scenarios.
- Resend is in test mode locally. Email sends log to console rather than
  delivering. Don't assert email receipt; assert the call was made.
- Public broadwaymotorsma.com forms POST to shop-pilot endpoints — the
  cross-origin part can't be tested locally without curl+CORS headers.
- Production: `https://shop-pilot-rosy.vercel.app`. Don't run /verify-flow
  against prod. Use /post-deploy-check for that.

---

## Step 1 — Pick the flow

Parse `$ARGUMENTS` to identify the flow. If no arg, infer from the
recent diff (`git diff --name-only` + match against the table below).
If still ambiguous, ask the user.

| Flow keyword | Scope files (any of these in the diff → suggest this flow) |
|---|---|
| `estimate-approval` | `src/app/estimates/approve/**`, `src/lib/actions/estimates.ts`, `src/components/dashboard/estimate-approval-buttons.tsx` |
| `dvi-inspect` | `src/app/inspect/**`, `src/lib/actions/dvi.ts`, `src/components/dvi/**` |
| `estimate-create` | `src/app/(dashboard)/estimates/**`, `src/components/forms/estimate-form.tsx`, `src/components/dashboard/estimate-line-items-*`, `src/components/dashboard/estimate-actions.tsx`, `src/lib/actions/estimates.ts` |
| `parking-form` | `src/app/api/parking/submit/**`, `src/lib/actions/parking.ts`, `src/components/parking/**` |
| `quote-form` | `src/app/api/quote-requests/**`, `src/lib/actions/quote-requests.ts`, `src/components/dashboard/quote-request*` |
| `quick-pay` | `src/app/(dashboard)/quick-pay/**`, `src/app/api/terminal/**`, `src/components/dashboard/terminal*` |
| `job-cancel` | `src/components/dashboard/job-cancel-button.tsx`, `src/lib/actions/jobs.ts` (`cancelJob`), `src/lib/ai/handlers.ts` (`cancel_job` case), `src/lib/ai/tools.ts` |

---

## Step 2 — Confirm the dev server is up

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

200 → proceed. Non-200 → try 3001, 3002. All non-200 → tell the user to
start `npm run dev` in `shop-pilot/`. Don't try to start it yourself —
long-running dev servers need user oversight, and on Windows a hung
`next dev` can lock `.next/dev/lock` and require manual cleanup.

---

## Step 3 — Walk the scenarios

Use Playwright MCP tools when available
(`mcp__plugin_playwright_playwright__browser_navigate` etc.). When not
available, fall back to `curl` for HTTP-level checks and explicit manual
steps for the user.

### Flow: `estimate-approval`

Public-facing. The customer clicks an emailed/SMS'd approval link.

**Test data prereq:** a sent estimate's `approval_token` from staging.
If unknown, ask the user to grab one with:
```sql
select approval_token, estimate_number from estimates where status = 'sent' order by sent_at desc limit 1;
```

**Scenario 1 — Standalone-estimate token renders customer + vehicle (FH-1 regression)**
- URL: `http://localhost:3000/estimates/approve/<token>` for an estimate where `job_id IS NULL`
- Assert: customer name renders (e.g., "John Smith")
- Assert: vehicle row renders (e.g., "2020 VW Atlas")
- Assert: line items render with totals
- ❌ FAIL signal: customer/vehicle sections show blank or "—". That's FH-1
  back. The fix routes customer/vehicle off the estimate row, not via
  `jobs.customers`.

**Scenario 2 — Job-linked estimate also renders correctly**
- URL: `http://localhost:3000/estimates/approve/<token>` for an estimate where `job_id IS NOT NULL`
- Assert: same fields populated as Scenario 1.

**Scenario 3 — Approval flow does NOT promise an invoice (MP-1 regression)**
- On a sent estimate's approval page, click "Approve Estimate" → confirm
  in dialog
- Assert: post-approval card text reads "the shop will reach out... invoice
  once the job is complete" (NOT "An invoice has been sent to your email")
- Assert: toast text reads "The shop will be in touch" (NOT "An invoice
  has been sent")
- ❌ FAIL signal: any "invoice has been sent" / "invoice will be sent"
  string. MP-1 is back. The fix is in `estimates/approve/[token]/page.tsx`
  and `dashboard/estimate-approval-buttons.tsx`.

**Scenario 4 — Bad/expired token shows the friendly 404**
- URL: `http://localhost:3000/estimates/approve/this-is-not-a-real-token`
- Assert: "Estimate not found" card with "This link may be invalid or expired."
- Assert: page is **NOT** a 500 / generic error boundary

**Scenario 5 — Already-approved estimate shows the approved card**
- URL on an estimate where `status = 'approved'`
- Assert: "Estimate Approved" card visible, NO Approve/Decline buttons

---

### Flow: `dvi-inspect`

Public-facing. Customer views/approves a DVI report.

**Test data prereq:** a sent-status DVI's token. Ask the user if unknown.

**Scenario 1 — Sent DVI renders condition rows**
- URL: `http://localhost:3000/inspect/<token>`
- Assert: vehicle header (year/make/model) renders
- Assert: tech name + completion date present
- Assert: condition items render with badges (Good/Monitor/Attention)

**Scenario 2 — Customer approval is single-fire (C-5 regression)**
- On a sent DVI, click Approve. After the success state, attempt to
  approve again (refresh + click).
- Assert: the second attempt is rejected (status guard rejects re-submit)
- Assert: no duplicate items, no duplicate timestamps
- ❌ FAIL signal: clicking Approve twice creates two approval rows or two
  status changes. That's C-5 back; the fix flips the inspection status
  to `approved` and the status guard blocks resubmission.

**Scenario 3 — Photos render**
- On any item with photos, photos load (img elements not broken)

---

### Flow: `estimate-create`

Internal manager flow. Highest-friction surface in the May 2026 session.

**Test data prereq:** any customer with a vehicle. Use a real one from
the staging DB.

**Scenario 1 — Create Estimate button actually submits (broken-submit regression)**
- Navigate: `/customers/<id>` → click "New Estimate" (top action bar)
- On `/estimates/new?customerId=<id>`: customer is pre-selected, vehicle
  picker is enabled
- Pick a vehicle → enter notes → click "Create estimate"
- Assert: navigation to `/estimates/<new-id>` happens within ~500ms
- Assert: success toast "Estimate created"
- ❌ FAIL signal: nothing happens, no toast, no navigation. That's the
  May 2026 broken-submit bug back. Two rounds of code review marked the
  guard "OK but redundant" — the rule is now in CLAUDE.md ("never use
  `if (form.formState.isSubmitting) return` inside onSubmit"), but if it
  comes back this scenario catches it instantly.

**Scenario 2 — Estimate detail page reads cleanly**
- On the new estimate's detail page:
- Assert: indigo FileText identity tile in header
- Assert: customer + vehicle cards populated
- Assert: status pill says "Draft"
- Assert: Add line item button visible

**Scenario 3 — Add line item via tabbed sheet**
- Click "Add" on line items
- Assert: tabbed sheet opens with Presets / Catalog / Custom (Presets only
  if the shop has presets configured)
- Switch to Custom → fill type/description/qty/unit_cost → click Add
- Assert: line item appears in the list, total updates

**Scenario 4 — Send Estimate sets status to sent**
- Click "Send Estimate" → confirm
- Assert: status pill flips to "Sent"
- Assert: toast says "Estimate sent" (or includes a `deliveryWarning` if
  SMS/email didn't deliver — both acceptable, but "Estimate sent" with
  no warning means the ?dev? mocks fired)

**Scenario 5 — Mark Approved (manager bypass)**
- On a sent estimate, click "Mark approved"
- Assert: single-button click (no dropdown — the verbal/in-person picker
  was collapsed in May 2026)
- Assert: status flips to "Approved"
- Assert: detail page footer shows "Approved <date>" with no method label
  (NULL approval_method = manager bypass; only customer-link approvals
  store method = "link")

**Scenario 6 — Convert to Job creates a titled job**
- On an approved estimate (no job_id yet), click "Convert to Job"
- Assert: navigation to `/jobs/<new-id>`
- Assert: the new job has a `title` (NOT empty/null) — derived from
  most-common line-item category, first description, or "From EST-####"
- Assert: line items copied over

---

### Flow: `parking-form`

Public-facing. broadwaymotorsma.com hosts 5 forms (self-park, shuttle,
APB1, APB2, valet) that POST to shop-pilot's `/api/parking/submit`.

**Local testing limitation:** the cross-origin POST from broadwaymotorsma.com
isn't reproducible locally. Use `curl` to simulate the form submission.

**Scenario 1 — Self-park form submission creates a reservation**
```bash
curl -X POST http://localhost:3000/api/parking/submit \
  -H "Content-Type: application/json" \
  -H "Origin: https://broadwaymotorsma.com" \
  -d '{"first_name":"Test","last_name":"Customer","email":"test@example.com","phone":"5551234567","drop_off_date":"2026-06-01","drop_off_time":"08:00","pick_up_date":"2026-06-05","pick_up_time":"18:00","make":"Honda","model":"Civic","license_plate":"TEST123","lot":"Broadway Motors","liability_acknowledged":true,"parking_type":"self_park"}'
```
- Assert: 200 response with `confirmation_number`
- Assert: row visible in `/parking` dashboard within seconds (refresh)
- Assert: customer auto-created/found via `findOrCreateParkingCustomer`

**Scenario 2 — Honeypot rejects bots**
- Same curl but with a `_honey` field populated
- Assert: 200 (silent acceptance — don't tell bots they failed) but row
  is NOT in `/parking`

**Scenario 3 — Rate limit kicks in**
- Hit the endpoint 6× from the same source within 60s
- Assert: subsequent requests get 429

---

### Flow: `quote-form`

Public-facing. broadwaymotorsma.com contact page POSTs to `/api/quote-requests`.

**Scenario 1 — Quote request appears on the dashboard (C-12 regression)**
```bash
curl -X POST http://localhost:3000/api/quote-requests \
  -H "Content-Type: application/json" \
  -H "Origin: https://broadwaymotorsma.com" \
  -d '{"first_name":"Test","last_name":"Customer","phone":"5551234567","email":"test@example.com","vehicle_year":2020,"vehicle_make":"Honda","vehicle_model":"Civic","services":["Brakes"],"message":"Test quote request"}'
```
- Assert: 200 response
- Assert: visible at `/quote-requests` (filter `new` is the default)
- ❌ FAIL signal: 200 returned but no row appears. That's C-12 territory
  — `getInboxData` and friends were silently swallowing 6 query errors.
  If the endpoint is fine but the dashboard hides it, check the inbox /
  quote-request server actions for `if (error) return []`.

**Scenario 2 — Quote → Job conversion preserves data**
- On the new quote request row, click "Convert to Job"
- Assert: job created with vehicle/customer pre-filled, services prepended
  to the title, quote request status flips to "converted"

---

### Flow: `quick-pay`

Real money. Stripe Terminal (WisePOS E reader). Don't run with live keys.

**Test data prereq:** Stripe in test mode (check `.env.local`); reader
registered as "Front-desk 1" (or whatever's in `STRIPE_TERMINAL_READER_ID`).

**Scenario 1 — Quick Pay numpad submits a paymentIntent**
- Navigate: `/quick-pay`
- Tap numpad to enter `2500` (= $25.00)
- Click Charge
- Assert: status indicator transitions from "Sending to reader..." to
  "Waiting for tap..."

**Scenario 2 — Cancel before tap creates NO job (the deferred-creation guarantee)**
- After Scenario 1, before tapping the test card, click Cancel
- Assert (DB): `select count(*) from jobs where stripe_payment_intent_id = '<pi>'`
  returns **0** — canceling must not leave a completed-unpaid job behind. This is
  the entire point of the deferred-creation refactor.
- Assert (UI): on a clean cancel the state shows "Payment canceled"; if the cancel
  API returns non-2xx and the PI can't be confirmed, the state shows
  "unconfirmed" with "Couldn't confirm — verify on the terminal before charging
  again" (NOT a red "Payment failed" + Try Again — that invites a double-charge).
- ❌ FAIL signals: a `jobs` row exists after cancel (deferred creation regressed to
  eager creation); OR `toast.success("Cancelled")` regardless of API result (C-7);
  OR an indeterminate cancel rendered as "failed".

**Scenario 3 — Polling has bounded retries (C-8 regression)**
- Disconnect the test reader (or mock the status endpoint to error)
- Click Charge
- Assert: polling stops after the bounded retry count (~10-20s) with an
  error state — NOT infinite "Waiting..."
- ❌ FAIL signal: spinner runs forever. That's C-8 — the polling loop
  needs a max-retries + unmount cleanup.

**Scenario 4 — Successful tap CREATES the job, marked paid**
- Tap test card `4242 4242 4242 4242` after Charge
- Assert (DB): a `jobs` row now exists for the PI (it did NOT exist before the tap —
  `record_quick_pay_job` creates it on success), with `payment_status = "paid"`,
  `payment_method = "terminal"`, `stripe_payment_intent_id = '<pi>'`, and exactly
  one `job_line_items` labor row whose `unit_cost` equals the charged amount.
- Assert (UI): success toast + "View Job" link resolves to the new job; Quick Pay
  resets.
- ❌ FAIL signal: two line items, or a job with zero line items ($0 revenue), or a
  job that existed before the tap.

**Scenario 5 — Webhook backstop records the job when the client never sees success**
- Charge, tap the test card, then immediately close the tab / kill the poll before
  it observes `succeeded`
- Assert (DB): the job is still created (with its line item, marked paid) — the
  Stripe `payment_intent.succeeded` webhook is the durable backstop
- ❌ FAIL signal: money collected in Stripe but no job row — the webhook branch
  isn't routing `quick_pay` metadata, or it 200s on a failed record instead of
  letting Stripe retry.

---

### Flow: `job-cancel`

Recently shipped (May 2026). Two surfaces: the Cancel button on job
detail, and the `cancel_job` AI tool.

**Scenario 1 — Cancel button is visible only on cancellable jobs**
- Open an active job (`status = "in_progress"`, `payment_status = "unpaid"`)
- Assert: Cancel button visible in the top action bar
- Open a complete job
- Assert: Cancel button NOT visible
- Open a cancelled job
- Assert: Cancel button NOT visible

**Scenario 2 — Cancel blocks paid jobs**
- Find a job with `payment_status = "paid"` (or set one in the DB for the
  test). It should already be `complete` so the status guard hits first;
  to test the payment guard specifically, force-set `status = "in_progress"`
  + `payment_status = "paid"` on a test row.
- Click Cancel → confirm
- Assert: error toast "Paid jobs can't be cancelled — refund the payment
  in Stripe first"
- Assert: job status unchanged

**Scenario 3 — AI cancel_job tool is wired (MP-2 regression)**
- In `/chat`, tell the AI: "Cancel job RO-XXXX"
- Assert: AI confirms the action, calls the `cancel_job` tool, returns
  the success result. Should NOT respond with "I tried to use cancel_job
  but the tool doesn't exist."
- ❌ FAIL signal: AI says the tool isn't available or `update_job_status`
  rejects with "use the cancel_job tool" message. That's MP-2 back —
  re-check both `tools.ts` (definition) and `handlers.ts` (case branch).

---

## Step 4 — Report

For each scenario:
- ✅ PASS — what you verified
- ❌ FAIL — exact value seen vs. expected, plus the regression-target bug
  ID if it's a known anchor (e.g., "FH-1 regression")
- ⚠️ SKIP — couldn't verify (Playwright unavailable, dev server down, no
  test data, prod-only flow)

End with:
- "Flow verified — safe to merge"
- "Flow broken at scenario N — see details" (always specifies which
  scenario; never just "broken")

---

## Don't

- Don't claim PASS without actually running the scenario. If you can't hit
  the URL, mark SKIP.
- Don't run Quick Pay scenarios with live Stripe keys. If `.env.local` has
  `pk_live_*`, mark all `quick-pay` scenarios SKIP.
- Don't auto-create real reservations or estimates that go to staging
  unless the user explicitly asks. Reuse existing test rows.
- Don't substitute this for `/scoped-review`. They cover different gaps:
  review reads the diff; this clicks the UI.
- Don't fake Playwright steps when the tool isn't available. Run
  `mcp__plugin_playwright_playwright__browser_navigate` first; if it errors,
  fall back to manual instructions and clearly mark SKIP for any step you
  couldn't verify.
- Don't run against `https://shop-pilot-rosy.vercel.app` — that's prod.
  Use `/post-deploy-check` for prod verification.

---

## Adding new flows

When a new customer-facing or money-touching flow ships, add it here with:
1. The keyword (`/verify-flow <keyword>`)
2. Scope files (for auto-detection from the diff)
3. Concrete scenarios with URLs, asserts, expected values
4. Test data prereqs

When a /verify-flow scenario catches a bug that scoped-review missed, log
the lesson in `REVIEW-FINDINGS.md` and link the bug ID into the relevant
scenario header (the FH-1 / MP-1 / MP-2 / C-5 / C-7 / C-8 / C-12 anchors
above are how this looks). The scenarios should accumulate the failure
modes the codebase has actually shipped — not theoretical edge cases.
