---
name: post-deploy-check
description: Verify a production deploy actually shipped correctly. Runs after merging staging → master. Confirms the Vercel deploy completed, the production URL serves traffic, the new code is actually live (not stale CDN), DB migrations were applied, and (when wired) Sentry hasn't lit up. A successful `git push` is not the same as a working production app — this closes that gap. Includes the explicit rollback path.
---

# /post-deploy-check — Post-deploy verification gate

`git push origin master` returning success means GitHub accepted the
push. It says nothing about whether Vercel built it, whether the build
errored on a typecheck, whether `https://shop-pilot-rosy.vercel.app` is
serving the new code, or whether customers are hitting fresh errors.
This skill walks through those checks.

**When to invoke:**
- Immediately after merging `staging` → `master` and pushing
- Before declaring a release "done"
- When the manager reports something broken right after a deploy and
  you want to triage whether the deploy itself is the cause

---

## Step 1 — Confirm the merge actually pushed

Run these in parallel:

```bash
git rev-parse master                    # Local master commit
git rev-parse origin/master             # Remote master commit
git log -1 --format="%h %s" master      # Subject of latest commit
```

If local and remote diverge → push didn't take. Stop, tell the user, push again.

If they match → capture the SHA. The rest of the checks reference it.

---

## Step 2 — Vercel deploy status

Shop-pilot auto-deploys via Vercel's GitHub integration on every push
to `master`. The project is `shop-pilot` (not `broadway-motors-web`,
which is the public marketing site).

**Until a Vercel API integration is wired up:**

Tell the user to open `https://vercel.com/dashboard`, find the deploy
matching the SHA from Step 1 in the `shop-pilot` project, and confirm:

- ✅ Status: **Ready** (not Error / Canceled / Building still)
- ✅ Build time looks normal (typically 90–180s for this project — much
  longer suggests something stuck)
- ✅ No env-var warnings (especially `RESEND_API_KEY`,
  `STRIPE_SECRET_KEY`, `STRIPE_TERMINAL_READER_ID`,
  `QUO_*_PHONE_NUMBER`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`)

Common shop-pilot build-failure modes seen historically:
- TypeScript error in a path not exercised by `npx tsc --noEmit` locally
  (rare — strict mode catches almost everything; usually means a JSX
  expression that's only evaluated in prod)
- Generated `src/types/supabase.ts` polluted by CLI log lines (the
  `Initialising login role…` problem from prior sessions). If the build
  errors with "unexpected token" in supabase.ts, regenerate cleanly:
  `npx supabase gen types typescript --linked` and strip CLI noise.

If status is **Error** → fetch the Vercel build log (user pastes), find
the failing line. **Do not** rollback for a build error — the previous
deploy is still serving prod traffic. Just diagnose and re-push the fix.

**Future enhancement:** add `VERCEL_TOKEN` to `.env.local`, then this
step can run via `curl -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v6/deployments?projectId=<id>&sha=<sha>`.

---

## Step 3 — Production URL liveness

Production: `https://shop-pilot-rosy.vercel.app`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://shop-pilot-rosy.vercel.app/
curl -s -o /dev/null -w "%{http_code}\n" https://shop-pilot-rosy.vercel.app/login
curl -s -o /dev/null -w "%{http_code}\n" https://shop-pilot-rosy.vercel.app/dashboard
```

- `/` → 307 redirect to `/login` (or 200 if a session cookie was passed; for an unauthenticated curl, expect 307)
- `/login` → 200
- `/dashboard` → 307 redirect to `/login` (auth-required)

**Public surfaces** that must be 200 unauthenticated (these are what
customers actually see — most likely place a deploy hurts customers
directly):

```bash
# Public estimate approval page (404 expected for fake token, NOT 5xx)
curl -s -o /dev/null -w "%{http_code}\n" "https://shop-pilot-rosy.vercel.app/estimates/approve/fake-token-just-checking-liveness"

# Public DVI inspect page (same — 404 for fake token, not 5xx)
curl -s -o /dev/null -w "%{http_code}\n" "https://shop-pilot-rosy.vercel.app/inspect/fake-token-just-checking-liveness"

# Public quote-request endpoint (POST without body should be 4xx, not 5xx)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://shop-pilot-rosy.vercel.app/api/quote-requests"

# Public parking submit endpoint (same — POST without body should 4xx, not 5xx)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://shop-pilot-rosy.vercel.app/api/parking/submit"
```

Any 5xx → deploy is up but broken. Pull build logs (Step 2) and
consider rollback (Step 8). 4xx on the empty-POST endpoints is correct
(input validation rejected the empty body).

---

## Step 4 — Verify the new code is actually live (not stale CDN)

A 200 response says the URL is serving SOMETHING — not necessarily the
new code. To confirm the code shipped:

**Option A — string grep on a public page**
If the diff added a visible string, fetch the page and grep:
```bash
curl -s "https://shop-pilot-rosy.vercel.app/estimates/approve/fake-token" | grep -i "estimate not found"
```
For the FH-1 / MP-1 fix specifically: the post-approval card now reads
"the shop will reach out... You'll receive an invoice once the job is
complete." Grep prod for that specific string after a real estimate is
approved (or render the not-found page and verify the new copy is in
the bundle):
```bash
curl -s "https://shop-pilot-rosy.vercel.app/estimates/approve/fake" | grep -c "shop will reach out"
```

**Option B — behavioral test on an API endpoint**
If the diff tightened a Zod schema or auth guard, POST a payload that
the OLD code accepted but the NEW code rejects. A 400/403 confirms new
code is live.

For example, after the deleteJob payment-guard fix (MP-3), the AI
`delete_job` tool now refuses paid jobs. Easiest verification: ask the
AI in `/chat` to delete a paid test job and confirm it refuses with the
new error message.

**Option C — response header check (last resort)**
Vercel sets `x-vercel-deployment-url` and `x-vercel-id` on responses.
After Step 1 the value should reference the new deploy ID:
```bash
curl -sI https://shop-pilot-rosy.vercel.app/login | grep -i "x-vercel"
```

If you can't construct A or B, do C and visually compare to the deploy
in Step 2.

---

## Step 5 — Sentry error scan

Sentry is wired (project: `shop-pilot`, org: `shop-pilot`, tunnel route
`/monitoring`). Errors from prod auto-tag with the commit SHA via the
release config in `next.config.ts`.

- Open `https://shop-pilot.sentry.io/issues/`
- Set the env filter at top to **production**
- Set the time filter to **last 1h** (or wider if it's been a while)
- Look for issues with **First Seen** matching the deploy timestamp from
  Step 1 — those are net-new since this deploy
- Bonus: filter by `release:<sha>` to scope to *just* this deploy's
  errors. The release tag is the commit SHA from Step 1.

If a new error type appears that didn't exist before this deploy AND
the file in the stack trace overlaps the diff → strong signal the
deploy caused it. Rollback (Step 8), debug after.

Also still worth a glance:
- Vercel's runtime logs (Project → Deployments → click deploy → Runtime
  Logs) — captures `console.error` and infra-level errors that may not
  reach Sentry (e.g., env var missing during cold start)

---

## Step 6 — DB migration verification (if applicable)

If the diff includes `supabase/migrations/*.sql`:

Migrations are **not** auto-applied on Vercel deploy. They're applied
manually via `npx supabase db push` from local (linked to the prod
project) before the deploy goes out. Verify by querying:

```sql
-- For the most recent shipped migration (estimates_first_class):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'estimates'
  AND column_name IN ('customer_id', 'vehicle_id', 'estimate_number', 'approval_method', 'approved_by_user_id');
```

Expected after that migration:
- `customer_id` → uuid, NOT NULL
- `vehicle_id` → uuid, NULLABLE
- `estimate_number` → bigint, NULLABLE
- `approval_method` → text, NULLABLE
- `approved_by_user_id` → uuid, NULLABLE

If columns are missing, the deploy will hit "column does not exist"
errors at runtime. Apply the migration immediately, or rollback the
code deploy if customers are blocked.

---

## Step 7 — Customer-facing soak (10 minutes)

Watch the public surfaces and the most-stress-tested internal flows:

- Open `https://shop-pilot-rosy.vercel.app/estimates/approve/<real-sent-token>` in a browser, click Approve, verify the "shop will reach out" copy renders (MP-1 regression check)
- Hit `/inspect/<real-token>` for a recent DVI; click around
- Have the user open `/dashboard` and walk through 1-2 active jobs to confirm nothing visibly errors
- For payment-touching changes specifically: run a $1 test charge via Quick Pay (test mode reader, test card)

If anything looks off, bias toward rolling back. Shop manager retries on
mobile when something is glitchy — a broken estimate or unsendable
invoice during business hours is a real ops disruption.

---

## Step 8 — Rollback path (when needed)

The full rollback procedure for shop-pilot:

```bash
# 1. Identify the merge commit on master that was just deployed
git log --oneline master | head -5

# 2. Revert it (creates a new commit that undoes the merge)
git revert <merge-sha>

# 3. Push — Vercel auto-deploys the revert
git push origin master
```

After the push:
- Watch Vercel for the revert deploy to go Ready (~2-3 min)
- Re-run Step 3 + Step 4 against the now-reverted prod
- Schema rollbacks (DB migrations) are NOT automatic. If the diff
  included a migration, decide separately whether to apply a down-
  migration. For shop-pilot, prefer **forward-fix** — most migrations
  here are additive and don't strictly require unwinding.

**Don't run `git revert` without telling the user first.** Even when
prod is broken, the user should confirm the revert plan before it ships
(they may prefer a forward-fix for a known small bug).

---

## Step 9 — Doc audit (always — this is the recurring ritual)

Future sessions only have what's in CLAUDE.md, PROGRESS.md, memory, and
the code itself. If a feature shipped without the docs catching up,
the next session walks in blind. Audit and update on every successful
deploy.

Walk this checklist against the just-shipped diff (`git diff <prev-master>..HEAD`):

1. **`shop-pilot/PROGRESS.md`** — does the latest session entry cover
   what shipped? If you just merged a feature that took multiple
   commits, write a Session N entry summarizing the threads, decisions,
   and any non-obvious architecture (so the next session doesn't have
   to git-archaeology the same path).

2. **`shop-pilot/CLAUDE.md`**:
   - **Database Schema** — every new column / table mentioned?
   - **Current Status** — Session N line added? Production-readiness
     items checked off if applicable?
   - **Tech Stack / API integrations** — new third-party SDKs listed?
   - **Anti-patterns / Investigation Discipline** — any new failure
     mode worth pinning so it's caught next time?

3. **User memory** (`~/.claude/projects/.../memory/`):
   - Reference memories (`reference_*.md`) — any new third-party setup
     where the credentials/configuration live outside the codebase?
     (e.g., Sentry auth token in Vercel env, not in any tracked file.)
   - Project memories (`project_*.md`) — any non-obvious architecture
     decision the next session would re-derive incorrectly? (The May
     2026 "no /jobs/[id]/edit page, all editing inline" rediscovery
     is the canonical example — wasted half an hour because it wasn't
     written down anywhere.)
   - Stale entries — anything claimed by an existing memory that's
     now wrong or outdated? Update or delete.
   - `MEMORY.md` index — pointers to any new entries?

4. **`shop-pilot/REVIEW-FINDINGS.md`** — if this deploy involved a
   review pass that surfaced findings, log them. The point is patterns
   over time, not single-session minutiae.

5. **`shop-pilot/UI-AUDIT.md`** — same logic for UI consistency
   findings, if applicable.

If anything was stale or missing, **fix it now and commit the doc
update with `[skip-review]`**. Don't defer.

If everything is current, say so explicitly in the Step 10 report so
the user trusts the audit happened, not just that nothing was changed.

---

## Step 10 — Report

Summarize each step with ✅ / ❌ / ⚠️ + a one-line note. End with one of:

- ✅ **"Deploy verified — production healthy on `<sha>`"**
- ❌ **"Deploy has issues — rollback initiated / pending decision"**
- ⚠️ **"Deploy live but inconclusive — N checks couldn't run, manual verification recommended"**

If anything was rolled back or hit production, log the incident in
`REVIEW-FINDINGS.md` under a new entry — the next `/scoped-review merge`
should incorporate the lesson.

---

## Don't

- Don't declare a deploy verified until prod URL liveness (Step 3) AND
  new-code-is-live (Step 4) both pass. Vercel "Ready" is necessary but
  not sufficient.
- Don't run this against staging — staging gets `/verify-flow` and
  `/scoped-review`. Production-only here.
- Don't `git revert` without explicit user confirmation, even for a
  visibly broken prod. Their call.
- Don't substitute this for monitoring. Once Sentry is wired, it's
  daily; this skill is the deploy gate, not ongoing observability.
- Don't skip the Vercel dashboard step just because the URL returns
  200. A 200 from the previous deploy still happens during a new build.
