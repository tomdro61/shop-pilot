---
name: scoped-review
description: Scoped multi-agent code review. Looks at the diff, picks the right reviewers based on what changed, dispatches them in parallel, returns consolidated findings. Use before declaring features done, before commits, and before merging staging → master.
---

# /scoped-review — Scoped multi-agent code review

You are the dispatcher for a scoped code review. Your job:
1. Figure out what changed
2. Match changes against the routing matrix below
3. Dispatch only the relevant agents in parallel
4. Consolidate their findings into a triaged report

**Do not run all 12 agents by default.** That's wasteful and noisy. Match the scope to the change.

---

## Step 1 — Determine the diff scope

Parse the user's argument (passed as `$ARGUMENTS`):

| User invocation | Diff to review | Use case |
|---|---|---|
| `/review` (no arg) | `git diff` (uncommitted working tree) | Most common — "check the work I just did" |
| `/review staged` | `git diff --staged` | Pre-commit check |
| `/review feature` | `git diff master...HEAD` + uncommitted | "Review everything I've done on this branch" |
| `/review merge` | `git diff master...HEAD` + uncommitted, **all 12 agents** | Pre-merge to master — full sweep |
| `/review <ref>` | `git diff <ref>...HEAD` + uncommitted | Custom diff range |

Run `git diff --name-only <scope>` first to get the file list. If empty, tell the user there's nothing to review and stop.

---

## Step 2 — Categorize the change

For each changed file, classify it. A file can match multiple categories. Maintain a set of categories triggered:

| File pattern | Category |
|---|---|
| `src/lib/actions/**/*.ts` | `server-actions` |
| `src/hooks/**/*.ts` | `hooks` |
| `src/middleware.ts`, `src/lib/auth*.ts` | `auth` |
| `src/components/ui/**/*.tsx` | `ui-primitives` |
| `src/components/forms/**/*.tsx` | `forms` |
| `src/lib/utils/**/*.ts`, `src/lib/utils.ts`, `src/lib/validators/**/*.ts` | `pure-utils` |
| `src/app/(dashboard)/**/page.tsx` | `dashboard-pages` |
| `src/app/api/**/route.ts` | `api-routes` |
| Anything not covered + line count > 50 | `general` |

Also scan the diff for these *content* triggers (use `git diff <scope>` and grep):

| Diff content pattern | Category |
|---|---|
| Adds/modifies `try { ... } catch`, `.catch(`, or `{ data }` from supabase without `error` | `silent-failure-risk` |
| Adds new `interface`, `type`, or generic `<T>` declarations | `new-types` |
| Adds JSDoc comments (`/** ... */`) or `// ... ` blocks | `comments` |
| Adds files (vs. modifying) | `new-files` |
| Modifies `package.json`, `next.config`, `tsconfig`, `globals.css`, design tokens | `config-or-design` |

Total line count > 200, OR `/review merge`: trigger `full-sweep` (all 12 agents).

---

## Step 2.5 — Expand scope for schema / column-impact changes

The diff alone misses consumers of changed columns. Reviewers can flag what they see — they can't flag the AI tool definition that silently drops a new column, or the report query that doesn't pull a renamed field. This step adds those consumers to the review scope.

**Trigger**: the diff includes ANY of these:
- A new file under `supabase/migrations/*.sql`
- An `ALTER TABLE ... ADD COLUMN` / `DROP COLUMN` / `RENAME COLUMN` in any migration
- A change to `src/types/supabase.ts` that adds/removes/renames a `Row`/`Insert`/`Update` field
- A change to a server-action `.insert()` / `.update()` payload that adds/removes a key

**What to do**:

1. **Identify the affected columns** — read the migration SQL (or the supabase.ts diff). For each column added/changed/removed, capture the column name(s).

2. **Grep for consumers** of each column across the codebase. Targets:
   - `.<col>` accessor patterns (`row.cost`, `item.cost`)
   - String literals matching the column name in `.select()` calls (`select("...cost...")`)
   - Field names in form schemas (`src/lib/validators/**`)
   - Field names in AI tool definitions (`src/lib/ai/tools.ts`) AND handlers (`src/lib/ai/handlers.ts`)
   - Field names in report aggregations (`src/lib/actions/reports*.ts`, `trends*.ts`)
   - Field names in print/PDF/email templates that render the row (`src/lib/resend/templates.ts`, `/print` pages)
   - Field names in CSV/JSON export routes (`src/app/api/**/export/route.ts`)

3. **Add consumer files to the review scope** — pass them to the dispatched agents as additional files-to-read, not just as files-changed. The agent's job is now: "review the diff PLUS verify these consumers handle the schema change correctly (e.g., the AI tool accepts the new column, the report includes it, the export emits it)."

4. **If the column is being added** (most common case): the question for each consumer is "should this consumer ALSO write/read this column now that it exists?" Forgetting to update the AI tool surface is the canonical failure mode this catches (today's Session 38 cost-on-estimates work shipped without `cost` on `create_estimate_line_item` — a real bug caught in retrospective by exactly this grep).

5. **If the column is being renamed/removed**: the question is "does this consumer reference the old name and need updating?" A reference that wasn't in the diff is a runtime bug waiting to happen.

This step EXPANDS scope; it doesn't change agent routing. Same agents still dispatch based on file pattern + content triggers above. The expanded file list goes into their prompts.

---

## Step 3 — Choose agents

For each triggered category, dispatch the matching agents. **Deduplicate** — if two categories both want `silent-failure-hunter`, run it once.

| Category | Agents to dispatch | Focus prompt |
|---|---|---|
| `server-actions` | `pr-review-toolkit:silent-failure-hunter`, `feature-dev:code-reviewer` | Auth checks (every mutation must call `requireManager()` from `src/lib/auth.ts` or document why), input validation, `revalidatePath` vs `revalidateTag` correctness, RLS bypass via service role |
| `hooks` | `feature-dev:code-reviewer`, `pr-review-toolkit:type-design-analyzer` | Race conditions on concurrent calls, stale closures, unmount guards, generic constraints, state-machine completeness |
| `auth` | `feature-dev:code-reviewer` | Auth bypass paths, role checks symmetric, no `createAdminClient` in server actions, middleware matcher coverage |
| `ui-primitives` | `feature-dev:code-reviewer`, `pr-review-toolkit:type-design-analyzer` | A11y (every interactive element keyboard-reachable: `role`, `tabIndex`, `onKeyDown`), design-system consistency (`rounded-full`, `bg-stone-50`, etc. from CLAUDE.md), prop encapsulation |
| `forms` | `feature-dev:code-reviewer` | Form-state correctness (controlled vs uncontrolled, default values, dirty tracking), submit double-fire guards, validation error surfacing, mobile responsiveness |
| `pure-utils` | `pr-review-toolkit:type-design-analyzer`, `pr-review-toolkit:pr-test-analyzer` | Null-handling, edge cases (empty, zero, negative, NaN), case-sensitivity, date/timezone correctness. Suggest tests. |
| `dashboard-pages` | `feature-dev:code-reviewer` | Caching strategy (`unstable_cache` cache-key + invalidation), N+1 queries, server vs client component split, error handling for parallel `Promise.all` |
| `api-routes` | `feature-dev:code-reviewer`, `pr-review-toolkit:silent-failure-hunter` | Webhook signature verification, CORS, rate limiting, input validation, authorization |
| `silent-failure-risk` | `pr-review-toolkit:silent-failure-hunter` | (Use the agent's default prompt) |
| `new-types` | `pr-review-toolkit:type-design-analyzer` | (Use the agent's default prompt) |
| `comments` | `pr-review-toolkit:comment-analyzer` | (Use the agent's default prompt) |
| `general` | `feature-dev:code-reviewer` | General correctness, project conventions |
| `config-or-design` | `feature-dev:code-reviewer` | Build implications, design-system token consistency |
| `new-files` | (already covered by category-specific dispatches) | — |

**Special: `full-sweep`** — dispatch all 12 reviewers used in the original `/review` session (the 13-agent fan-out documented in `REVIEW-FINDINGS.md`). Use that file as the template if you need to recreate the prompts.

---

## Step 4 — Dispatch in parallel

Send all matched agent invocations in **a single message with multiple Agent tool calls** so they run concurrently. Use `run_in_background: true`.

Each agent prompt must include:
- The diff scope (e.g., `git diff master...HEAD -- <files-in-this-category>`)
- Project context (Next.js 16 App Router, Supabase, TypeScript strict, see `shop-pilot/CLAUDE.md`)
- The focus prompt from the matrix above
- Instruction to report **high-confidence findings only** with severity (Critical/High/Medium), file:line, and suggested fix
- Instruction to **distinguish "introduced by this diff" vs "pre-existing bug"** for each finding. Pre-existing bugs are real and worth knowing about, but they're a different scope decision (separate fix, separate ticket) than the changes in flight. Without this separation, the operator doesn't know which findings block the current work.

---

## Step 4.5 — Money-feature completeness checklist (when applicable)

If the diff touches any payment/money path, also include a completeness pass: which money-adjacent surfaces consume the same data and might also need updating? This catches "we updated the create flow but missed the analytics card that reads the same field."

**Trigger**: the diff touches any of these:
- `src/lib/actions/charge-card-on-file.ts` / `src/lib/actions/payment-methods.ts`
- `src/lib/actions/invoices.ts` / `src/lib/stripe/**`
- `src/app/api/stripe/webhooks/route.ts` / `src/app/api/terminal/**`
- `src/lib/utils/totals.ts` / `src/lib/utils/revenue.ts`
- `src/app/(dashboard)/quick-pay/**`
- New columns on `jobs.payment_*`, `invoices.*`, `job_line_items.cost`, etc.

**The checklist** — when adding/changing a money-related field or flow, did this diff also handle:

1. **Webhook handler** (`src/app/api/stripe/webhooks/route.ts`) — does the corresponding `invoice.paid` / `payment_intent.succeeded` branch read or write the changed field? Receipt email, customer SMS, internal-notify SMS?
2. **Reports** (`src/lib/actions/reports.ts`, `trends.ts`, `tech-trends.ts`, `category-trends.ts`, `src/app/api/reports/export/route.ts`) — revenue, profit margin, tax, service mix, tech scoreboard — do any aggregate against the changed field?
3. **Customer detail page financial snapshot** — lifetime spend, outstanding balance, last visit, avg RO. Any of these need to reflect the change?
4. **Dashboard KPI strip** — Today's Revenue / Week / Month / Outstanding A/R cards. Do they include this?
5. **Job detail invoice/estimate sections** — InvoiceSection, JobPaymentFooter, EstimateSection — do they display the changed field?
6. **Print views** — `/jobs/[id]/print`, estimate PDFs — does the document show the changed field?
7. **Email/SMS templates** (`src/lib/resend/templates.ts`, `src/lib/messaging/templates.ts`) — receipt email, payment confirmation SMS, invoice link — do these need updating?
8. **AI tool surface** (`src/lib/ai/tools.ts` + `src/lib/ai/handlers.ts`) — can the manager interact with this field via chat? Mirror the corresponding job-or-estimate tool definition.
9. **Validators** (`src/lib/validators/**`) — schema accept the new field, server enforce parts-only if applicable.
10. **Audit trail** — if there's an `audit_log` entry that should reference this field, is it captured?

For each item that's relevant but NOT touched by the diff, either include the file in review scope (per Step 2.5) OR note as "deliberately out of scope" in the consolidation report.

---

## Step 5 — Consolidate

As each agent reports back (via task notifications), keep a running consolidated list. When all are in:

1. Group findings by severity (Critical / High / Medium)
2. Deduplicate (same file:line from multiple agents → one entry, note both sources)
3. **Tag each finding with origin: "(this diff)" vs "(pre-existing)"** based on what the agent reported. If unclear, ask the agent or check `git blame`. Pre-existing bugs go in their own subsection of the report so the operator doesn't conflate "introduced by my work" with "found while reviewing my work but is older." Both are worth fixing, but the scope decisions are different.
4. Recommended fix order (top 5-10), introduced-by-this-diff items prioritized over pre-existing ones (since the introduced ones MUST be fixed before merge; pre-existing ones can be a separate follow-up).
5. End with a one-line verdict: "Ready to merge" / "Fix N criticals before merge" / "Significant rework needed"

---

## Step 5.5 — Critical-finding gate (HARD STOP, do not skip)

**If ANY finding has severity Critical AND was introduced by this diff** (vs. pre-existing — see Step 5 tag), STOP. You may not proceed to Step 6 (marker write) until:

1. Every introduced-Critical is fixed in code (not deferred to a follow-up commit)
2. The fixes themselves get a verification pass — re-dispatch the relevant subset of agents (typically 1-2 focused agents on the files that changed in the fix) against the new HEAD
3. The verification pass returns CLOSED on each Critical OR explicitly rejects-and-explains any that the operator chose not to fix

This rule existed implicitly in Step 6 ("if the review surfaced Criticals... do NOT write the marker yet — fix the criticals first, then re-run this skill against the new HEAD"). The May 2026 sessions kept finding Criticals that the operator wanted to defer "as a follow-up." That route ships broken code. The hard gate is: fix → verify → marker. No "ship the Critical and patch tomorrow."

Pre-existing Criticals (not from this diff) are NOT subject to this gate. Log them, decide separately, but they don't block the current marker write.

---

## Step 6 — Write the review marker (REQUIRED, even if findings are clean)

The pre-push hook (`.claude/hooks/scoped-review-required.sh`) BLOCKS `git
push` unless `.scoped-review-marker` at repo root contains the current HEAD
SHA. After Step 5 finishes, write that marker with a Bash call:

```bash
git rev-parse HEAD > .scoped-review-marker
```

This unlocks pushing. The marker becomes stale automatically on the next
commit, so every batch of work earns its own review pass.

If the review surfaced Criticals you're going to fix in a follow-up commit,
do NOT write the marker yet — fix the criticals first, then re-run this
skill against the new HEAD.

---

## Don't

- Don't run agents serially. Always parallel.
- Don't run `full-sweep` unless the diff is huge (>200 lines) or the user explicitly invoked `/review merge`.
- Don't run agents for empty / trivial diffs (whitespace, doc-only, single-line fixes).
- Don't summarize findings beyond what the agents reported. You're a router, not a reviewer.
- Don't forget: agents have no conversation context. Every prompt must be self-contained.

---

## Example dispatch decisions

**Diff: 30 lines, modified `src/lib/actions/jobs.ts`**
Categories: `server-actions`, `silent-failure-risk` (if any `{ data }` patterns)
Agents: `silent-failure-hunter`, `feature-dev:code-reviewer` (auth focus)
**2 agents.**

**Diff: 80 lines, new file `src/components/ui/data-table.tsx` + modified existing UI primitives**
Categories: `ui-primitives`, `new-types`, `new-files`
Agents: `feature-dev:code-reviewer` (a11y), `type-design-analyzer`
**2 agents.**

**Diff: 500 lines across 15 files, mixed**
Trigger: `full-sweep` (>200 lines)
**All 12 agents.**

**Diff: 5 lines, fixed a typo in JSX**
**0 agents.** Tell the user it's too small to review.
