#!/usr/bin/env bash
# orchestrate.sh — CEO orchestration engine
# Reads swarm.yaml, creates tmux session, deploys VP prompts, monitors progress
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/parse-yaml.sh"
source "$SCRIPT_DIR/status.sh"

# Colors
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'
CYAN=$'\033[0;36m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; NC=$'\033[0m'

log() { echo -e "${CYAN}[agentswarm]${NC} $1"; }
err() { echo -e "${RED}[agentswarm]${NC} $1" >&2; }

# ─── Main orchestration ───

orchestrate() {
  local config_file="$1"
  local dry_run="${2:-false}"

  # Validate config
  log "Validating ${config_file}..."
  local valid
  valid=$(validate_yaml "$config_file")
  if [ "$valid" != "OK" ]; then
    err "Validation failed:"
    echo "$valid"
    exit 1
  fi
  log "Config valid ✓"

  # Extract swarm settings
  local swarm_name session poll_interval max_runtime idle_timeout
  swarm_name=$(parse_yaml_value "$config_file" "swarm.name" "swarm")
  session=$(parse_yaml_value "$config_file" "swarm.session" "agentswarm")
  poll_interval=$(parse_yaml_value "$config_file" "swarm.poll_interval" "120")
  max_runtime=$(parse_yaml_value "$config_file" "swarm.max_runtime" "180")
  idle_timeout=$(parse_yaml_value "$config_file" "swarm.idle_timeout" "300")

  # Extract CEO config
  local ceo_prompt ceo_model
  ceo_prompt=$(parse_yaml_value "$config_file" "ceo.prompt" "You are the CEO. Monitor VPs and coordinate.")
  ceo_model=$(parse_yaml_value "$config_file" "ceo.model" "opus")

  # Extract VP list as JSON
  local vps_json
  vps_json=$(parse_vps_json "$config_file")
  local vp_count
  vp_count=$(echo "$vps_json" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")

  log "${BOLD}Swarm: ${swarm_name}${NC}"
  log "Session: ${session}"
  log "VPs: ${vp_count}"
  log "Poll: ${poll_interval}s | Max runtime: ${max_runtime}m | Idle timeout: ${idle_timeout}s"
  echo ""

  if [ "$dry_run" = "true" ]; then
    log "${YELLOW}DRY RUN — showing what would be deployed:${NC}"
    echo ""
    echo "$vps_json" | python3 -c "
import json, sys
vps = json.load(sys.stdin)
for vp in vps:
    deps = ', '.join(vp['depends_on']) if vp['depends_on'] else 'none'
    print(f\"  Pane {vp['pane']}: {vp['role']} (model: {vp['model'] or 'default'}, depends: {deps})\")
    print(f\"    Prompt: {vp['prompt'][:80]}...\")
    print()
"
    return 0
  fi

  # Check tmux
  if ! command -v tmux &>/dev/null; then
    err "tmux is required. Install: brew install tmux"
    exit 1
  fi

  # Check agentgrid (optional — we can work without it)
  local use_agentgrid=false
  if command -v agentgrid &>/dev/null || [ -f "$SCRIPT_DIR/../../agentgrid/agentgrid" ]; then
    use_agentgrid=true
  fi

  # Kill existing session if present
  tmux kill-session -t "$session" 2>/dev/null || true

  # Create tmux session with pane 0 (CEO)
  log "Creating tmux session: ${session}"
  tmux new-session -d -s "$session" -x 200 -y 50
  # Address the window and panes from 0, whatever the user's tmux.conf says (agentgrid's installer sets 1).
  tmux set-option -t "$session" base-index 0 2>/dev/null || true
  tmux move-window -r -t "$session" 2>/dev/null || true
  tmux set-window-option -t "${session}:0" pane-base-index 0 2>/dev/null || true

  # Create VP panes
  local vp_specs=()
  for (( i=0; i<vp_count; i++ )); do
    local role pane model prompt depends_json
    role=$(echo "$vps_json" | python3 -c "import json,sys; print(json.load(sys.stdin)[$i]['role'])")
    pane=$(echo "$vps_json" | python3 -c "import json,sys; print(json.load(sys.stdin)[$i]['pane'])")
    model=$(echo "$vps_json" | python3 -c "import json,sys; print(json.load(sys.stdin)[$i]['model'])")
    prompt=$(echo "$vps_json" | python3 -c "import json,sys; print(json.load(sys.stdin)[$i]['prompt'])")
    depends_json=$(echo "$vps_json" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)[$i]['depends_on']))")

    # Create the pane (split from pane 0)
    if [ "$i" -gt 0 ]; then
      tmux split-window -t "${session}:0" -h 2>/dev/null || \
      tmux split-window -t "${session}:0" -v 2>/dev/null || true
    fi

    # Tile the layout evenly
    tmux select-layout -t "${session}:0" tiled 2>/dev/null || true

    # Status reads pane i, the pane VP i's launch command is sent to below.
    vp_specs+=("${role}:${i}")
    log "  Pane ${pane}: ${role} (${model:-default model})"
  done

  # Deploy prompts. A VP with no depends_on starts now; the monitoring loop starts each other VP once every role
  # in its depends_on has printed its DONE line.
  echo ""
  log "Deploying VP prompts..."

  local launch_cmds=() deps_list=() started=()
  for (( i=0; i<vp_count; i++ )); do
    local role prompt model deps
    role=$(echo "$vps_json" | python3 -c "import json,sys; print(json.load(sys.stdin)[$i]['role'])")
    prompt=$(echo "$vps_json" | python3 -c "import json,sys; print(json.load(sys.stdin)[$i]['prompt'])")
    model=$(echo "$vps_json" | python3 -c "import json,sys; print(json.load(sys.stdin)[$i]['model'])")
    deps=$(echo "$vps_json" | python3 -c "import json,sys; print('\\n'.join(json.load(sys.stdin)[$i]['depends_on']))")

    # The prompt goes to the pane's shell as one single-quoted argument, so $(...) and backticks in a
    # swarm.yaml written by someone else are never run. A model from the file goes through claude's own
    # --model flag, quoted the same way; with none, claude uses its default model.
    local one_line quoted_prompt model_flag=""
    one_line=$(echo "$prompt" | head -5 | tr '\n' ' ' | cut -c1-500)
    quoted_prompt="'$(printf '%s' "$one_line" | sed "s/'/'\\\\''/g")'"
    if [ -n "$model" ]; then
      model_flag="--model '$(printf '%s' "$model" | sed "s/'/'\\\\''/g")' "
    fi
    launch_cmds+=("claude --dangerously-skip-permissions ${model_flag}${quoted_prompt}")
    deps_list+=("$deps")

    if [ -z "$deps" ]; then
      tmux send-keys -t "${session}:0.${i}" "${launch_cmds[$i]}" Enter
      started+=(1)
      log "  Deployed to pane ${i}: ${role}"
      sleep 1  # Brief pause between deployments
    else
      started+=(0)
      log "  Waiting: ${role} (needs ${deps//$'\n'/, })"
    fi
  done

  echo ""
  log "${GREEN}All VPs deployed or waiting.${NC}"
  log "Entering monitoring loop (poll every ${poll_interval}s, max ${max_runtime}m)..."
  echo ""

  # ─── Monitoring loop ───
  local start_time
  start_time=$(date +%s)
  local max_seconds=$((max_runtime * 60))
  local status_file="/tmp/agentswarm-${session}-status.json"

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))

    # Check max runtime
    if [ "$elapsed" -gt "$max_seconds" ]; then
      log "${YELLOW}Max runtime reached (${max_runtime}m). Shutting down.${NC}"
      break
    fi

    # Start each waiting VP once every role in its depends_on is done. Roles still waiting show as PENDING.
    AGENTSWARM_WAITING=""
    for (( i=0; i<vp_count; i++ )); do
      [ "${started[$i]}" = "1" ] && continue
      if deps_done "$session" "${deps_list[$i]}" "${vp_specs[@]}"; then
        tmux send-keys -t "${session}:0.${i}" "${launch_cmds[$i]}" Enter
        started[$i]=1
        log "  Deployed to pane ${i}: ${vp_specs[$i]%%:*} (its depends_on are done)"
      else
        AGENTSWARM_WAITING+="${vp_specs[$i]%%:*}"$'\n'
      fi
    done

    # Print status dashboard
    if print_status "$session" "$idle_timeout" "${vp_specs[@]}"; then
      log "${GREEN}${BOLD}All VPs complete! Swarm finished.${NC}"
      break
    fi

    # Write machine-readable status
    write_status_json "$session" "$status_file" "$idle_timeout" "${vp_specs[@]}"

    local mins=$((elapsed / 60))
    local secs=$((elapsed % 60))
    echo "  ${DIM}Elapsed: ${mins}m ${secs}s | Next check in ${poll_interval}s${NC}"

    sleep "$poll_interval"
  done

  # Final status
  echo ""
  log "Final status:"
  print_status "$session" "$idle_timeout" "${vp_specs[@]}" || true
  write_status_json "$session" "$status_file" "$idle_timeout" "${vp_specs[@]}"
  log "Status file: ${status_file}"
  echo ""
  log "Session '${session}' is still running. Attach: tmux attach -t ${session}"
}
