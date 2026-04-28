# ShopPilot Code Review — staging → master

**Generated:** 2026-04-27
**Scope:** 119 files changed, +4,772 / −2,902 lines
**Source:** 13 parallel review agents (whole-diff bug hunt, silent-failure hunter, type-design analyzer, comment auditor, test-coverage analyzer, code simplifier, plus 7 area-scoped reviewers)
**Cloud `/ultrareview` did not produce output** — this document is the local replacement.

---

## How to use this document

Each finding has a stable ID (`C-1`, `H-1`, etc.). Use them to track which ones you've fixed (e.g., a checkbox or strikethrough). Suggested workflow: fix all `CRITICAL` first, then verify the cluster of `HIGH` items, batch the `MEDIUM`/cleanup work into a follow-up commit.

**Severity legend:**
- **CRITICAL** — blocks merge to master. Money-handling bug, auth bypass, data loss, or "stuck UI forever" class.
- **HIGH** — should be fixed before merge or with the same PR. Real correctness or UX bugs.
- **MEDIUM** — follow-up tickets are fine. Style drift, dead code, contrast issues.

---

## Recommended Fix Order (top 10)

1. **C-1** — Verify RLS policies on `jobs`/`customers` OR add `getCurrentUser()` + role check to `updateJobFields`/`updateCustomerFields`
2. **C-11** — Wrap `useInlineEditor.commit` in try/catch (unblocks ~12 editors from "stuck saving forever" bug)
3. **C-7** — Quick Pay `handleCancel` `res.ok` check (money-handling correctness)
4. **C-8** — Quick Pay polling: max retries + unmount cleanup
5. **C-2** — Replace `createAdminClient()` with `createClient()` in `actions/inbox.ts`; drop or scope `unstable_cache`
6. **C-4** — `createEstimateFromJob` rollback or hard-fail when line-items insert fails
7. **C-5** — DVI re-approval: flip inspection status to `"approved"`
8. **C-15** — Add `role`/`tabIndex`/`onKeyDown` to `ClickableRow`
9. **C-9** — Switch dashboard cache strategy: `revalidateTag` everywhere or drop `unstable_cache`
10. **C-16** — Null-guard `CustomerLink` in `inbox-list.tsx`

---

# CRITICAL

## C-1 — `updateJobFields` and `updateCustomerFields` have no auth check ✅ FIXED

**Files:** `src/lib/actions/jobs.ts:201-222`, `src/lib/actions/customers.ts:128-154`
**Confidence:** 95
**Fix shipped:** Added `requireManager()` helper in `src/lib/auth.ts`; both actions now bail with `{ error: "Forbidden" }` before touching the DB if the caller isn't a manager. RLS audit in Supabase still pending as the second defense layer.

Neither action calls `supabase.auth.getUser()` or checks the caller's role before executing the update. The middleware (`src/middleware.ts:127`) `matcher` explicitly **excludes `/api/*`** — and Next.js server actions resolve through that path. So role separation depends entirely on RLS policies on `jobs` and `customers`.

**User impact:** If RLS is set to "authenticated = all access" (a common default during early dev), any technician (or a session replay of a tech's session) can mutate jobs and customers without restriction.

**Fix:** Add an explicit role check at the top of both actions:
```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Unauthorized" };
const { data: profile } = await supabase.from("users").select("role").eq("auth_id", user.id).single();
if (profile?.role === "tech") return { error: "Unauthorized" };
```
Or audit the RLS policies on `jobs` and `customers` to confirm role separation is enforced at the DB level.

---

## C-2 — `inbox.ts` server actions use `createAdminClient()` (service role, bypasses RLS) ✅ FIXED

**Files:** `src/lib/actions/inbox.ts:4, 122, 251`
**Confidence:** 95
**Fix shipped:** Replaced `createAdminClient()` with `createClient()` (cookie-bound SSR client, RLS-respecting) in both `getInboxData` and `getInboxTotalCount`. Fixed together with C-3.

`inbox.ts` is marked `"use server"` and imports `createAdminClient` (service role key). Both `getInboxData` and `getInboxTotalCount` use it. Per CLAUDE.md: "service role only in API routes." These are server actions, not API routes.

**User impact:** Any authenticated user — including a technician role — gets unrestricted DB access for these queries. The data returned (unpaid jobs, DVI queue, estimates, quote requests, parking leads) is supposed to be manager-only.

**Fix:** Replace `createAdminClient()` with `await createClient()` in both functions.

---

## C-3 — `unstable_cache(["inbox-data"])` has no per-user key ✅ FIXED

**File:** `src/lib/actions/inbox.ts:120-246`
**Confidence:** 92
**Fix shipped:** Dropped `unstable_cache` wrapper entirely. Low-traffic internal tool — TTL added little value, and cross-user cache leakage was unfixable without a per-user key (which `unstable_cache`'s static-key API doesn't ergonomically support).

`getInboxData` is wrapped with `unstable_cache(fn, ["inbox-data"], { revalidate: 30 })`. There is no per-user segment in the key, so all authenticated users share the same 30-second cache entry.

**User impact:** Combined with C-2, a tech's session can populate the cache and the next manager call within 30 seconds gets the tech's cached result. Even after fixing C-2, a manager who sees stale data won't see mutations for 30 seconds.

**Fix:** Drop `unstable_cache` entirely (low-traffic internal tool — TTL adds little). Or include a user-scoped cache key: `["inbox-data", userId]`.

---

## C-4 — `createEstimateFromJob` returns success when line-items insert fails ✅ FIXED

**File:** `src/lib/actions/estimates.ts:50-65`
**Fix shipped:** (1) Added `requireManager()` auth check. (2) Added error checks on the existing-estimate query and the line-items SELECT (both were silently ignored). (3) Captured the line-items insert error and rollback the estimate row if the insert fails. (4) Captured the rollback DELETE error too — if the rollback itself fails, the error message names the orphan estimate ID for manual cleanup. Validated by retroactive `feature-dev:code-reviewer` (which caught the unguarded rollback DELETE — fixed before close).

The estimate row is created and the function returns success — but if the subsequent `estimate_line_items` insert fails, the estimate is empty.

**User impact:** User clicks "Send estimate" and emails a $0 estimate to the customer.

**Fix:** Check the insert error; on failure, either delete the estimate row (rollback) or return a hard error.

---

## C-5 — DVI approval is re-submittable; double-tap creates duplicate line items ✅ FIXED

**File:** `src/lib/actions/dvi.ts:623-757`
**Confidence:** 92
**Fix shipped:**
- Added `"approved"` to the `dvi_status` enum (migration `20260428000000_add_approved_dvi_status.sql` + types).
- Replaced the simple status guard with an **atomic conditional update**: `UPDATE dvi_inspections SET status='approved' WHERE id=? AND status='sent'`. Concurrent submitters who pass the pre-lock read will fail this update (0 rows affected) and exit cleanly with "already processed."
- Reordered validation so all reads that could permanently lock the customer out happen BEFORE the lock.
- Added rollback (status flip back to `"sent"`) on auto-create-job failure AND line-items-insert failure. Rollback failures are now logged via `console.error` and surface to the customer as "contact the shop" instead of silently leaving the inspection in a stuck-approved state.
- Incidentally addresses H-28: the inspection→job link-back update is now error-checked with a console.error log if it fails.
- Updated 7 status-branching call sites (reopenInspection, getRecentCompletedInspections, getStandaloneInspections showAll filter, dvi-section.tsx, 3 page files, constants.ts).
- Validated by `feature-dev:code-reviewer` + `pr-review-toolkit:silent-failure-hunter` — caught a critical UX regression I introduced (DVI section rendering null for `"approved"` status) and three silent rollback failures, all fixed before close.

**Deployment note:** `supabase db push` must run BEFORE the code deploys, or Postgres rejects the `"approved"` enum write.

The public `approveRecommendations` server action is callable by anyone with the token URL. There is no guard preventing a second approval. On each call, it inserts a new batch of `job_line_items` into the job without checking whether those result IDs have already been approved. The inspection's `status` stays `"sent"` after approval — so the guard at line 639 (`status !== "sent"`) always passes on re-submission.

**User impact:** Customer double-tap (or retry after slow network) → duplicate line items on the job → duplicate charges that a tech could invoice. **Real money bug.**

**Fix:** After inserting line items, update `dvi_inspections.status` to a terminal state (e.g., `"approved"`) and verify status isn't already terminal at the top of the action.

---

## C-6 — `createInvoiceFromJob` swallows Stripe customer retrieve errors

**File:** `src/lib/actions/invoices.ts:126-135`

```ts
try {
  const existing = await stripe.customers.retrieve(stripeCustomerId);
  if ((existing as { deleted?: boolean }).deleted) stripeCustomerId = null;
} catch {
  stripeCustomerId = null;
}
```

A network/auth/rate-limit failure is treated as "customer doesn't exist," so a duplicate Stripe customer is created.

**User impact:** Duplicates accumulate in Stripe over time; customer payment history splits across them.

**Fix:** Only treat `StripeInvalidRequestError` with code `resource_missing` as missing; rethrow other errors.

---

## C-7 — Quick Pay `handleCancel` reports cancel as success when API returns non-2xx ✅ FIXED

**File:** `src/components/dashboard/quick-pay-form.tsx:230-242`
**Fix shipped:** Added `res.ok` check; non-2xx responses surface as "Cancel may have failed — verify on terminal" (money-handling: never falsely confirm cancel). Added `cancelingRef` guard to prevent double-cancel. Cancel now also clears any pending poll timeout to prevent state-snap-back. Validated by retroactive `feature-dev:code-reviewer` which caught a CRITICAL race I introduced — see C-8 closeout.

`await fetch(...)` then unconditionally `setState("canceled")` and `toast("Payment canceled")`. Doesn't check `res.ok`. Catches network errors but ignores 4xx/5xx responses.

**User impact:** Cancel call could fail server-side (terminal still listening for card). User sees "Payment canceled" — but a real card swipe will still authorize and charge. **Money-handling silent failure.**

**Fix:** Check `res.ok`; only mark canceled after server confirms. Otherwise show "Cancel may have failed — verify on terminal."

---

## C-8 — Quick Pay polling retries forever on any error ✅ FIXED

**File:** `src/components/dashboard/quick-pay-form.tsx:162-183`
**Fix shipped:** Three layers of guards. (1) `MAX_POLL_DURATION_MS` (5 min) hard cap on total polling. (2) `MAX_CONSECUTIVE_ERRORS` (5) consecutive failure cap. (3) `mountedRef` + `pollTimeoutRef` — `useEffect` cleanup clears the timeout on unmount. Added `res.ok` check on status fetch. `handleReset` clears refs and timeout.

**Follow-up:** Retroactive review caught a CRITICAL race I introduced — an in-flight `pollStatus` fetch (mid-await) could resolve with `{ status: "succeeded" }` AFTER `handleCancel` started, overwriting the cancel state with a false success. Money-handling worst case: operator told "canceled" while card was charged. **Fixed:** added `if (cancelingRef.current) return` guard inside `pollStatus` after the await (in both success and catch paths). Also fixed `cancelingRef` reset — was unconditional in `finally`, now resets only on error so successful cancel can't be re-triggered.

```ts
} catch {
  setTimeout(() => pollStatus(piId), 3000);
}
```

If the status endpoint returns 500 or `data.status` is malformed, this loops forever. UI stays on "Waiting for customer to present card…" indefinitely. Same `try/catch` swallows JSON parse failures and aborts. Also: `setTimeout` chain leaks state setters after unmount.

**Fix:** Check `res.ok`; max retry counter; after N failures switch to `failed` state with a connectivity toast. Cancel polling on unmount via `useEffect` cleanup.

---

## C-9 — `unstable_cache(["dashboard-stats"])` is not invalidated by mutations ✅ FIXED

**File:** `src/app/(dashboard)/dashboard/page.tsx`, `src/lib/actions/manual-income.ts:104, 127, 139`
**Confidence:** 95
**Fix shipped:** Dropped `unstable_cache` wrapper entirely (matches inbox.ts strategy from C-3). Low-traffic single-shop tool — perf hit acceptable, eliminates the broken-invalidation bug class. Each dashboard load now runs 11 fresh queries. Note for future: if dashboard auto-refresh is added, don't poll faster than ~10-15s.

`getDashboardData` is wrapped in `unstable_cache(…, ["dashboard-stats"], { revalidate: 30 })`. The Next.js Data Cache keyed by tag is only evicted by `revalidateTag("dashboard-stats")`. Mutations (`jobs.ts`, `manual-income.ts`, `estimates.ts`, `terminal.ts`, `quote-requests/route.ts`) call `revalidatePath("/dashboard")` — which busts the Router Cache (RSC payload), **not** the Data Cache entry produced by `unstable_cache`.

Sharper version: `manual-income.ts` mutations only call `revalidatePath("/reports")` — never `revalidatePath("/dashboard")`. So manual income added/edited never appears in the dashboard until the 30s TTL expires.

**Fix:** Replace `revalidatePath` with `revalidateTag("dashboard-stats")` in every action that mutates dashboard-read data. Or at minimum add `revalidatePath("/dashboard")` to the three `manual-income.ts` CRUD actions.

---

## C-10 — `getDashboardData` ignores all 11 query errors ✅ FIXED

**File:** `src/app/(dashboard)/dashboard/page.tsx:43-208`
**Fix shipped:** Each of the 11 queries' `.error` is now checked; on failure, throws with a section-named message. The existing `(dashboard)/error.tsx` boundary catches it. Closed alongside C-9 (same file). Validated by `feature-dev:code-reviewer` + `pr-review-toolkit:silent-failure-hunter` — both cleared the fix; one minor consistency note (`|| []` fallback missing on two lines) addressed in the same change.

**Production note (out of scope):** Next.js client error boundaries strip `error.message` in production and replace with a generic string + digest. So in production the user sees "An unexpected error occurred" while the real cause goes to the server log. Sentry will close this gap when it lands.

All eleven Supabase calls in `Promise.all` destructured as `*.data || []` / `*.count || 0` with no error checks. Cached for 30s.

**User impact:** A failed query (e.g., `unpaid_jobs`) silently zeros out a KPI card. Manager sees "$0 outstanding A/R · all caught up" or "0 open jobs" with no warning. Especially dangerous for the Revenue & pacing section.

**Fix:** Throw on errors so Next's error boundary fires, or surface a per-card "data unavailable" state.

---

## C-11 — `useInlineEditor.commit` does not catch thrown server actions ✅ FIXED

**File:** `src/hooks/use-inline-editor.ts:27-43`
**Fix shipped:** Wrapped `runSave()` in try/catch/finally. `setSaving(false)` always runs in `finally` so the editor never gets stuck. Errors surface via `toast.error`. Also picked up H-14 (savingRef double-fire guard) and unmount safety (mountedRef gates setState/toast; `router.refresh()` runs unconditionally since it's safe when unmounted). Validated by `feature-dev:code-reviewer` — caught one issue (router.refresh was incorrectly gated by mount check) which was then fixed.

`commit(runSave, …)` calls `await runSave()` with no try/catch. The hook only handles the `{ error }` return shape — but server actions can throw (network failure, server crash, redirect, action revalidation throw).

**User impact:** If `updateJobFields`/`updateCustomerFields` throws, `setSaving(false)` never runs, the editor stays disabled with "Saving…" forever, no toast, no rollback. **Every editor that uses this hook inherits this bug** — job title, date, mileage, notes, customer text fields, customer notes, job notes.

**Fix:** Wrap `runSave()` in try/catch, set `saving=false`, toast `errorFallback`, and restore `draft` so the user can retry.

---

## C-12 — `getInboxData` and `getInboxTotalCount` ignore all 6 query errors ✅ FIXED

**File:** `src/lib/actions/inbox.ts:120-280`
**Fix shipped:** Two strategies for two contexts:
- `getInboxData` (page-level, called only from `/inbox`): each of the 6 queries' `error` is now checked; on failure, throws with a section-named message. The existing `(dashboard)/error.tsx` boundary catches it and shows "Something went wrong" with the error message + Try Again button.
- `getInboxTotalCount` (called from the dashboard `layout.tsx`, drives the sidebar badge across the entire dashboard): fails soft. Errors are logged to `console.error`, total falls back to `count || 0` per query — wrong badge count is acceptable, a broken dashboard layout is not. Throwing here would crash the whole app.

The asymmetric strategy is intentional and documented inline. Validated by retroactive `pr-review-toolkit:silent-failure-hunter`: confirmed all 6 + 5 queries are covered, error boundary path works, but flagged H-47 (degraded-badge UX gap) — tracked for follow-up since adding a `{ count, degraded }` return shape + UI indicator is feature scope beyond C-12.

Six parallel queries; results read as `(unpaidResult.data || [])` etc. with no `.error` check. Cached for 30s.

**User impact:** A failed query renders the inbox section as "empty" / sidebar count drops. A connection/RLS problem looks identical to "all caught up." Manager could miss unpaid jobs, pending estimates, parking leads. Cached zeros stick for 30s.

**Fix:** Check each `.error` and either throw or return per-section status flags so the UI can mark a section as "failed to load" instead of "empty."

---

## C-13 — `sendCustomerSMS` returns success even when message log insert fails ✅ FIXED

**Files:** `src/lib/actions/messages.ts:41-61, 129-140`
**Fix shipped:**
- `sendCustomerSMS` (lines 41-52): already had the agreed-upon "log + continue" pattern from a prior fix — destructures `insertError` and logs via `console.error`. No change needed.
- `sendParkingSpecialsSMS` (lines 129-140): added error checks for BOTH the `messages.insert` AND the `parking_reservations.update({ specials_sent_at })`. The second is critical — without it the customer can be re-sent specials. Loud `console.error` with reservationId + "duplicate-send possible" warning so the inconsistency is visible in Vercel logs / future Sentry.
- Validated by `pr-review-toolkit:silent-failure-hunter` — cleared.

SMS sent via Quo, then insert into `messages` table. If insert fails, just `console.error` and return `{ data: { sent: true } }`.

**User impact:** SMS reached customer but the customer's message timeline is missing it. Audit trail broken. Same bug exists for parking specials at lines 129-140 — `specials_sent_at` may also fail to update, so a customer who already received specials can be re-sent (the upsell flag never landed).

**Fix:** Return a partial-success result: `{ data: { sent: true, logged: false, logError: insertError.message } }` and surface a non-blocking toast on the caller.

---

## C-14 — Fire-and-forget SMS/email failures only go to `console.error` ✅ FIXED

**Files:** `src/lib/actions/invoices.ts:187-204, 213-232, 380-393, 397-416`; `src/lib/actions/dvi.ts:333-356, 567-587, 590-611, 730-755`
**Fix shipped:** Symmetrized `sendCustomerSMS` with `sendCustomerEmail` (which already wrote `status: "failed"` rows on send failure). Now `sendCustomerSMS` writes `status: "sent"` on success and a `status: "failed"` row in its catch block before returning the error. All 4 customer-facing fire-and-forget SMS callers automatically get failure-logging on the customer timeline — no caller changes needed. The 2 internal-only SMS calls in `dvi.ts` (to the shop's own phone) are intentionally unchanged — `console.error` is sufficient for staff alerts. Validated by `feature-dev:code-reviewer` — cleared.

**Bonus discovery from review:** the `status` column was added with DB default `'sent'` (migration `20250223200000_message_status.sql`), so legacy rows render correctly without a backfill.

Pattern:
```ts
import("…").then(…).catch((err) => console.error(…))
```

**User impact:** Server action returns `{ data: invoice }` and the UI toasts "Invoice sent." But the SMS or email may have silently failed — only a server-log line records it. Customer never receives the link.

**Fix:** Either `await` the side effect and surface a delivery-status field on the response, or write a row to `messages` with `status='failed'` so the customer's timeline shows the failure.

---

## C-15 — `ClickableRow` is not keyboard-accessible ✅ FIXED

**File:** `src/components/ui/clickable-row.tsx:19`
**Confidence:** 95
**Fix shipped:** Added `role="link"`, `tabIndex={0}`, `onKeyDown` handler (Enter and Space, both with `e.preventDefault()` so Space doesn't scroll the page), and a `focus-visible:ring` style so keyboard users see where focus is. Trimmed JSDoc to one sentence per CMT-14. Public API unchanged. Validated by `feature-dev:code-reviewer` — caught a focus-ring corner-radius mismatch on `rounded-lg` card callsites (was hardcoded `rounded` = 4px, fixed by dropping it so the ring inherits caller's radius).

The component renders a `<div>` with an `onClick` handler and no `role`, `tabIndex`, or `onKeyDown`. Used as primary navigation across dashboard inbox, DVI page, and multiple other pages.

**User impact:** Keyboard users (Tab key) cannot reach or activate these rows. Affects real shop-floor usage.

**Fix:**
```tsx
<div
  role="link"
  tabIndex={0}
  onClick={() => router.push(href)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(href);
    }
  }}
  className={`cursor-pointer ${className ?? ""}`}
>
```

---

## C-16 — `CustomerLink` rendered without null guard in inbox-list ❌ FALSE POSITIVE

**File:** `src/components/dashboard/inbox-list.tsx:235, 265`
**Confidence:** 92 (was)

The original review claimed `<CustomerLink customerId={null}>` would render `/customers/null` or throw. **Verified false:** `CustomerLink` already handles null at `src/components/ui/customer-link.tsx:24` — `if (!customerId) return <>{children}</>;` returns plain text when no ID. No fix needed.

**Lesson logged:** Verify findings against actual implementation before fixing. Type-system-only reasoning can flag patterns that have runtime guards.

---

## C-17 — `uploadDviPhoto` has no server-side file size limit ✅ FIXED

**Files:** `src/lib/supabase/storage.ts:9-56`, `src/components/dvi/photo-upload.tsx:71-97`
**Confidence:** 88
**Fix shipped:** Two-layer size guard: (1) early-bail on base64 string length (`MAX_PHOTO_BASE64_LENGTH`) so we don't allocate a huge buffer for an oversized payload; (2) accurate check on `buffer.byteLength` after decoding. 5 MB cap (well above the 200-500 KB the client-side resize typically produces). Bonus: closed H-31 in the same edit — extension is now whitelisted to `jpg`/`png`. Validated by retroactive `feature-dev:code-reviewer`: caught an off-by-one in the base64 length formula (correct math is `ceil(bytes/3)*4`, not `ceil(bytes*4/3)`) — fixed. Also surfaced H-48 (pre-existing `sort_order` race in same function) — tracked separately.

Client resizes images to 1200px max at 80% JPEG quality (good). But `uploadDviPhoto` server action receives raw base64, decodes it to a `Buffer`, and uploads unconditionally — no max byte size check.

**User impact:** A malicious authenticated tech (or buggy client) could POST arbitrarily large base64 payloads, hitting Supabase's free-tier storage cap (500MB). Client-side resize is not a security boundary.

**Fix:**
```ts
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
if (buffer.byteLength > MAX_BYTES) return { error: "File too large (max 5 MB)" };
```

---

# HIGH

## H-1 — `updateJobFields` accepts `customer_id`/`vehicle_id` without validation

**File:** `src/lib/actions/jobs.ts:179-222`
**Confidence:** 85

`JobFieldPatch` includes `customer_id` (a UUID). The action blindly accepts any UUID and writes it. No check that the supplied `customer_id` exists in `customers`, no check that `vehicle_id` belongs to the supplied/existing `customer_id`. RLS doesn't enforce FK semantic validity.

**User impact:** Caller could orphan a job to an arbitrary customer ID, or pair a vehicle that belongs to a different customer.

**Fix:** Define `jobFieldPatchSchema` (zod). Verify target customer exists; if `vehicle_id` is also being set, verify it belongs to that customer.

---

## H-2 — `updateJobFields` empty-string-to-null applies to `customer_id`

**File:** `src/lib/actions/jobs.ts:201-222`

The blanket `typeof raw === "string" && raw.trim() === "" ? null : raw` rule applies to **every** editable key including `customer_id`. `customer_id` is typed non-nullable in `JobFieldPatch` but TypeScript can't stop a client from passing `""`.

**User impact:** Passing `{customer_id: ""}` would NULL the FK and detach the job from its customer.

**Fix:** Reject empty-string for required fields (`customer_id`, etc.) before coercion. Asymmetric with `customers.ts` which already has this guard.

---

## H-3 — `INSPECTION_CATEGORIES` Set is case-sensitive

**File:** `src/lib/utils/revenue.ts`

`category: "Inspection"` (capital I) is excluded from job revenue. `category: "inspection"` (lowercase) is **counted as revenue** AND double-counted with the inspections table revenue.

**User impact:** If a line item ever gets the lowercase variant, revenue numbers across dashboard + reports will be wrong.

**Fix:** Either lowercase the input before comparing (`.has(li.category?.toLowerCase() ?? "")`), or define `INSPECTION_CATEGORIES` as a typed union and enforce upstream.

---

## H-4 — `weekCompleted` derived from `monthCompleted` understates weekly revenue across month boundaries

**File:** `src/app/(dashboard)/dashboard/page.tsx:150-153`
**Confidence:** 88

```ts
const weekCompleted = monthCompleted.filter(j =>
  j.date_finished !== null && j.date_finished >= weekStart && j.date_finished <= weekEnd
);
```

`monthCompleted` is queried with `gte(monthStart)`. On any day in the first 6 days of a month, `weekStart` falls in the prior month — jobs completed in the prior month are excluded.

**User impact:** Weekly revenue KPI and `avgTicketWeek` understate during the first 6 days of every month. `lastWeekCompletedResult` is correctly a separate query, so only this week's slice is affected.

**Fix:** Add a dedicated `thisWeekCompletedResult` query (`gte(weekStart)`, `lte(weekEnd)`).

---

## H-5 — `StatusSelect` never calls `router.refresh()`

**File:** `src/components/dashboard/status-select.tsx:38-44`
**Confidence:** 92

`handleChange` calls the server action and shows a toast on success but never calls `router.refresh()`.

**User impact:** After a status change, `JobProgressStepper` (which receives `currentStatus` from server-rendered page props) stays showing the old status. The `StatusSelect` dropdown itself snaps back to the old value visually on next render because it's a controlled `<Select value={currentStatus}>` bound to the stale prop.

**Fix:** Add `const router = useRouter()` and `router.refresh()` inside the success branch of `handleChange`, matching the pattern in `JobTechEditor`.

---

## H-6 — `DeleteConfirmDialog` discards `onConfirm()` result

**File:** `src/components/dashboard/delete-confirm-dialog.tsx:34-39`
**Confidence:** 90

```ts
async function handleConfirm() {
  setLoading(true);
  await onConfirm();   // result is discarded
  setLoading(false);
  setOpen(false);      // closes regardless of error
}
```

`deleteCustomer` returns `{ error: "Cannot delete customer with active jobs" }`. The dialog closes silently.

**Fix:**
```ts
const result = await onConfirm();
setLoading(false);
if (result.error) { toast.error(result.error); return; }
setOpen(false);
```

---

## H-7 — `JobTitleEditor` `onBlur` + Enter both call `save()` → double-fire

**File:** `src/components/dashboard/job-title-editor.tsx:18-25, 33-37`

```tsx
onBlur={save}
onKeyDown={(e) => { if (e.key === "Enter") save(); }}
```

Pressing Enter calls `save()`, which calls `setEditing(false)`. Input unmounts. `onBlur` fires synchronously with the original (stale) closure where `saving === false`. Two `updateJobFields` calls dispatch with the same patch.

**User impact:** Doubled network traffic on every title save, two toasts. Same pattern in `JobDateEditor` (lines 35-37). Practical impact mild (idempotent), but visible.

**Fix:** Drop `onBlur={save}` and rely on explicit Save button + Enter, OR guard with `if (saving || !editing) return;` at top of `save()`.

---

## H-8 — `defaultVehicleId` pre-selection silently broken in job-form

**File:** `src/components/forms/job-form.tsx:147, 249-252`
**Confidence:** 90

`vehicle_id` is seeded in `useForm` defaultValues from `defaultVehicleId`, but `vehicles` state starts as `[]` and is only populated by a `useEffect` that calls `loadVehicles()` after first render. `selectedVehicle = vehicles.find(...)` against an empty array.

**User impact:** Pre-selected vehicle never appears in the "selected vehicle" chip. Users coming from a customer detail page (which links with `?vehicleId=...`) think no vehicle was pre-filled.

**Fix:** Initialize `vehicles` state with the job's vehicle parallel to how you seed `customers` from `job?.customers`, OR call `form.setValue("vehicle_id", defaultVehicleId)` inside `loadVehicles` when the data comes back if the current value matches the default.

---

## H-9 — `loadVehicles` is a stale closure in job-form

**File:** `src/components/forms/job-form.tsx:234-247, 711`
**Confidence:** 85

Plain `async function` inside the component body, reads `selectedCustomerId` from outer scope. Not `useCallback`. Suppressed `eslint-disable react-hooks/exhaustive-deps` on the effect at line 251 hides the issue.

**Fix:** Wrap in `useCallback` with `[selectedCustomerId]`. Remove the `eslint-disable`.

---

## H-10 — Vehicle "Change" button sets `field.onChange(undefined)` — split-brain with `null`

**File:** `src/components/forms/job-form.tsx:444-448`
**Confidence:** 85

When user clicks "Change", `field.onChange(undefined)`. The Select uses `value={field.value ?? "none"}` and `onValueChange` emits `null` for "none". So vehicle_id can be `undefined` (after Change) or `null` (after explicit "No vehicle"). Both are valid in the Zod schema.

**User impact:** RHF `isDirty` tracking considers the field changed when DB value is unchanged → phantom validation warnings.

**Fix:** Standardize on `null` for "no vehicle." Set `defaultValues.vehicle_id` to `null`. Always call `field.onChange(null)` in the Change button.

---

## H-11 — Customer search has no debounce or AbortController

**File:** `src/components/forms/job-form.tsx:195-231`
**Confidence:** 82

`useEffect` with `[customerSearch, pinnedCustomerId]` deps. Every keystroke fires Supabase. No cancellation — fast typing produces overlapping requests; whichever resolves last wins.

**User impact:** Stale results, request flood on slow connections.

**Fix:** Add 300ms debounce. Use AbortController, or compare the search string at resolution time.

---

## H-12 — Preset application is sequential and swallows partial failures

**File:** `src/components/forms/job-form.tsx:283-290`
**Confidence:** 82

After `createJob` succeeds, `applyPresetToJob` is called one-by-one. If any preset fails (toast shown), the code continues to the success toast and `router.push`.

**User impact:** Preset errors get drowned by the success toast and the navigation, partial application invisible.

**Fix:** Use `Promise.all` for parallelism. Block navigation until all complete. Surface aggregate "X of Y presets applied" warning.

---

## H-13 — `notes` field uses `{...field}` without `value ?? ""` guard

**File:** `src/components/forms/job-form.tsx:673-678`
**Confidence:** 80

`z.string().max(5000)` (no `.optional()`, no `.default("")`). `defaultValues.notes` is `job?.notes || ""`. Other fields in this form use `value={field.value ?? ""}` (e.g., `title` at line 496) but the textarea uses bare spread.

**User impact:** If RHF resets to `undefined` during a re-render or after a failed submit, textarea switches from controlled to uncontrolled (React warning).

**Fix:** `value={field.value ?? ""}` explicitly.

---

## H-14 — `useInlineEditor` has no in-flight save guard ✅ FIXED

**File:** `src/hooks/use-inline-editor.ts:27-43`
**Fix shipped:** Added `savingRef` synchronous guard. `commit()` returns `false` immediately if a save is in flight. Synchronous ref-based guard handles same-render-cycle calls (Enter+blur) that would race a `setState`-based guard. Closed alongside C-11.
**Confidence:** 85

`commit()` sets `saving = true` but nothing prevents `commit()` being called again before the first call resolves. Combined with H-7 (Enter + onBlur double-fire), two concurrent saves run.

**Fix:** Guard with `if (saving) return false;` at top of `commit()`. Add unmount guard via `useRef` to prevent setState on unmounted component.

---

## H-15 — `useInlineEditor`'s `D` generic is too permissive

**File:** `src/hooks/use-inline-editor.ts`

`D` is unconstrained. The `useEffect` resyncs draft via reference equality on `initial`. If a caller passes an object/array literal rebuilt per render (e.g., `{firstName, lastName}`), the effect fires every render and silently clobbers the user's draft.

**User impact:** This is why `customer-name-editor.tsx` and `job-customer-editor.tsx` rolled their own state — but the hook contract doesn't communicate this constraint.

**Fix:** Constrain `D` to primitive types, OR accept a custom `equals?: (a: D, b: D) => boolean` for object drafts.

---

## H-16 — `SaveResult` type union is non-disjoint and duplicated

**Files:** `src/hooks/use-inline-editor.ts`, `src/components/dashboard/notes-editor.tsx`

Defined identically in both files. Both arms of the union (`{ error?: unknown }` and `{ success: true }`) are mutually assignable because `error` is optional. TypeScript can't narrow the way the implementation pretends. `commit`'s contract relies on the runtime check `"error" in result && result.error`.

**User impact:** A future action returning `{ data, error }` would compile cleanly but break the hook's success path.

**Fix:** Define a discriminated `ActionResult` once in `lib/actions/types.ts`:
```ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
```
Retrofit action returns. Type `commit`'s `runSave` against it.

---

## H-17 — `CustomerNameEditor` doesn't use `useInlineEditor` → stale prop bug

**File:** `src/components/dashboard/customer-name-editor.tsx`
**Confidence:** 85

Manages its own `first`/`last` state with `useState(firstName)` / `useState(lastName)`. Unlike every other editor, it has no `useEffect` that syncs back to incoming props when not editing.

**User impact:** If `router.refresh()` brings new prop values (e.g., another session saves the name), local state stays stale.

**Fix:** Add equivalent prop-sync `useEffect`, OR refactor to use `useInlineEditor<{first, last}>` with a custom equality function (per H-15).

---

## H-18 — `JobVehicleEditor` queries Supabase directly from client component

**File:** `src/components/dashboard/job-vehicle-editor.tsx:47-56`
**Confidence:** 82

```ts
const supabase = createClient();  // browser client, anon key
const { data } = await supabase.from("vehicles").select(...)
```

Inconsistent with every other editor (which uses server actions). Whether this is a leak depends on RLS on `vehicles`.

**Fix:** Create `getVehiclesForCustomer(customerId)` server action; call from `useTransition`/async handler. Match `JobCustomerEditor`'s pattern.

---

## H-19 — `notes-editor.tsx` keyboard hint says only `⌘↵`

**File:** `src/components/dashboard/notes-editor.tsx:71`
**Confidence:** 80

The `onKeyDown` accepts both `e.metaKey` (Mac) and `e.ctrlKey` (Windows). The hint only shows `⌘↵`.

**User impact:** Broadway Motors runs Windows at the front desk. Staff won't discover Ctrl+Enter.

**Fix:** `Ctrl+↵ / ⌘+↵ to save · Esc to cancel`.

---

## H-20 — PostgREST `.or()` filter break on punctuation

**Files:** `src/lib/actions/customers.ts:25-32, 71-74`, `src/lib/actions/jobs.ts:62-67, 75-77`, `src/components/forms/job-form.tsx:212-214`
**Confidence:** 80

```ts
query.or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
```

User types `(`, `)`, or `,` (e.g., phone "(617) 555…") → PostgREST parses incorrectly → wrong results or 4xx.

Pre-existing pattern but PR widens blast radius (`searchCustomersForPicker` and `job-form.tsx` are new).

**Fix:** Strip/escape `(`, `)`, `,`, `*` from `trimmed` before interpolating, OR use multiple `.or` chains, OR normalize phone to digits before searching against a digits-only column.

---

## H-21 — Reports actions silently zero out on query failure

**Files:** `src/lib/actions/reports.ts:84-87, 442-453, 486-491, 522-528, 536-541, 627-631`, `category-trends.ts:111-122`, `tech-trends.ts:63`, `trends.ts:146-166`, `customer-insights.ts:49-63, 123-135`, `receivables.ts:48-54, 76-94`, `inspections.ts:11-16, 36-46`, `manual-income.ts:33-39, 44-52, 71-80`

Every report action destructures `{ data }` without checking `error`, defaults to `[]` or `0`.

**User impact:** Tax report could omit a month. Receivables could show $0 outstanding. Trends Explorer could show flat-zero buckets. Owner makes business decisions on bad data.

**Fix:** Throw on errors (let page-level error boundary catch) or return `{ ok: false, error }` discriminated union and render a banner.

---

## H-22 — Job-form silently swallows every Supabase error

**File:** `src/components/forms/job-form.tsx`

- Lines 178-191 `fetchDefaultCustomer` — error ignored; preselected customer doesn't appear
- Lines 195-230 `searchCustomers` — error ignored; "No customers found" on connection blip
- Lines 234-247 `loadVehicles` — error ignored; vehicle dropdown blank for a customer that has vehicles
- Lines 255-265 `loadTechnicians` — error ignored; tech dropdown empty so jobs created unassigned
- Lines 282-290 preset application — errors toasted per-preset but loop continues; partial application possible after job is created
- Lines 293-295 `updateQuoteRequestStatus` — result discarded; quote may stay "new" forever even after conversion

**User impact:** Worst-case: shop manager creates a job for the wrong customer (right one didn't appear), with no tech assigned (tech list silently failed), and the originating quote stays in "needs follow-up" queue.

**Fix:** Toast on each query error. Show retry affordance. Preset loop should surface aggregate "X of Y applied" summary.

---

## H-23 — Many `getXxx` functions return `null`/`[]`/`0` on error

**Files:** `customers.ts:77-90, 102`; `jobs.ts:108`; `invoices.ts:295, 308`; `estimates.ts:79, 94, 101`; `dvi.ts:213, 227, 253, 411-420, 442-446, 773-791, 793-811, 887, 990-1003`

Detail pages call `notFound()` when these return null.

**User impact:** A network failure renders a 404 page instead of a "couldn't load" error. User assumes the record was deleted.

**Fix:** Distinguish "not found" (`PGRST116`) from other errors; throw on the latter so an error boundary fires.

---

## H-24 — `createTeamMember` rollback unchecked; `deleteTeamMember` orphans auth users

**File:** `src/lib/actions/team.ts:64, 96-110`

- Line 64 rollback: `await admin.auth.admin.deleteUser(authData.user.id)` is awaited but error not checked → orphan auth account exists with no `users` row if rollback fails
- Lines 96-100: error from selecting `auth_id` ignored. If select fails, `user.auth_id` is undefined, auth account stays
- Line 109: `admin.auth.admin.deleteUser(...)` not error-checked. Manager thinks user is gone, but they can still log in

**Fix:** Check every error. On rollback failure, log the orphan ID for manual cleanup.

---

## H-25 — `startInspection` duplicate guard relies on silent error

**File:** `src/lib/actions/dvi.ts:97-104`

`existing` query has no error check. If lookup fails, code thinks no DVI exists and creates a duplicate.

**Fix:** Check error; abort with a clear message rather than risk a duplicate.

---

## H-26 — `deleteInspection` storage cleanup ignores failure

**File:** `src/lib/actions/dvi.ts:459-461`

```ts
if (photoPaths.length > 0) {
  await supabase.storage.from("dvi-photos").remove(photoPaths);
}
```

**User impact:** Storage failures leave orphaned photos that count against quota.

**Fix:** Check the result; log/return partial-success.

---

## H-27 — `sendInspection` recommendation updates not error-checked

**File:** `src/lib/actions/dvi.ts:498-509`

`Promise.all(recommendedItems.map(... .update(...)))` — individual update errors swallowed.

**User impact:** Some recommendation rows may fail to update; customer-facing approval page renders without those items, customer can't approve them.

**Fix:** Inspect each result; surface failures.

---

## H-28 — `approveRecommendations` link-back update unchecked ✅ FIXED (incidentally with C-5)

**File:** `src/lib/actions/dvi.ts:682-685`

`await admin.from("dvi_inspections").update({ job_id: newJob.id })` — error ignored.

**User impact:** Job created with line items, but inspection→job link missing. Phantom job with no DVI association.

**Fix shipped:** Now error-checked with `console.error` log. Function continues to insert line items into the local `jobId` variable so the customer's invoice is still correct, but the orphan-link condition is logged for shop follow-up. Closed alongside C-5.

---

## H-29 — `updateResult` and `completeInspection` skip ownership check

**File:** `src/lib/actions/dvi.ts:259-272, 274-375`
**Confidence:** 83

Both use `createClient()` (RLS) but neither checks the authenticated user owns/is assigned to the inspection. `startInspection` and `deleteInspection` both call `getCurrentUser()` — these don't.

**User impact:** If RLS on `dvi_results`/`dvi_inspections` is permissive (`auth.role() = 'authenticated'`), any logged-in tech can modify any inspection.

**Fix:** Add `getCurrentUser()` at the top of both. For `updateResult`, verify the result belongs to an inspection where `tech_id = user.id` or `user.role = 'manager'`.

---

## H-30 — Public `/inspect/[token]` returns customer PII via admin client

**Files:** `src/lib/actions/dvi.ts:242-255`, `src/app/inspect/[token]/page.tsx:46-48, 103-107`
**Confidence:** 80

`getInspectionByToken` uses `createAdminClient()` (bypasses RLS) and returns the full customer record including `phone` and `email`. Page renders only `first_name`/`last_name`, but the full object is in the RSC payload.

**User impact:** Currently no client component receives the data → no leak to bundle. But one accidental prop-pass away from exposing PII.

**Fix:** In `getInspectionByToken`, select only `id, first_name, last_name`.

---

## H-31 — File extension in DVI photo storage path is client-controlled ✅ FIXED (with C-17)

**File:** `src/lib/supabase/storage.ts:17-28`
**Confidence:** 85
**Fix shipped:** Extension whitelisted to `jpg`/`png`. Closed alongside C-17.

The storage path and content-type are derived from client-supplied `fileName`. Content-type is set to `image/jpeg` for any non-`png` extension; the storage path embeds the raw extension.

**User impact:** Limited (signed URLs, private bucket) but unclean.

**Fix:**
```ts
const safeExt = file.type === "image/png" ? "png" : "jpg";
const path = `${inspectionId}/${resultId}/${crypto.randomUUID()}.${safeExt}`;
```

---

## H-32 — `Button` base CVA uses `rounded-md` not `rounded-full`

**File:** `src/components/ui/button.tsx:8`
**Confidence:** 88

CLAUDE.md: "All buttons, inputs, and selects are `rounded-full` (pill-shaped) globally via base components." Base `buttonVariants` cva contains `rounded-md`. `icon-xs` size also hardcodes `rounded-md`.

**User impact:** Callers that don't override `className` get rectangular buttons — inconsistent with design system.

**Fix:** Change `rounded-md` → `rounded-full` in cva base. Same for `icon-xs`.

---

## H-33 — `SectionCard` description fails contrast on dark sidebar bg

**File:** `src/components/ui/section-card.tsx:47`
**Confidence:** 82

Description `<p>` uses `text-stone-500` against `bg-sidebar` (`#0F172A`). Stone-500 is ~`#79716b` → ~3.5:1 contrast. WCAG AA needs 4.5:1 for text-xs.

`dark:text-stone-400` addresses dark theme but light-mode case is the bug — `bg-sidebar` is always dark.

**Fix:** `text-stone-300` (or `text-slate-400`).

---

## H-34 — `sumJobRevenue` casts through `unknown`

**File:** `src/lib/utils/revenue.ts`

Takes `{ job_line_items: unknown }[]` and casts internally to `LineItem[]`. The `unknown` + cast defeats type safety.

**User impact:** Caller can pass `[{ job_line_items: 42 }]` — compiles, crashes at runtime.

**Fix:** Define `JobWithLineItems` type alias from Supabase generated types; use it both here and at callsites.

---

## H-35 — `formatDate`/`formatDateShort` not null-safe

**File:** `src/lib/utils/format.ts:56-66`
**Confidence:** 83

Typed `dateStr: string`. `formatDateLong` (line 78) correctly accepts `string | null` and guards. DB columns like `date_received`, `date_finished` are nullable; type-narrowing-via-Supabase-join is `string | null`.

**User impact:** `null` produces `"Invalid Date"` in UI or crashes inside `toLocaleDateString`.

**Fix:** Change signatures to `dateStr: string | null | undefined`, return `""` early when falsy. Match `formatDateLong`.

---

## H-36 — `breakdown.grossProfit` excludes inspection profit but `totalGrossProfit` includes it

**File:** `src/lib/actions/reports.ts:249-251, 357, 404, 427`
**Confidence:** 88

`grossProfit` (used in `breakdown`) excludes inspections. `totalGrossProfit` includes them. Inconsistent contract for callers.

**User impact:** UI components consuming `breakdown.grossProfit` for "total shop gross profit" understate when inspections present.

**Fix:** Audit callers; either include inspection profit in `breakdown.grossProfit` or rename to make scope explicit.

---

## H-37 — `getInboxTotalCount` count is inconsistent with `getInboxData`

**File:** `src/lib/actions/inbox.ts:250-280`
**Confidence:** 85

`getInboxData` post-filters parking service leads (excludes reservations where all interested services are completed) at lines 216-219. `getInboxTotalCount` doesn't apply the same exclusion.

**User impact:** Sidebar badge count higher than the actual count of actionable leads → permanently inflated badge.

**Fix:** Either accept slight overcount and document, or use `getInboxData`'s `counts.total` for the badge.

---

## H-38 — `JobCustomerEditor.handleSelect` ignores `searchCustomersForPicker` errors

**File:** `src/components/dashboard/job-customer-editor.tsx:55-64`

Same swallow pattern as `customers.ts:77`. Search results silently empty on failure.

**Fix:** Toast on error.

---

## H-39 — `quick-pay-form.handleCancel` reports cancel as success when API returns error

(See C-7 — listed under CRITICAL because it's a money-handling concern.)

---

## H-40 — `getJobs` category branch ignores subquery error

**File:** `src/lib/actions/jobs.ts:42-52`

`const { data: matchingJobs } = await ... from("job_line_items")...` — error not destructured. Failure → `matchingJobs` undefined → `jobIds = []` → returns no jobs.

**User impact:** Filtering by category appears to return no results when underlying query failed.

**Fix:** Check error; throw or return error state.

---

## H-41 — `getLineItemCategories` swallows error

**File:** `src/lib/actions/jobs.ts:255-262`

Failure → empty category list.

**Fix:** Check error.

---

## H-42 — `deleteCustomer` "active jobs" guard ignores its own error

**File:** `src/lib/actions/customers.ts:202-208`

`const { count } = await ...` — error not checked. If count query fails, `count` is null → guard passes → delete proceeds.

**User impact:** Could delete a customer that still has active jobs.

**Fix:** Check error before evaluating count.

---

## H-43 — `getOrCreateStripeCustomer` inline equivalent in `createInvoiceFromJob` not error-checked

**File:** `src/lib/actions/invoices.ts:146-149`

Different from the standalone `getOrCreateStripeCustomer` (which IS error-checked). The inline version skips checking the DB update error.

**User impact:** Invoice creation succeeds but `stripe_customer_id` doesn't persist → next invoice creates yet another duplicate.

**Fix:** Check `updateError`; surface.

---

## H-44 — `logInboundSMS` cannot distinguish DB failure from unknown sender ✅ FIXED

**File:** `src/lib/actions/messages.ts:192-196`
**Fix shipped:** Destructured `lookupError`. DB errors now return `"Customer lookup failed: <message>"` (transient, retry-able by webhook); missing customer still returns `"No customer found for this phone number"` (legitimate, drop the message). Both paths log via `console.error`/`console.log`. Closed alongside C-13.

`const { data: customer } = await ... .maybeSingle()` — error not destructured.

**User impact:** A transient Supabase error looks identical to "no matching customer" → inbound SMS dropped with `error: "No customer found for this phone number"`. Customer texts go missing during a database hiccup.

**Fix:** Destructure error; return distinct error code so webhook caller can retry/alert.

---

## H-49 — Six minor silent-failure patterns in messages.ts (NEW — surfaced during C-13 review)

**File:** `src/lib/actions/messages.ts`
**Confidence:** 75 (each individually low-impact; bundled here to track)

The C-13 reviewer enumerated patterns that aren't blockers but should be cleaned up in a future sweep:

- L77, L109 — `if (jobError || !job) return { error: "Job not found" }` collapses real DB errors into "not found." Same pattern H-44 just fixed for `logInboundSMS`. Repeated in `sendVehicleReadySMS` and `sendParkingSpecialsSMS`.
- L86, L114-115 — Dynamic `import()` calls not wrapped in try/catch. Rejection bubbles out uncaught.
- L170, L184 — `getCustomerMessages`/`getMessagesForJob` return error string but don't `console.error`. Server logs miss the DB error.
- L218 — `logInboundSMS` insert error returned to caller but not `console.error`-logged. Asymmetric with the new lookupError handling right above it.
- L62, L154 — `catch (err)` blocks return the error message but don't `console.error`. Quo API/network failures leave no log trace.

**Fix:** One-pass cleanup — add `console.error` to each, distinguish DB errors from "not found" in the two job/reservation guards.

---

## C-18 — Dashboard server component uses `createAdminClient()` (NEW — surfaced during C-9/C-10)

**File:** `src/app/(dashboard)/dashboard/page.tsx:28`
**Confidence:** 92

Same pattern as C-2 (which fixed it for inbox.ts). The dashboard server component uses `createAdminClient()` (service role, bypasses RLS) instead of `createClient()` (cookie-bound, RLS-respecting). Per CLAUDE.md and our anti-pattern rules: service role is API-routes-only.

**Fix:** Replace `createAdminClient()` with `await createClient()`. Verify RLS allows manager reads on all 11 tables touched (`jobs`, `daily_inspection_counts`, `quote_requests`, `estimates`, `dvi_inspections`, `parking_reservations`, `manual_income`).

---

## H-48 — `dvi_photos.sort_order` race on concurrent uploads (NEW — surfaced during C-17 retroactive review)

**File:** `src/lib/supabase/storage.ts:44-47` (in `uploadDviPhoto`)
**Confidence:** 85

The `sort_order` is computed by `SELECT COUNT(*) WHERE result_id = ?` and then inserted. If two photos upload concurrently for the same result, both COUNT queries can return the same value (e.g., 2) and both inserts write `sort_order: 2`. Pre-existing pattern, not introduced by C-17 fix.

**Fix:** Use a unique constraint or compute sort_order atomically (e.g., via INSERT...SELECT MAX(sort_order)+1 in a single statement). Tracked separately.

---

## H-47 — Inbox sidebar badge silently degrades with no user signal (NEW — surfaced during C-12 retroactive review)

**File:** `src/lib/actions/inbox.ts` (`getInboxTotalCount`), `src/app/(dashboard)/layout.tsx`, `src/components/layout/sidebar.tsx`
**Confidence:** 88

After C-12, `getInboxTotalCount` logs query failures via `console.error` but returns the partial count anyway. A manager whose session has expired (or whose RLS query fails for any reason) sees a "0" or undercounted badge with no indication anything is wrong, misses unpaid jobs / pending estimates.

**Fix:** Change return type to `{ count: number; degraded: boolean }`. Pass `degraded` to the Sidebar; render a small warning indicator (e.g., yellow dot or `?` next to the badge) when degraded. Until Sentry lands, this is the only in-app signal for transient query failures on the dashboard layout. Track for follow-up.

---

## H-46 — Multiple estimate actions have no auth check (NEW — surfaced during C-4 retroactive review)

**File:** `src/lib/actions/estimates.ts`
**Confidence:** 92

The C-4 retroactive review enumerated mutating server actions in `estimates.ts` that have no `requireManager()` check. Same class of bug as C-1.

- `sendEstimate` (line 121) — sends SMS + email to customer, mutates status. **Highest priority — external communication side effects.**
- `resendEstimate` (line 193) — same.
- `deleteEstimate` (line 380)
- `createEstimateLineItem` (line 409)
- `updateEstimateLineItem` (line 439)
- `deleteEstimateLineItem` (line 473)

**Fix:** Add `requireManager()` at the top of each. Same pattern as C-1.

**Other patterns in the file (not addressed by H-46):** Read-side helpers (`getEstimate`, `getEstimateForJob`, `getEstimateByToken`) return `null` on any error — silent-failure pattern (related to H-23). Dead import of `getOrCreateStripeCustomer` on line 10. Track for cleanup.

---

## H-45 — `useInlineEditor.commit` does not roll back optimistic state on error ⚠️ PARTIALLY FIXED

**File:** `src/hooks/use-inline-editor.ts:35-43`

On error, `commit` toasts but leaves `editing=true` and `draft` unchanged. Combined with C-11, throws leave the field stuck in "saving" forever.

**Status:** The "stuck in saving forever" part is fixed (C-11). The deeper UX concern — that the user has no way to recover their typed input after a server error other than cancelling (which discards it) — is unaddressed. Tracked separately for follow-up.

**User impact:** No path to revert the field to its server value without manually clicking Cancel — and Cancel loses their input.

**Fix:** Expose a `discard()` and a "retry" affordance after error. Optionally: on validation error keep draft; on unexpected error revert to `initial`.

---

# MEDIUM

## M-1 — `customer-list.tsx` desktop row only first cell is clickable (regression)

**File:** `src/components/dashboard/customer-list.tsx:59-82`
**Confidence:** 76

Master wrapped entire desktop row in a `<Link>`. Now only the first cell (Name) is wrapped. Clicking Email/Phone/Type cells does nothing. Hover styles still suggest the whole row is interactive. Mobile view unchanged.

Inconsistent with `jobs-list-view.tsx` (uses `<tr onClick>`).

**Fix:** Wrap `<tr>` in `onClick={() => router.push(...)}` and use `stopPropagation` on inner interactive elements, OR document the limitation.

---

## M-2 — `customer-search.tsx` debounce includes stale `searchParams` window

**File:** `src/components/forms/customer-search.tsx:11-34`
**Confidence:** 75

`searchParams` held in a ref. `useEffect` deps only `[search, updateSearch]`. Edge case: type then quickly switch tabs → URL briefly drops type filter if ref hasn't updated.

**Fix:** Add `searchParams` to deps, OR document.

---

## M-3 — `Input` uses `bg-stone-100` but CLAUDE.md says `bg-stone-50`

**File:** `src/components/ui/input.tsx:11`
**Confidence:** 82

Actual class is `bg-stone-100 dark:bg-stone-900`. CLAUDE.md says `bg-stone-50`. `SelectTrigger` (`select.tsx:40`) also uses `bg-stone-100`.

**Likely intentional drift.** Confirm with user, then update CLAUDE.md.

---

## M-4 — `parking-service-leads.tsx` renders email unconditionally

**File:** `src/components/parking/parking-service-leads.tsx:110-116`
**Confidence:** 85

```tsx
<span className="flex items-center gap-1">
  <Mail className="h-3 w-3" />
  {r.email}
</span>
```

Schema has email nullable for admin-created records. Other views null-guard email. This view doesn't.

**Fix:** `{r.email && (<span>...</span>)}`.

---

## M-5 — `action-center-card.tsx` links to `/inbox?tab=...` — verify route exists

**File:** `src/components/dashboard/action-center-card.tsx:117, 136`
**Confidence:** 85

Component appears to be a legacy version no longer used by the dashboard page (which renders inline `ActionRow` with direct links). But the file exists and is imported elsewhere.

**Fix:** Confirm `/inbox` route exists. Either delete `action-center-card.tsx` if unused, or fix the links.

---

## M-6 — `todayScheduled` is dead code

**File:** `src/app/(dashboard)/dashboard/page.tsx:121`

```ts
const todayScheduled = notStarted.filter(j => j.date_received === today);
```

Never referenced. Likely leftover from a removed "Today's Schedule" section.

**Fix:** Delete the line.

---

## M-7 — `DaysBadge` thresholds inconsistent

**File:** `src/components/ui/days-badge.tsx`

`days: number` accepts NaN, negatives, fractions. `warnAt` defaults to 3 but has no relationship to the hardcoded `7` red threshold — caller could pass `warnAt={10}` and the amber tier becomes unreachable.

**Fix:** Pass thresholds as `{ warn: number; danger: number }` with assertion `warn < danger`. Or validate at runtime in dev.

---

## M-8 — `INSPECTION_CATEGORIES` should be a typed union

**File:** `src/lib/utils/revenue.ts`

Currently `Set<string>` of magic strings.

**Fix:**
```ts
type InspectionCategory = "Inspection" | "State Inspection" | "TNC Inspection";
const INSPECTION_CATEGORIES: Set<InspectionCategory> = new Set([...]);
```

---

## M-9 — `INSPECTION_CATEGORIES` has no comment explaining business rule

**File:** `src/lib/utils/revenue.ts`

Encodes a business rule (revenue exclusion) used in two places. Worth a one-line WHY comment.

**Fix:** `// Inspection-category line items are excluded from job revenue to avoid double-counting (inspections table is the source of truth).`

---

## M-10 — `formatDateLong` doesn't force fixed timezone for ISO timestamps

**File:** `src/lib/utils/format.ts:80-86`

`new Date(dateStr)` parses as UTC, then `toLocaleDateString` uses local TZ. Late-evening ET timestamps may render as next day.

**Pre-existing pattern.** Flag for future audit.

---

## M-11 — `daysBetween` `Math.max(0, ...)` hides future-date data entry errors

**File:** `src/lib/utils.ts:27-39`

`from > today` is forced to 0. A job with `date_received` in the future shows "0 days" instead of negative.

**User impact:** Negative-aging may matter for fleet receivables. Silently hides data-entry errors.

**Fix:** Either return negative for future dates, OR document the floor and add a separate validator at data-entry time.

---

## M-12 — `customer-link.tsx` `customerId: string | null | undefined` runtime-only invariant

**File:** `src/components/ui/customer-link.tsx`

The "null id => no link" rule is enforced at runtime. A discriminated `{ customerId: string } | { customerId?: null }` would make the fallback explicit.

**Minor.**

---

## M-13 — `formatVehicle`/`formatCustomerName` use structural types instead of named aliases

**File:** `src/lib/utils/format.ts`

```ts
formatVehicle(vehicle: { year: number | null; make: string | null; model: string | null })
```

Fits any object with these fields. Hides the dependency.

**Fix:** Define `type VehicleSummary = Pick<Vehicle, "year" | "make" | "model">`. Use named alias.

---

## M-14 — `LineItem.total` typed `number` but DB column nullable

**File:** `src/lib/utils/revenue.ts`

`(li.total || 0)` guard implies type is lying.

**Fix:** Type as `number | null`; remove the lie.

---

## M-15 — `ClickableRow` `href` is `string` not branded `Route`

**File:** `src/components/ui/clickable-row.tsx`

Permits `""` or `"#"` (silent no-ops or broken nav).

**Fix:** Use `/${string}` template literal type or Next's typed routes feature.

---

## M-16 — `inbox.ts` uses `any[]` and `(dvi: any)`

**File:** `src/lib/actions/inbox.ts:187`

Pre-existing, violates "no `any`" project rule.

**Fix:** Type the rows from Supabase generated types.

---

## M-17 — `job-payment-footer.tsx` hardcoded hex colors

**File:** `src/components/dashboard/job-payment-footer.tsx:79`

`bg-[#0F172A]` and similar. Stitch design system uses `oklch()` tokens elsewhere.

**Mild inconsistency.** Replace with `bg-sidebar` or theme token.

---

## M-18 — `JobCustomerEditor` debounce-cancel error UX missing

**File:** `src/components/dashboard/job-customer-editor.tsx`

No AbortController or stale-result handling on customer search.

**Fix:** Match the fix from H-11 if you adopt a shared search hook.

---

# Comment Cleanup

These are all "delete or trim" items per the project's "no comments unless WHY is non-obvious" rule.

| ID  | File | Lines | Action |
|-----|------|-------|--------|
| CMT-1 | `src/components/dashboard/job-card.tsx` | 5589 | Delete `{/* Header — customer left, vital signs right */}` |
| CMT-2 | `src/components/dashboard/job-card.tsx` | 5652 | Delete `{/* Body — vehicle / title */}` |
| CMT-3 | `src/components/dashboard/job-card.tsx` | 5675 | Delete `{/* Footer — operational meta */}` |
| CMT-4 | `src/components/dashboard/line-items-list.tsx` | 7268 | Delete `{/* Category groups */}` |
| CMT-5 | `src/components/dashboard/line-items-list.tsx` | 7275, 7288 | Delete `{/* Category header */}` and `{/* Rows */}` |
| CMT-6 | `src/components/dashboard/line-items-list.tsx` | 7446 | Delete `{/* Totals */}` |
| CMT-7 | `src/components/ui/section-card.tsx` | 3-7 | Delete JSDoc on `SECTION_LABEL` (or trim to one line) |
| CMT-8 | `src/components/ui/section-card.tsx` | 11-15 | Delete JSDoc on `COLUMN_HEADER` (or replace with "must pair with dark bg") |
| CMT-9 | `src/components/ui/section-card.tsx` | 27-31 | Delete JSDoc on `SectionCard` |
| CMT-10 | `src/components/ui/section-title.tsx` | 11-16 | Delete JSDoc — names specific consumers ("first shipped on the Job Detail page") that will rot |
| CMT-11 | `src/hooks/use-inline-editor.ts` | 9-16 | ✅ FIXED — JSDoc deleted entirely (named the wrong consumer; rotted before merge) |
| CMT-12 | `src/components/dashboard/notes-editor.tsx` | 20-26 | Trim JSDoc to one line about Cmd+Enter shortcut, OR delete |
| CMT-13 | `src/components/ui/mini-status-card.tsx` | 48-52 | Delete JSDoc — names consumers that will rot |
| CMT-14 | `src/components/ui/clickable-row.tsx` | 11-15 | ✅ FIXED — trimmed to one sentence per the rule |
| CMT-15 | `src/components/ui/customer-link.tsx` | 13-17 | Drop function-level JSDoc; KEEP the `stopPropagation` prop comment (real WHY) |
| CMT-16 | `src/lib/utils/format.ts` | 76-77 | Trim to: `// Appends T00:00:00 to avoid UTC-midnight parsing shifting to the previous day in US timezones.` |
| CMT-17 | `src/components/forms/job-form.tsx` | 282 | Delete `// Apply selected presets` |
| CMT-18 | `src/components/forms/job-form.tsx` | 292 | Delete `// Mark quote request as converted` |

**Keep these (real WHY):**
- `src/lib/utils.ts:24-27` `daysBetween` JSDoc with DST/T12:00:00 explanation — keep as-is
- `src/lib/utils/format.ts:1` phone format comment — informational, fine

---

# Simplification Opportunities

## S-1 — JobForm and CustomerForm carry ~150 lines of dead "edit mode" branches

**Files:** `src/components/forms/job-form.tsx`, `src/components/forms/customer-form.tsx`

`/[id]/edit/page.tsx` routes were deleted (replaced by inline editors). But forms still have:
- `job` / `customer` props
- `isEditing` flags
- `updateJob` / `updateCustomer` imports + calls
- `job?.customers` seeding effect (lines 166-175)
- "edit mode" submit/redirect branches
- Redundant edit-only customer-search effect (lines 195-231) duplicating `searchCustomersForPicker`

**Fix:** Drop the props, the flag, both update actions from imports, the seeding effect. Rewrite `onSubmit` to handle creation only. Saves ~150 LOC.

---

## S-2 — Duplicated `DaysBadge` in `inbox-list.tsx`

**Files:** `src/components/dashboard/inbox-list.tsx:28-43` (local copy), `src/components/ui/days-badge.tsx` (canonical)

Inbox-list defines its own `DaysBadge` with identical tier logic.

**Fix:** Delete local copy; import from `@/components/ui/days-badge`.

---

## S-3 — `customer-name-editor.tsx` should use `useInlineEditor`

(See H-17.) Refactor with `useInlineEditor<{first, last}>`. Cuts ~25 lines and fixes the inconsistency the hook was created to solve.

---

## S-4 — `updateJobFields` + `updateCustomerFields` share patch-builder

**Files:** `src/lib/actions/jobs.ts:195-220`, `src/lib/actions/customers.ts:125-150`

Both iterate `EDITABLE_KEYS`, copy `key in patch` entries, coerce empty strings to null, bail if empty, call `.update().eq("id", id)`, revalidate paths.

**Fix:** Extract `buildPatch(patch, keys, transforms?)`. Customer's `phone` transform plugs into a `transforms` map. ~30 LOC saved.

---

## S-5 — `TypeChip` duplicates `TYPE_CONFIG` from `customer-type-editor`

**Files:** `src/components/dashboard/customer-list.tsx` (lines ~20-30), `src/components/dashboard/customer-type-editor.tsx`

Same colored capitalized type badge with slightly different "Retail" handling.

**Fix:** Move a single `<CustomerTypePill type fleetAccount? />` to `ui/`. Both consumers use it. Bonus: `SECTION_LABEL` is imported in `customer-list.tsx:4` but never used — drop.

---

## S-6 — Many hand-rolled `SectionCard`/`MiniStatusCard` clones

**Sampled:** `vehicle-section.tsx`, `customer-list.tsx`, `inbox-list.tsx`, `dashboard/page.tsx`, `parking/[id]/page.tsx`, `quote-requests/quote-request-list.tsx`, ~15 more.

Grep `bg-card border border-stone-200 ... rounded-lg shadow-sm` — 45 matches. Most are open-coded `SectionCard` shells.

**Fix:** Sweep where surrounding markup matches `SectionCard`. Headerless variants can use a smaller helper or `<div className={CARD_SHELL}>` constant.

---

## S-7 — Parking views should use `ClickableRow`

**Files:** `src/components/parking/parking-service-leads.tsx`, `parking-all-view.tsx`, `parking-today-view.tsx`

Already adopted `CustomerLink` with `stopPropagation`, but does navigation with `useRouter().push` on `<Card onClick>`. That's exactly what `ClickableRow` is for.

**Fix:** Replace with `<ClickableRow href={...}>` wrapping the card.

---

## S-8 — Job-form leftover eslint-disable + dead `category` field

**File:** `src/components/forms/job-form.tsx`

- Line 251: `// eslint-disable-next-line react-hooks/exhaustive-deps` — fix root cause (see H-9)
- `category` field still in `jobSchema` and `prepareJobData` even though it's deprecated and not used in the form

**Fix:** `useCallback` for `loadVehicles`. Drop `category` from schema/prepare.

---

## S-9 — `notes-editor.tsx` `BODY_CLASS` constant used once

**File:** `src/components/dashboard/notes-editor.tsx:18, 93`

```ts
const BODY_CLASS = "...";  // used once at line 93
```

**Fix:** Inline it.

---

## S-10 — Save/Cancel chevron pattern repeated 3 times verbatim

**Files:**
- `src/components/dashboard/customer-text-field-editor.tsx:64-77`
- `src/components/dashboard/job-mileage-editor.tsx:54-67`
- `src/components/dashboard/job-date-editor.tsx:43-56`

Check / X icon button pair with same green/stone colors, `disabled={saving}`.

**Fix:** Extract `<InlineSaveCancel onSave onCancel disabled />`. Each editor drops ~12 lines of JSX.

---

## S-11 — Possible JSX structural issue in `parking-service-leads.tsx`

**File:** `src/components/parking/parking-service-leads.tsx:134-137`

Orphan `</div>` placement after the diff — worth eyeballing for an actual structural bug.

---

## S-12 — `utils.ts` and `utils/format.ts` are NOT redundant

These are cleanly split (date/timezone vs. display formatters). Leave as-is. Listed here for clarity.

---

# Test Coverage Gaps

**No test infrastructure exists.** Recommendation: add **Vitest** (no jsdom needed for items T-1, T-2, T-7, T-8). Four pure-function utilities are zero-mock, single-file, would catch the highest-leverage bugs in <100 lines of test code.

## T-1 — `formatPhoneForStorage` edge cases

**File:** `src/lib/validators/customer.ts:17-24`

Customer SMS messaging breaks if phone gets corrupted. Edge cases not currently locked in: leading/trailing spaces, parens/dashes (returns garbage in fallback), 11-digit non-`1` international, already-E.164 strings (skips normalization), empty string after trim, literal `"0"` (passes guard, produces `"+10"`).

**Test:** Table-test on `formatPhoneForStorage` with inputs `("617-996-8371", "(617) 996-8371", "16179968371", "+16179968371", "996-8371", "  617 996 8371  ", "", "abc")`. Assert exact E.164 outputs. Plus integration: `updateCustomerFields({phone: "(617) 996-8371"})` writes `+16179968371`; `phone: ""` writes `null`.

---

## T-2 — `sumJobRevenue` / `calcInspectionRevenue` / manual-income utilities

**File:** `src/lib/utils/revenue.ts:16-60`

Single source of truth for dashboard + every report. Edges: jobs with `null` `job_line_items`, items with `category: null` (currently included — confirm intent), case-sensitivity (the Set is case-sensitive — see H-3), `total: null/undefined`, manual-income `shop_keep_pct: 0` and `100`.

**Test:** Pure unit tests with fixture jobs covering each branch. Lock in the case-sensitivity behavior so a future change is intentional.

---

## T-3 — `approveRecommendations` (DVI public approval)

**File:** `src/lib/actions/dvi.ts:623-758`

Unauthenticated, token-only endpoint, mutates jobs via admin client. Failure modes to lock in: invalid/expired token, wrong status (already approved — see C-5), wrong `send_mode`, job already complete or paid, `selectedResultIds` empty, IDs from a different inspection (cross-inspection injection), missing `customer_id` on standalone DVI, partial failure where job is created but line items fail (orphan job with no rollback).

**Test:** Mock admin Supabase client. Assert each guard returns structured `{error}`. Cross-inspection isolation. Insertion failure → auto-created job is deleted.

---

## T-4 — `updateJobFields` empty-string-to-null coercion

**File:** `src/lib/actions/jobs.ts:201-222`

(See H-2.) `customer_id: ""` would NULL the FK. `mileage_in: "123"` is passed as string to Supabase.

**Test:** Assert `updateJobFields(id, {customer_id: ""})` returns error. Assert `mileage_in: "123"` is rejected/coerced. Compare with customer's empty-string handling — symmetry check.

---

## T-5 — `useInlineEditor` draft-sync race

**File:** `src/hooks/use-inline-editor.ts:23-43`

Double-click on save → `runSave` should be called once (currently called twice — see H-14). Cancel after save error should restore `initial`, not failed draft.

**Test:** RTL test: render host component, simulate double-click on slow `runSave`, assert single call. Assert `cancel()` after error restores `initial`.

---

## T-6 — Inbox cache invalidation correctness

**File:** `src/lib/actions/inbox.ts`

`unstable_cache` keyed by name. Mutations in `dvi.ts`/`jobs.ts`/etc. don't reference the inbox key. Until 30s expires, inbox shows stale counts.

**Test:** Mock Supabase chain, call `getInboxData`, mutate a row, call again within 30s, assert result reflects mutation. (Currently won't — forces wiring up tag-based invalidation.)

---

## T-7 — `daysBetween` DST + edge cases

**File:** `src/lib/utils.ts:27-39`

`T12:00:00` choice fixes most DST. Inputs with timezone suffixes parsed differently. `Math.max(0, ...)` hides data entry errors (see M-11).

**Test:** Table tests for DST spring-forward (Mar 9 → Mar 10 = 1 day), pure date strings, ISO with Z, future-date input (assert returns 0 and document), null `from`.

---

## T-8 — `getJobs` search OR-filter

**File:** `src/lib/actions/jobs.ts:54-90`

(See H-20.) Search containing `,`, `)`, `*` corrupts OR expression.

**Test:** Searching for `"O'Brien"`, `"smith,jones"`, `")"` — does not throw, returns sensible results.

---

# What's Clean (verified safe)

These were checked and confirmed correct — no need to revisit:

- **Chat components** (`chat-input.tsx`, `chat-message.tsx`, `chat-messages-list.tsx`) — text-only rendering, no `dangerouslySetInnerHTML`, no XSS vector. Tool call names come from server tool defs, not stored user input.
- **Print page** (`/jobs/[id]/print/page.tsx`) — auth + RLS preserved, `notFound()` on missing job, no XSS surface.
- **Login page**, **header**, **sidebar** — pure style changes, no new auth surface.
- **`shop-settings-form.tsx`**, **`preset-form.tsx`** — server-action wiring intact, defensive number parsing.
- **`send-dvi-dialog.tsx`** — token generated server-side.
- **Quote request expand/collapse** — `MessageBlock` `isTruncated` state correct in both directions, message rendered as React text node (no XSS).
- **Parking lockbox display gating** — correctly shows only for `checked_out` status.
- **DST handling in parking `tomorrow` calculation** (`src/lib/actions/parking.ts:169-171`) — anchored at noon UTC, no DST bug.
- **Status filtering across parking views** — Today / Service Leads / All Reservations all correctly scoped.
- **N+1 queries on dashboard** — all 11 Supabase queries in single `Promise.all`, no loops.
- **`inspectionRangeStart` lexicographic sort** — safe on ISO date strings.
- **`vehicle-section.tsx` 260-line change** — inspection guards correct, `job?.ro_number` optional chain handles null jobs, no null-handling regressions.
- **`job-card.tsx` three-zone refactor** — `dvi_inspections` array-or-scalar guard correct, `job.customers` and `job.vehicles` null-guarded throughout, `formatMonthDay` handles ISO and plain date strings.
- **`customer-pagination.tsx`** — boundary conditions correct.
- **Revenue math** in dashboard otherwise correct (excluding the H-4 week-boundary bug).
- **`MiniStatusCard` accent type design** — `Record<Accent, string>` exhaustive map is the right call.
- **`CustomerTextFieldEditor`'s `Extract<keyof CustomerFieldPatch, ...>` pattern** — gold-standard type design. Should be applied to job editors (e.g., `JobTextFieldEditor` for `title`/`notes`/`mileage_in`).
- **Comment cleanup direction** — many useless dividers and "what" comments were correctly removed in this PR.

---

# Final Counts

- **Critical:** 17
- **High:** 45
- **Medium:** 18
- **Comment cleanup items:** 18
- **Simplification opportunities:** 12
- **Test coverage gaps:** 8

**Total findings:** 118
