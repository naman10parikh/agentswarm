#!/usr/bin/env bash
# eval/golden.sh: golden behavioural tasks for agentswarm's job, which is to deploy a swarm of agents from one
# swarm.yaml, start each VP when its dependencies are done, and know when each one has finished.
#
# Everything runs for real (the TypeScript CLI, the CEO loop, tmux, the MCP server) with two safety measures:
#   - tmux is a shim that adds `-L <private socket>`, so the user's own tmux server is never touched;
#   - `claude` is a stand-in agent (first on PATH, panes start bash without rc files) that prints the completion
#     signal its prompt asks for, or never finishes when told NEVER-FINISH. No model is ever called.
# The private server numbers windows and panes from 1, as agentgrid's installer configures tmux, so the swarm's own
# numbering is tested too. Pass^k: the whole lifecycle must pass K rounds in a row (default 3).
#
#   pnpm build && bash eval/golden.sh      needs tmux, node and python3
#   AG_EVAL_K=1 bash eval/golden.sh        one round
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
K="${AG_EVAL_K:-3}"
OUT="${AS_EVAL_OUT:-$ROOT/logs/eval-golden.json}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/agentswarm-eval.XXXXXX")"
REAL_TMUX="$(command -v tmux || true)"
for dep in node python3; do command -v "$dep" >/dev/null 2>&1 || { echo "FAIL: $dep is required"; exit 1; }; done
[ -n "$REAL_TMUX" ] || { echo "FAIL: tmux is required for the golden eval"; exit 1; }
[ -f dist/ceo.js ] || { echo "FAIL: dist/ceo.js missing, run 'pnpm build' first"; exit 1; }
unset TMUX TMUX_PANE

export AS_EVAL_SOCK="agentswarm-eval-$$" AS_EVAL_CONF="$TMP/tmux.conf" AS_EVAL_ARGV="$TMP/argv.log" REAL_TMUX
mkdir -p "$TMP/bin" "$TMP/work"
printf 'set -g base-index 1\nsetw -g pane-base-index 1\nset -g default-command "bash --norc --noprofile"\n' > "$AS_EVAL_CONF"
cat > "$TMP/bin/tmux" <<'SH'
#!/bin/sh
exec "$REAL_TMUX" -L "$AS_EVAL_SOCK" -f "$AS_EVAL_CONF" "$@"
SH
cat > "$TMP/bin/claude" <<'SH'
#!/bin/sh
# Stand-in coding agent: records its arguments, then prints the signal its prompt asks for, or never finishes.
printf '%s\n' "$*" >> "$AS_EVAL_ARGV"
case "$*" in *NEVER-FINISH*) sleep 600; exit 0 ;; esac
sleep 1
printf '%s\n' "$*" | sed -n 's/.*Say "\([^"]*: DONE\)" when finished.*/\1/p'
sleep 600
SH
chmod +x "$TMP/bin/tmux" "$TMP/bin/claude"
export PATH="$TMP/bin:$PATH"
CLI="node $ROOT/dist/ceo.js"
cleanup() { tmux kill-server >/dev/null 2>&1; rm -rf "$TMP" /tmp/agentswarm-agentswarm-golden-*-status.json; }
trap cleanup EXIT

PASS=0; FAIL=0; LOG=""
ok()  { echo "  PASS  r$ROUND $1"; PASS=$((PASS+1)); LOG="$LOG{\"round\":$ROUND,\"task\":\"$1\",\"pass\":true},"; }
bad() { echo "  FAIL  r$ROUND $1: $2"; FAIL=$((FAIL+1)); LOG="$LOG{\"round\":$ROUND,\"task\":\"$1\",\"pass\":false},"; }
status_field() {  # status_field <session> <python expression over d>
  python3 -c "import json,sys; d=json.load(open('/tmp/agentswarm-$1-status.json')); print($2)" 2>/dev/null
}
runlog_lines() { [ -f logs/runs.jsonl ] && wc -l < logs/runs.jsonl | tr -d ' ' || echo 0; }

echo "=== agentswarm golden eval: $K round(s) on a private tmux server, stand-in agents ==="
START=$(date +%s)
ROUND=1
while [ "$ROUND" -le "$K" ]; do
  : > "$AS_EVAL_ARGV"
  rm -f "$TMP"/work/pwned-* /tmp/agentswarm-agentswarm-golden-*-status.json "$TMP"/chain.rc "$TMP"/chain.out "$TMP"/stuck.out
  LOG_BEFORE=$(runlog_lines)

  # G0: both CLIs answer --help and --version, with the package's version.
  PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
  if $CLI --help 2>&1 | grep -q "sandbox-run" && [ "$($CLI --version 2>&1)" = "$PKG_VERSION" ] &&
     bash src/cli.sh --help 2>&1 | grep -q "init" && bash src/cli.sh --version 2>&1 | grep -q "v$PKG_VERSION"; then
    ok "help-and-version-answer"
  else bad "help-and-version-answer" "version $PKG_VERSION: ts=$($CLI --version 2>&1) sh=$(bash src/cli.sh --version 2>&1)"; fi

  # G0b: the bash CLI finds its helpers when run through a symlink, as npm installs it.
  ln -sf "$ROOT/src/cli.sh" "$TMP/bin/agentswarm-sh"
  LINK_OUT="$("$TMP/bin/agentswarm-sh" validate "$ROOT/eval/fixtures/chain.yaml" 2>&1)"
  if ! printf '%s' "$LINK_OUT" | grep -q "No such file"; then ok "bash-cli-runs-through-a-symlink"
  else bad "bash-cli-runs-through-a-symlink" "$(printf '%s' "$LINK_OUT" | tail -1)"; fi

  # G1: validate accepts a good swarm and names both errors in a bad one.
  BAD_OUT="$($CLI validate eval/fixtures/invalid.yaml 2>&1)"; BAD_RC=$?
  if $CLI validate eval/fixtures/chain.yaml >/dev/null 2>&1 && [ "$BAD_RC" -ne 0 ] &&
     printf '%s' "$BAD_OUT" | grep -q "Duplicate role: Alpha" && printf '%s' "$BAD_OUT" | grep -q '"Missing"'; then
    ok "validate-accepts-good-names-bad-errors"
  else bad "validate-accepts-good-names-bad-errors" "rc=$BAD_RC $(printf '%s' "$BAD_OUT" | tail -2 | tr '\n' ' ')"; fi

  # G2: a dry run prints the plan and creates no tmux session.
  if $CLI run --dry eval/fixtures/chain.yaml 2>&1 | grep -q "Gamma" && ! tmux has-session -t agentswarm-golden-chain 2>/dev/null; then
    ok "dry-run-plans-without-tmux"
  else bad "dry-run-plans-without-tmux" "session exists or plan missing"; fi

  # G3: the chain runs to completion, each VP starting only after the one it depends on.
  (cd "$TMP/work" && $CLI run "$ROOT/eval/fixtures/chain.yaml" > "$TMP/chain.out" 2>&1; echo $? > "$TMP/chain.rc") &
  i=0; while [ ! -s "$TMP/chain.rc" ] && [ "$i" -lt 300 ]; do sleep 0.2; i=$((i+1)); done
  ORDER="$(status_field agentswarm-golden-chain "d['allDone'] and [v['doneAt'] for v in d['vps']] == sorted(v['doneAt'] for v in d['vps'])")"
  if [ "$(cat "$TMP/chain.rc" 2>/dev/null)" = "0" ] && [ "$ORDER" = "True" ]; then
    ok "chain-completes-in-dependency-order"
  else bad "chain-completes-in-dependency-order" "rc=$(cat "$TMP/chain.rc" 2>/dev/null) order=$ORDER $(tail -3 "$TMP/chain.out" | tr '\n' ' ')"; fi

  # G3b: the status command reports every VP done, and stop ends the swarm's session.
  STATUS_OUT="$($CLI status agentswarm-golden-chain 2>&1)"
  $CLI stop agentswarm-golden-chain >/dev/null 2>&1
  if [ "$(printf '%s' "$STATUS_OUT" | grep -ciE 'alpha|beta|gamma')" -ge 3 ] && ! tmux has-session -t agentswarm-golden-chain 2>/dev/null; then
    ok "status-reports-then-stop-ends-session"
  else bad "status-reports-then-stop-ends-session" "$(printf '%s' "$STATUS_OUT" | tail -4 | tr '\n' ' ')"; fi

  # G4: shell syntax in a prompt reaches the agent as text and never runs.
  if [ ! -e "$TMP/work/pwned-by-swarm" ] && [ ! -e "$TMP/work/pwned-by-backticks" ] && grep -qF '$(touch pwned-by-swarm)' "$AS_EVAL_ARGV"; then
    ok "prompt-text-never-runs-as-shell"
  else bad "prompt-text-never-runs-as-shell" "$(ls "$TMP/work") argv: $(head -c 160 "$AS_EVAL_ARGV")"; fi

  # G5: a VP that never finishes is never marked done, although its pane shows its signal inside the prompt.
  (cd "$TMP/work" && $CLI run "$ROOT/eval/fixtures/stuck.yaml" > "$TMP/stuck.out" 2>&1) &
  STUCK_PID=$!
  i=0; until [ "$(status_field agentswarm-golden-stuck "[v['status'] for v in d['vps']][0]")" = "done" ] || [ "$i" -ge 150 ]; do sleep 0.2; i=$((i+1)); done
  sleep 3
  STUCK="$(status_field agentswarm-golden-stuck "[v['status'] for v in d['vps']]")"
  kill "$STUCK_PID" 2>/dev/null; wait "$STUCK_PID" 2>/dev/null
  if [ "$STUCK" = "['done', 'running']" ]; then ok "unfinished-vp-is-not-done"
  else bad "unfinished-vp-is-not-done" "statuses=$STUCK"; fi

  # G6: another coding agent uses the MCP server: list tools, validate the chain, read its finished status, search memory.
  MCP="$(python3 - "$ROOT" <<'PY'
import json, subprocess, sys
root = sys.argv[1]
calls = [{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
         {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
         {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "validate_swarm", "arguments": {"config_path": root + "/eval/fixtures/chain.yaml"}}},
         {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "swarm_status", "arguments": {"session": "agentswarm-golden-chain"}}},
         {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "memory_search", "arguments": {"query": "depends_on", "limit": 3}}}]
p = subprocess.run(["node", root + "/dist/mcp-server.js"], input="\n".join(json.dumps(c) for c in calls) + "\n",
                   capture_output=True, text=True, timeout=60)
r = {}
for line in p.stdout.splitlines():
    try:
        m = json.loads(line); r[m["id"]] = m
    except (ValueError, KeyError):
        pass
text = lambda i: "".join(c.get("text", "") for c in r.get(i, {}).get("result", {}).get("content", []))
print(json.dumps({"tools": len(r.get(2, {}).get("result", {}).get("tools", [])),
                  "valid": '"valid": true' in text(3) or '"valid":true' in text(3),
                  "done": text(4).count('"done"') >= 3, "search": "depends_on" in text(5)}))
PY
)"
  if [ "$(printf '%s' "$MCP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["tools"]==3 and d["valid"] and d["done"] and d["search"])' 2>/dev/null)" = "True" ]; then
    ok "mcp-validate-status-search"
  else bad "mcp-validate-status-search" "$MCP"; fi

  # G7: every CLI run left a line in the append-only run log.
  if [ "$(runlog_lines)" -ge $((LOG_BEFORE + 6)) ]; then ok "run-log-records-every-run"
  else bad "run-log-records-every-run" "lines $LOG_BEFORE -> $(runlog_lines)"; fi

  tmux kill-server >/dev/null 2>&1
  ROUND=$((ROUND+1))
done

SECS=$(( $(date +%s) - START ))
TOTAL=$((PASS+FAIL))
mkdir -p "$(dirname "$OUT")"
printf '{"eval":"golden","k":%s,"pass":%s,"fail":%s,"total":%s,"seconds":%s,"results":[%s]}\n' \
  "$K" "$PASS" "$FAIL" "$TOTAL" "$SECS" "${LOG%,}" > "$OUT"
echo "=== golden: $PASS/$TOTAL passed over $K round(s) in ${SECS}s ==="
[ "$FAIL" -eq 0 ]
