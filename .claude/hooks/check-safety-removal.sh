#!/usr/bin/env bash
# PreToolUse hook: block edits that strip safety checks from sensitive paths.
#
# Triggered on Edit / Write / MultiEdit. Reads the tool input from stdin as
# JSON, extracts file_path + old_string + new_string, and refuses the edit
# if a known safety pattern is being removed without an explicit override.
#
# Override marker: include `// safety-removed: <reason>` (or `# safety-removed:`)
# anywhere in the new content. The reason is logged to stderr for the audit.
#
# Why this exists: code review catches removed safety checks AFTER the fact.
# This catches it BEFORE the edit lands. The patterns reflect bugs that
# actually shipped (off-session SCA, webhook idempotency races, controlled
# dialog state, etc.) — see PROGRESS.md sessions 35-38.
#
# Exit codes:
#   0  → edit allowed
#   2  → edit blocked (Claude Code surfaces stderr back to the model)

set -u

# Read JSON payload from stdin; parse via node (guaranteed available in a
# Next.js project; jq is not — this works on bare Windows + Git Bash).
INPUT_JSON="$(cat)"

# Extract the three fields we care about. Use base64 to round-trip strings
# safely through the shell without worrying about quoting / newlines.
PARSED=$(node -e '
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { raw += chunk; });
  process.stdin.on("end", () => {
    try {
      const j = JSON.parse(raw);
      const tn = j.tool_name || "";
      const fp = (j.tool_input && j.tool_input.file_path) || "";
      const os = (j.tool_input && j.tool_input.old_string) || "";
      const ns = (j.tool_input && (j.tool_input.new_string || j.tool_input.content)) || "";
      const enc = s => Buffer.from(String(s), "utf8").toString("base64");
      console.log(tn);
      console.log(fp);
      console.log(enc(os));
      console.log(enc(ns));
    } catch (e) {
      // Malformed payload → emit empty fields so the hook fails open.
      console.log(""); console.log(""); console.log(""); console.log("");
    }
  });
' <<< "$INPUT_JSON")

TOOL_NAME=$(echo "$PARSED" | sed -n '1p')
FILE_PATH=$(echo "$PARSED" | sed -n '2p')
OLD_B64=$(echo "$PARSED" | sed -n '3p')
NEW_B64=$(echo "$PARSED" | sed -n '4p')

# Only fire on Edit / Write / MultiEdit
case "$TOOL_NAME" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# Empty file path → nothing to check
[ -z "$FILE_PATH" ] && exit 0

# Sensitive paths — match against absolute or relative file_path.
is_sensitive=0
case "$FILE_PATH" in
  *src/lib/stripe/*)                                       is_sensitive=1 ;;
  *src/lib/auth.ts)                                        is_sensitive=1 ;;
  *src/lib/actions/charge-card-on-file*)                   is_sensitive=1 ;;
  *src/lib/actions/payment-methods*)                       is_sensitive=1 ;;
  *src/lib/actions/invoices*)                              is_sensitive=1 ;;
  *src/lib/actions/jobs*)                                  is_sensitive=1 ;;
  *src/lib/actions/estimates*)                             is_sensitive=1 ;;
  *src/app/api/stripe/*)                                   is_sensitive=1 ;;
  *src/app/api/terminal/*)                                 is_sensitive=1 ;;
  *src/app/api/cron/*)                                     is_sensitive=1 ;;
  *src/app/api/webhooks/*)                                 is_sensitive=1 ;;
  *src/components/dashboard/charge-card-on-file*)          is_sensitive=1 ;;
  *src/components/dashboard/terminal-pay*)                 is_sensitive=1 ;;
  *src/components/dashboard/job-payment-footer*)           is_sensitive=1 ;;
  *src/components/dashboard/quick-pay/*)                   is_sensitive=1 ;;
  *src/components/dashboard/invoice-section*)              is_sensitive=1 ;;
  *src/components/customers/payment-method-actions*)       is_sensitive=1 ;;
  *src/lib/utils/totals*)                                  is_sensitive=1 ;;
  *src/middleware.ts)                                      is_sensitive=1 ;;
esac

[ "$is_sensitive" -eq 0 ] && exit 0

# Decode the strings for matching
OLD_STR=$(echo "$OLD_B64" | base64 -d 2>/dev/null || true)
NEW_STR=$(echo "$NEW_B64" | base64 -d 2>/dev/null || true)

# Override marker — if present in NEW, allow with audit log
if echo "$NEW_STR" | grep -qE '(//|#)[[:space:]]*safety-removed:'; then
  REASON=$(echo "$NEW_STR" | grep -oE '(//|#)[[:space:]]*safety-removed:[^"]*' | head -1)
  echo "[check-safety-removal] override accepted on $FILE_PATH: $REASON" >&2
  exit 0
fi

# Patterns to watch — substrings that, if present in OLD but missing in
# NEW, indicate a safety check is being stripped. Patterns reflect actual
# bugs that have shipped or near-misses caught in review.
PATTERNS=(
  # Auth gates
  'requireManager()'
  'requireStaff()'
  # Payment status guards
  'payment_status === "paid"'
  "payment_status === 'paid'"
  'payment_status !== "paid"'
  "payment_status !== 'paid'"
  # Idempotency / duplicate-write
  'existingInvoice'
  'idempotencyKey'
  # Settings null-fallback
  'if (!shopSettings)'
  # Stripe error narrowing (off-session SCA, definitive vs ambiguous)
  'instanceof Stripe.errors'
  'isDefinitiveDecline'
  'SCA_REQUIRED_CODES'
  # Webhook signature verification
  'stripe.webhooks.constructEvent'
  'verifyWebhookSignature'
  # Cron auth
  'CRON_SECRET'
  # Atomic flip on invoice status (May 2026 webhook idempotency fix)
  '.eq("status", invoice.status)'
)

violations=()
for pat in "${PATTERNS[@]}"; do
  if echo "$OLD_STR" | grep -qF -- "$pat"; then
    if ! echo "$NEW_STR" | grep -qF -- "$pat"; then
      violations+=("$pat")
    fi
  fi
done

if [ "${#violations[@]}" -gt 0 ]; then
  {
    echo ""
    echo "[check-safety-removal] BLOCKED edit to $FILE_PATH"
    echo ""
    echo "This edit removes the following safety checks from a sensitive path:"
    for v in "${violations[@]}"; do
      echo "  - $v"
    done
    echo ""
    echo "Sensitive paths require an explicit justification before stripping"
    echo "auth gates, payment guards, idempotency keys, Stripe error narrowing,"
    echo "webhook signature verification, atomic-flip clauses, or cron auth."
    echo ""
    echo "If you have a reason, add a marker to the new content:"
    echo "    // safety-removed: <reason — what replaces this check>"
    echo ""
    echo "If you don't, restore the check, or run /sketch-flow first to"
    echo "enumerate why removal is safe."
    echo ""
    echo "Reference: .claude/skills/sketch-flow/SKILL.md"
  } >&2
  exit 2
fi

exit 0
