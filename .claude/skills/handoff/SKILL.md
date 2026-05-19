---
name: handoff
description: End-of-session handoff. Audits the working-directory docs (PROGRESS.md, SHOPPILOT_ROADMAP.md, ARCHITECTURE.md, DATABASE_SCHEMA.md) against actual code state — does each migration the roadmap mentions exist, does each "shipped" feature actually render, did this session ship something that nobody marked off. Drafts the PROGRESS.md entry and proposes roadmap/architecture checkbox updates, waits for user approval before writing. Run when wrapping up a session or after any milestone the user wants captured.
---

# /handoff — Session handoff with doc reconciliation

The standing problem: PROGRESS.md captures *what we did*, but the roadmap / architecture / schema docs drift out of sync because nobody audits them against the code. The May 2026 stale-checklist incident (Phase 0 items shown as open when three were actually shipped — estimate decoupling, Today section, customer-spine redesign) was the trigger for this skill.

The job here is **reconcile docs with reality**, not just write a session log.

---

## When to invoke

- Wrapping up a session (the literal handoff case)
- After a milestone that touched architecture (new migration, new feature shipped, feature retired)
- When the user says "let's catch the docs up"
- When the user is about to relay roadmap status to someone else and you suspect drift

Do NOT invoke for typo fixes, single-line bug fixes, or anything `[skip-review]` would also apply to. That's noise.

---

## Step 1 — Scope the session

```bash
git log --oneline -20
git log --since="<last PROGRESS.md entry date>" --stat
git status
```

- **What commits since the last PROGRESS.md entry?** Find the date of the most recent PROGRESS.md session header and diff from there.
- **What's uncommitted?** Note for the "in progress" section of the new entry, or push first if the user wants it shipped.
- **What branches involved?** Was it all staging, or did anything go straight to master?

If nothing has changed since the last PROGRESS.md entry, stop and tell the user there's nothing to hand off.

---

## Step 2 — Audit the roadmap against code

This is the high-value part. For each open Phase-0 (and currently-being-worked-on Phase-1+) checkbox in `SHOPPILOT_ROADMAP.md`, **verify against the codebase**:

| Roadmap claim | How to verify |
|---|---|
| "X table created" | `grep -r "create table.*X" supabase/migrations/` AND check `src/types/supabase.ts` |
| "X migration applied" | File exists in `supabase/migrations/` AND has been pushed |
| "X component shipped" | `find src/components -name "*X*"` AND grep its usage in pages |
| "X page/route exists" | `find src/app -path "*X*"` |
| "X server action exists" | `grep -l "export.*function.*X" src/lib/actions/` |
| "X integration done" | grep for the env var / SDK import / API route |
| "X UI consistency item" | Cross-reference UI-AUDIT.md status |

**Rule:** Trusting an existing checkbox state is NOT verification. The checkbox was correct *when it was written*; it may not be correct *now*. If you can't grep evidence, treat it as unknown.

For each item, classify:
- ✅ **Should be checked, currently is** — leave alone
- ⚠️ **Should be checked, currently isn't** — propose checking it off (with the evidence)
- ⚠️ **Currently checked, but code says no** — propose un-checking, surface as a question
- ❌ **Still open** — leave alone

---

## Step 3 — Audit the other docs

**`ARCHITECTURE.md`** — Did this session add/remove/change an integration or feature? If yes, propose the section to update. If no (just bug fixes inside existing surfaces), leave alone — ARCHITECTURE describes *current shape*, not session history.

**`DATABASE_SCHEMA.md`** — Did any migration this session add/change/remove a column or table? If yes, draft the entry. Cross-check against `src/types/supabase.ts` to confirm types are regenerated.

**`src/types/supabase.ts`** — If a migration shipped, was the file regenerated? Check `git log -- src/types/supabase.ts` against the migration timestamp.

**`CLAUDE.md` files** — Did the session change a workflow rule, anti-pattern, or convention? Almost always "no" — flag explicitly if "yes."

**Memory** (`C:\Users\tomjd\.claude\projects\...\memory\`) — Did anything come up that's *surprising or non-obvious* and worth recording for future sessions? User preferences expressed, anti-patterns encountered, decisions made. Skim for candidates; do NOT save routine "we updated X" facts (those belong in PROGRESS.md, not memory).

---

## Step 4 — Draft the PROGRESS.md entry

Format matches existing entries in the file. Typical structure:

```markdown
## Session NN — <one-line title> (YYYY-MM-DD)

**Shipped:**
- <bullets>

**Files touched:**
- <list>

**What's next:**
- <bullets>

**Known issues / open questions:**
- <bullets, or "none">
```

Pull the date from the system context. Number the session as `last_session + 1` (read PROGRESS.md to find the latest).

---

## Step 5 — Show the user, then write

Present in this order:

1. **PROGRESS.md entry** — draft, ready to append.
2. **Roadmap diffs** — checkbox changes with the evidence ("`supabase/migrations/20260502...` exists, so check off Estimate decoupling").
3. **ARCHITECTURE.md changes** — if any.
4. **DATABASE_SCHEMA.md changes** — if any.
5. **Memory candidates** — listed but NOT auto-written; user picks.
6. **Anything stale you found** — checkboxes that were on but code says no, doc that contradicts another doc, etc.

Wait for the user to approve. Then write the changes — separate commits per doc category so the diff is reviewable:
- `docs(progress): Session NN — <title> [skip-review]`
- `docs(roadmap): reconcile Phase X checklist with shipped work [skip-review]`
- `docs(architecture): <what changed>` (no skip-review if architecture changed materially)
- `docs(schema): <migration> [skip-review]`

If the user wants everything in one commit, fine — but doc commits should be separate from code commits.

---

## Step 6 — Memory

If the session produced anything worth keeping for future sessions (anti-pattern the user pointed out, workflow preference, decision rationale), write the memory file directly under `C:\Users\tomjd\.claude\projects\C--Projects-broadway-motors-shop-pilot\memory\` and link from MEMORY.md per the auto-memory rules.

Routine state ("Phase 0 items shipped") does NOT go in memory — that's roadmap content. Memory is for *surprising* or *non-obvious* takeaways.

---

## What this skill is NOT

- It is NOT `/scoped-review` — that gates code merges. This is doc reconciliation.
- It is NOT a `git commit` automation — code commits should already have happened. This handles the doc layer.
- It does NOT push to remote unless the user explicitly asks.
- It does NOT touch GitHub PRs / issues / external systems.

## Common failure modes

- **Trusting the checklist.** The whole reason this skill exists. Grep the code, don't read the markdown.
- **Drafting PROGRESS.md without the audit.** The audit is the value-add; skipping it makes this just a session log.
- **Marking something done because "we talked about it."** A conversation isn't a shipped commit. Verify against `git log` and the actual file existence.
- **Writing without showing.** Always show the diffs first, get approval, then write.
