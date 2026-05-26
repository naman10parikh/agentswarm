#!/usr/bin/env bash
# agentswarm — CEO orchestration for AI agent swarms
set -euo pipefail

VERSION="0.1.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'
CYAN=$'\033[0;36m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; NC=$'\033[0m'

usage() {
  cat << EOF
${CYAN}${BOLD}agentswarm${NC} v${VERSION} — CEO orchestration for AI agent swarms

${BOLD}USAGE${NC}
  agentswarm <command> [options]

${BOLD}COMMANDS${NC}
  run <config.yaml>         Deploy swarm from config file
  run --dry <config.yaml>   Preview what would be deployed (no tmux)
  validate <config.yaml>    Validate a swarm config file
  status <session>          Show status of a running swarm
  stop <session>            Stop a running swarm (kills tmux session)
  list                      List running swarm sessions
  init                      Create a starter swarm.yaml in current dir
  help                      Show this help

${BOLD}EXAMPLES${NC}
  agentswarm run swarm.yaml              # Deploy the swarm
  agentswarm run --dry swarm.yaml        # Preview without deploying
  agentswarm validate swarm.yaml         # Check config is valid
  agentswarm status swarm-content        # Check VP progress
  agentswarm stop swarm-content          # Kill the swarm

${BOLD}CONFIG FORMAT${NC}
  See examples/ directory for sample swarm.yaml files.
  Key sections: swarm (settings), ceo (prompt), vps (role list)

EOF
}

# ─── Commands ───

cmd_run() {
  local dry_run=false
  local config_file=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry|--dry-run) dry_run=true; shift ;;
      *) config_file="$1"; shift ;;
    esac
  done

  if [ -z "$config_file" ]; then
    echo -e "${RED}Error: config file required${NC}"
    echo "Usage: agentswarm run [--dry] <config.yaml>"
    exit 1
  fi

  if [ ! -f "$config_file" ]; then
    echo -e "${RED}Error: file not found: ${config_file}${NC}"
    exit 1
  fi

  source "$SCRIPT_DIR/orchestrate.sh"
  orchestrate "$config_file" "$dry_run"
}

cmd_validate() {
  local config_file="${1:-}"
  if [ -z "$config_file" ]; then
    echo -e "${RED}Error: config file required${NC}"
    exit 1
  fi

  source "$SCRIPT_DIR/parse-yaml.sh"
  echo -e "${CYAN}Validating ${config_file}...${NC}"
  local result
  # `|| true` keeps `set -e` from aborting before the error branch can print:
  # validate_yaml returns non-zero on invalid configs, and we WANT to show why.
  result=$(validate_yaml "$config_file") || true
  if [ "$result" = "OK" ]; then
    echo -e "${GREEN}✓ Config is valid${NC}"

    # Show summary
    local name session vp_count
    name=$(parse_yaml_value "$config_file" "swarm.name" "unknown")
    session=$(parse_yaml_value "$config_file" "swarm.session" "unknown")
    vp_count=$(parse_yaml_list_len "$config_file" "vps")

    echo ""
    echo "  Swarm:    ${name}"
    echo "  Session:  ${session}"
    echo "  VPs:      ${vp_count}"
    echo ""

    local vps_json
    vps_json=$(parse_vps_json "$config_file")
    echo "$vps_json" | python3 -c "
import json, sys
vps = json.load(sys.stdin)
for vp in vps:
    deps = ', '.join(vp['depends_on']) if vp['depends_on'] else 'none'
    print(f\"  [{vp['pane']}] {vp['role']}  (model: {vp['model']}, depends: {deps})\")
"
    echo ""
  else
    echo -e "${RED}✗ Validation failed:${NC}"
    echo "$result"
    exit 1
  fi
}

cmd_status() {
  local session="${1:-}"
  if [ -z "$session" ]; then
    echo -e "${RED}Error: session name required${NC}"
    echo "Usage: agentswarm status <session-name>"
    exit 1
  fi

  # Check if session exists
  if ! tmux has-session -t "$session" 2>/dev/null; then
    echo -e "${RED}Session '${session}' not found${NC}"
    echo ""
    echo "Running sessions:"
    tmux list-sessions 2>/dev/null | grep -E "^(swarm|agentswarm)" || echo "  (none)"
    exit 1
  fi

  local status_file="/tmp/agentswarm-${session}-status.json"
  if [ -f "$status_file" ]; then
    echo -e "${CYAN}${BOLD}agentswarm status${NC} — session: ${session}"
    echo ""
    python3 -c "
import json
with open('$status_file') as f: data = json.load(f)
print(f\"  Timestamp: {data['timestamp']}\")
print()
for vp in data['vps']:
    icon = '✓' if vp['status'] == 'done' else '⏸' if vp['status'] == 'idle' else '▶'
    color = '32' if vp['status'] == 'done' else '33' if vp['status'] == 'idle' else '36'
    print(f\"  \033[0;{color}m{icon}\033[0m  {vp['role']:<20s} {vp['status'].upper():<8s} pane {vp['pane']}\")
done_count = sum(1 for v in data['vps'] if v['status'] == 'done')
print(f\"\n  Progress: {done_count}/{len(data['vps'])} VPs complete\")
"
  else
    echo -e "${YELLOW}No status file found. The swarm may still be starting.${NC}"
    echo ""
    echo "Panes in session ${session}:"
    tmux list-panes -t "${session}:0" -F '  [#{pane_index}] #{pane_current_command} (#{pane_width}x#{pane_height})' 2>/dev/null
  fi
  echo ""
}

cmd_stop() {
  local session="${1:-}"
  if [ -z "$session" ]; then
    echo -e "${RED}Error: session name required${NC}"
    exit 1
  fi

  if tmux has-session -t "$session" 2>/dev/null; then
    tmux kill-session -t "$session"
    echo -e "${GREEN}Stopped session: ${session}${NC}"
    rm -f "/tmp/agentswarm-${session}-status.json"
  else
    echo -e "${YELLOW}Session '${session}' not found${NC}"
  fi
}

cmd_list() {
  echo -e "${CYAN}${BOLD}Running swarm sessions:${NC}"
  echo ""
  local found=false
  while IFS= read -r line; do
    echo "  $line"
    found=true
  done < <(tmux list-sessions 2>/dev/null | grep -E "(swarm|agentswarm)" || true)

  if ! $found; then
    echo "  (no active swarms)"
  fi

  # Also check for status files
  echo ""
  echo -e "${DIM}Status files:${NC}"
  ls -la /tmp/agentswarm-*-status.json 2>/dev/null | awk '{print "  "$NF}' || echo "  (none)"
  echo ""
}

cmd_init() {
  local target="swarm.yaml"
  if [ -f "$target" ]; then
    echo -e "${YELLOW}${target} already exists. Overwrite? (y/N)${NC}"
    read -r answer
    [[ "$answer" =~ ^[Yy] ]] || exit 0
  fi

  cat > "$target" << 'YAML'
# agentswarm config — My Swarm
# Docs: https://github.com/naman10parikh/agentswarm

swarm:
  name: my-swarm
  session: swarm-my
  poll_interval: 120    # seconds between CEO status checks
  max_runtime: 120      # minutes before auto-shutdown
  idle_timeout: 300     # seconds of no output = pane marked idle

ceo:
  prompt: |
    You are the CEO. Monitor your VPs and coordinate their work.
    When all VPs report DONE, compile results and commit.
  model: opus
  context:
    - CLAUDE.md

vps:
  - role: VP Alpha
    pane: 1
    prompt: |
      You are VP Alpha. Do your task here.
      When done, say "VP Alpha: DONE" on your last line.
    model: sonnet
    workdir: .
    outputs: []

  - role: VP Beta
    pane: 2
    prompt: |
      You are VP Beta. Do your task here.
      When done, say "VP Beta: DONE" on your last line.
    model: sonnet
    workdir: .
    depends_on:
      - VP Alpha
    outputs: []
YAML

  echo -e "${GREEN}Created ${target}${NC}"
  echo "Edit it, then run: agentswarm run ${target}"
}

# ─── Main ───

case "${1:-help}" in
  run)       shift; cmd_run "$@" ;;
  validate)  shift; cmd_validate "$@" ;;
  status)    shift; cmd_status "$@" ;;
  stop)      shift; cmd_stop "$@" ;;
  list)      cmd_list ;;
  init)      cmd_init ;;
  help|-h|--help) usage ;;
  version|-v|--version) echo "agentswarm v${VERSION}" ;;
  *) echo -e "${RED}Unknown command: $1${NC}"; usage; exit 1 ;;
esac
