#!/usr/bin/env bash
# PreToolUse hook fired on `git push` (filtered via matcher: "Bash(git push*)" in settings.json).
#
# BLOCKS the push (exit 2) unless one of:
# (a) `.scoped-review-marker` at repo root contains the current HEAD SHA — set
#     by the /scoped-review skill on completion. Means review just ran.
# (b) The latest commit message contains `[skip-review]` — explicit bypass for
#     typo fixes, doc-only changes, or anything tiny enough that review is
#     wasted effort.
#
# This is the harness-level gate that turns the "always run /scoped-review
# before push" rule from advisory into enforcing. Designed to be hard to
# accidentally skip while keeping a clear escape hatch for trivial work.

set -u

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

current_sha=$(git rev-parse HEAD 2>/dev/null) || exit 0
marker_file=".scoped-review-marker"

# Bypass: latest commit message contains [skip-review]
latest_msg=$(git log -1 --format=%B 2>/dev/null) || exit 0
if echo "$latest_msg" | grep -q '\[skip-review\]'; then
  exit 0
fi

# Allow: marker file matches current HEAD
if [ -f "$marker_file" ]; then
  marker_sha=$(cat "$marker_file" 2>/dev/null)
  if [ "$marker_sha" = "$current_sha" ]; then
    exit 0
  fi
fi

# Block. exit 2 = Claude Code "deny tool call, surface stderr to model".
cat <<EOF >&2
[BLOCKED] /scoped-review has not been run on the current HEAD.

  Current HEAD: $current_sha
  Marker SHA:   $(cat "$marker_file" 2>/dev/null || echo "(no marker)")

Run /scoped-review before pushing. The skill writes .scoped-review-marker
on completion which this hook checks against. The marker becomes stale
on every new commit, so every batch of work needs its own review.

Bypass for tiny changes (typo fixes, doc-only): append [skip-review] to
the latest commit message and try the push again.

Reference: shop-pilot/.claude/skills/scoped-review/SKILL.md
EOF
exit 2
