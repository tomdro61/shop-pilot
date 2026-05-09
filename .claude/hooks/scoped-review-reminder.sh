#!/usr/bin/env bash
# PreToolUse hook fired on `git commit` (filtered via if: "Bash(git commit*)" in settings.json).
# Inspects the staged diff; if any staged file lives in a /scoped-review trigger path,
# emits a hookSpecificOutput.additionalContext message reminding the model to run
# /scoped-review on the staged diff before committing.
#
# Trigger paths mirror the routing matrix in .claude/skills/scoped-review/SKILL.md.
# Non-blocking by design: silent on no match, silent on any error.
# Uses printf+awk for JSON construction so it works on Git Bash for Windows
# (which often lacks jq).

set -u

# Pull staged file list. Suppress errors so an invocation outside a repo doesn't surface noise.
matched=$(git diff --cached --name-only 2>/dev/null \
  | grep -E '^(src/(lib/(actions|utils|validators|ai|stripe|messaging|email)/|lib/utils\.ts$|lib/auth.*\.ts$|hooks/|middleware\.ts$|components/(ui|forms)/|app/api/.*route\.ts$|app/\(dashboard\)/.*page\.tsx$)|supabase/migrations/)' \
  | head -5)

if [ -z "$matched" ]; then
  exit 0
fi

# Convert newlines in the matched list to JSON \n escapes so we can embed the
# list directly in the additionalContext string without depending on jq.
files_json=$(printf '%s' "$matched" | awk 'BEGIN{ORS="\\n"} {print}')

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"Before committing: staged changes touch a /scoped-review trigger path. Run /scoped-review on the staged diff first to catch silent failures, type issues, missing tests, and the kind of cross-flow bugs (FH-1, MP-1, MP-2 in May 2026) that per-file review misses. Reference: .claude/skills/scoped-review/SKILL.md.\\nMatched files:\\n%s"}}\n' "$files_json"
