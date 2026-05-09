---
name: sketch-flow
description: Force a state-machine sketch before writing async UI handlers in payment / state-machine code. Must be invoked before adding any new async handler that mutates existing state, especially in src/components/dashboard/{charge,terminal,quick-pay}-*, src/components/customers/payment-method-*, src/lib/actions/{charge-card-on-file,payment-methods,invoices,jobs}.ts, src/app/api/{stripe,terminal,cron}/**, or any file that interacts with Stripe / Quo / Resend / Supabase from a UI handler. Replaces "just start coding" with five minutes of state enumeration that prevents race conditions, lost-update bugs, and removed-safety-check regressions.
---

# /sketch-flow — State machine sketch before async UI code

Use BEFORE writing any new async handler in:
- `src/components/dashboard/{charge-card-on-file,terminal-pay,job-payment-footer}-button.tsx` and friends
- `src/components/customers/payment-method-actions.tsx` (AddCard / RemoveCard / SetupIntent flows)
- `src/components/dashboard/quick-pay/**`
- `src/lib/actions/{charge-card-on-file,payment-methods,invoices,jobs}.ts`
- `src/app/api/stripe/**`, `src/app/api/terminal/**`, `src/app/api/cron/**`
- Any file that calls Stripe / Quo / Resend / Supabase from a UI handler
- Any file with multiple `useState` hooks where a new async handler will mutate state

The output is a short sketch (markdown, in chat — no need to write to disk) the user reads BEFORE you write code. If you can't fill in every section, you're not ready to code.

## Required sections

### 1. State variables involved
List every `useState` / context / external state this handler touches. For each:
- Name
- Type
- Initial value
- Who else writes to it

For server actions: list every `from("table").select/insert/update/delete` call and the row-state shape that's read or written.

### 2. Transitions
Enumerate every state change this handler will cause. For each:
- Trigger (user click, async response, webhook, cron fire)
- New state values
- Side effects (API call, navigation, Sentry, revalidatePath, toast)

### 3. Concurrent input cases
For every async boundary in the handler, ask "what if X happens before this completes?" Enumerate at least:
- User clicks the same button again (rapid double-click) — does the `disabled={loading}` guard hold?
- User clicks a different button (Cancel mid-flight, swap Terminal for Charge Card)
- User navigates away
- User refreshes
- **The webhook fires before the action returns** (Stripe processes faster than our network round-trip — the chargeCardOnFile session 36 work hit this)
- A second cron delivery arrives while the first is still processing (the May 2026 webhook idempotency work was about this)
For each: what should happen?

### 4. Error paths
For every `await`, `fetch`, `try` block:
- What if it rejects?
- What Stripe error class does it throw — `StripeCardError`, `StripeInvalidRequestError`, `StripeConnectionError`, `StripeAPIError`? Each behaves differently on retry.
- What if it returns a non-OK status?
- What user-visible state should result?
- What goes to Sentry, with what `tags.source` (kebab-case, route-specific) + `extra` context?
- Is this a definitive failure (roll back local state) or ambiguous (leave state alone, let webhook reconcile)?

### 5. Safety checks being removed (if any)
If this change removes ANY of:
- A `disabled={...}` prop or double-submit guard
- An early `if (!X) return` (especially payment_status / status / customer_id / line items / shopSettings checks)
- An auth gate (`requireManager()`, `requireStaff()`)
- A duplicate-write guard (`existingInvoice`, idempotency key)
- A Stripe error class narrowing (`instanceof Stripe.errors.X`)
- A webhook signature verification or atomic-flip `.eq("status", invoice.status)` clause
- A try/catch wrapping a money path

Justify:
- What was the removed check protecting against?
- Is the protected condition still possible?
- If yes, what replaces the check?
- If no, why is it now impossible?

If you can't justify a removal, don't remove it. The pre-edit hook (`check-safety-removal.sh`) will block you from removing these patterns from sensitive paths without an explicit `// safety-removed: <reason>` marker.

### 6. Edge cases I keep getting wrong (ShopPilot-specific anti-patterns)

Apply against this specific change:

- **Silent fallback when settings/data is null** — Does this read `getShopSettings()` or another optional config without checking for null? `calculateTotals(items, null)` falls back to `DEFAULT_SETTINGS` (no shop supplies, no hazmat) and silently undercharges. Refuse to proceed when the config can't load.

- **Stripe error class assumptions** — Off-session SCA throws `StripeCardError` with code `invoice_payment_intent_requires_action` (NOT `authentication_required` — that's the direct PaymentIntent.confirm path). The wrapped invoice-pay error has a different code than the unwrapped one. Match BOTH or use the `SCA_REQUIRED_CODES` Set in `charge-card-on-file.ts`.

- **Webhook idempotency** — Stripe retries webhooks until 2xx. Two concurrent deliveries can both pass an early `if (status === "paid") return` guard. The atomic flip `.update({...}).eq("id", id).eq("status", invoice.status).select("id").maybeSingle()` then check `!updated` is the safe pattern. Don't ship a non-idempotent webhook handler.

- **Webhook-action race** — chargeCardOnFile inserts the local invoices row BEFORE calling `pay()`. The webhook can fire `invoice.paid` BEFORE `pay()` returns. If the action then errors after that point, don't void the invoice (it's already paid). Only `StripeCardError` triggers void+delete; everything else leaves state for the webhook to reconcile.

- **Stripe customer cross-mode contamination** — A `stripe_customer_id` created in test mode doesn't exist in live mode. If a customer record's stripe_customer_id was set during local dev (test keys) and the deploy uses live keys, every Stripe call will 404. New customers created post-cutover are fine; old ones may need their stripe_customer_id cleared.

- **AlertDialog controlled-open state** — `<AlertDialogAction onClick={(e) => { e.preventDefault(); handle(); }}>` suppresses Radix's default close-on-click. The async handler MUST call `setOpen(false)` explicitly after resolving (success AND failure). The dialog-stays-open-after-charge bug shipped to production once because of this.

- **Sentry `source` tag convention** — kebab-case, route-specific (`source: "stripe-webhook"`, `source: "charge-card-on-file"`, `source: "cron-health"`). NOT generic categories. Future routes copy this pattern.

- **Fire-and-forget `.catch(console.error)`** — these are the silent-customer-impact failures (receipt email never lands, SMS never sends). Add `Sentry.captureException(err, { level: "warning", tags, extra })` next to every `console.error` in fire-and-forget catch blocks.

## After the sketch

Show the sketch to the user. Get acknowledgment. Then implement.

If during implementation you discover the sketch was wrong (you missed a state, missed a concurrent case), STOP and update the sketch. Don't paper over it with code. The cost of pausing to fix the sketch is low; the cost of a race condition shipping to production is high.

## When NOT to invoke

- Pure UI tweaks (color change, copy fix, layout adjustment) without new async behavior
- Adding a new field to an existing form that already has a working onSubmit
- Read-only data fetching in a server component
- New tests that don't change production code
- Doc-only changes

The point is to catch state-machine complexity, not to gate every edit.
