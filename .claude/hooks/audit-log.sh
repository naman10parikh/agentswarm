#!/bin/bash
# Append-only audit log — inspired by Paperclip's governance model.
# Fires on PostToolUse for all tools. Logs every tool call with timestamp.
# File: .claude/audit.jsonl (JSON Lines format, append-only)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${PROJECT_ROOT:-$(pwd)}}"
AUDIT_FILE="$PROJECT_DIR/.claude/audit.jsonl"
TERMINAL_CONTEXT="${CLAUDE_TERMINAL_CONTEXT:-unknown}"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Claude Code delivers the hook payload as JSON on stdin ({tool_name, tool_input:{...}}).
# Parse it with node (already required by the sibling .cjs hooks); fall back to the
# legacy CLAUDE_TOOL_NAME env vars so older harness versions keep working.
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
STDIN_FILE_PATH=""
if [ ! -t 0 ]; then
  STDIN_JSON="$(cat 2>/dev/null || true)"
  if [ -n "$STDIN_JSON" ] && command -v node >/dev/null 2>&1; then
    PARSED="$(printf '%s' "$STDIN_JSON" | node -e '
      let d = "";
      process.stdin.on("data", (c) => (d += c)).on("end", () => {
        try {
          const j = JSON.parse(d);
          const f = (j.tool_input && (j.tool_input.file_path || j.tool_input.notebook_path)) || "";
          process.stdout.write((j.tool_name || "") + "\t" + f);
        } catch { /* malformed payload — leave blank */ }
      });
    ' 2>/dev/null || true)"
    [ -n "${PARSED%%	*}" ] && TOOL_NAME="${PARSED%%	*}"
    STDIN_FILE_PATH="${PARSED#*	}"
  fi
fi
TOOL_NAME="${TOOL_NAME:-unknown}"

# Only log significant tools (skip reads/searches to avoid noise)
case "$TOOL_NAME" in
  Write|Edit|Bash|Agent|NotebookEdit|TaskCreate|TaskUpdate|CronCreate)
    # These are state-changing — always log
    ;;
  *)
    # Skip read-only tools to keep audit log focused
    exit 0
    ;;
esac

# Extract file path if available (stdin payload first, legacy env var fallback)
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-$STDIN_FILE_PATH}"

# Atomic append with flock to handle multi-terminal. flock(1) is Linux-only —
# on macOS (no flock) fall back to a plain O_APPEND write: single-line appends
# are atomic at this size, so the entry still always lands.
AUDIT_LINE="{\"ts\":\"$TIMESTAMP\",\"tool\":\"$TOOL_NAME\",\"terminal\":\"$TERMINAL_CONTEXT\",\"file\":\"$FILE_PATH\"}"
if command -v flock >/dev/null 2>&1; then
  (
    flock -w 5 200 || exit 0
    echo "$AUDIT_LINE" >> "$AUDIT_FILE"
  ) 200>"$AUDIT_FILE.lock"
else
  echo "$AUDIT_LINE" >> "$AUDIT_FILE"
fi

# Prune audit log if over 10K lines (keep recent 5K)
if [ -f "$AUDIT_FILE" ]; then
  LINE_COUNT=$(wc -l < "$AUDIT_FILE" | tr -d ' ')
  if [ "$LINE_COUNT" -gt 10000 ]; then
    TEMP=$(mktemp "$AUDIT_FILE.XXXXXX")
    tail -5000 "$AUDIT_FILE" > "$TEMP"
    mv "$TEMP" "$AUDIT_FILE"
  fi
fi
