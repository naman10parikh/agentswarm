#!/usr/bin/env bash
# status.sh — Monitor pane status, detect idle/done VPs, report progress
# Sourced by the CEO orchestrator

# Colors
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'
CYAN=$'\033[0;36m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; NC=$'\033[0m'

# Roles not started yet because a role in their depends_on is not done, one per line. orchestrate.sh sets it.
AGENTSWARM_WAITING="${AGENTSWARM_WAITING:-}"

is_waiting() {
  case $'\n'"$AGENTSWARM_WAITING"$'\n' in *$'\n'"$1"$'\n'*) return 0 ;; esac
  return 1
}

# Check if a pane has output the DONE signal
# Returns 0 if done, 1 if still running
check_pane_done() {
  local session="$1" pane="$2" role="$3"
  local pattern="${role}: DONE"

  # Capture last 50 lines from the pane
  local output
  output=$(tmux capture-pane -t "${session}:0.${pane}" -p -S -50 2>/dev/null || echo "")

  # The signal must be a whole line (after a reply bullet, before a full stop): the pane also shows the
  # prompt, which says 'Say "{Role}: DONE" when finished', and that must not count.
  if printf '%s\n' "$output" | sed -e 's/^[^A-Za-z0-9]*//' -e 's/[.!]*[[:space:]]*$//' | grep -qxF "$pattern"; then
    return 0  # Done
  fi
  return 1  # Still running
}

# Check if a pane is idle: its last 30 lines have not changed for more than N seconds.
# tmux keeps no activity time per pane, so each look is kept in AS_SEEN_<pane> (its time in AS_SEEN_AT_<pane>) and
# compared with the next. The runner's loop calls this directly, so the two variables last between polls.
check_pane_idle() {
  local session="$1" pane="$2" idle_timeout="$3"
  local seen="AS_SEEN_${pane}" at="AS_SEEN_AT_${pane}" output now
  output=$(tmux capture-pane -t "${session}:0.${pane}" -p -S -30 2>/dev/null) || return 1  # Can't determine
  now=$(date +%s)

  if [ -z "${!at-}" ] || [ "${!seen-}" != "$output" ]; then
    printf -v "$seen" '%s' "$output"
    printf -v "$at" '%s' "$now"
    return 1  # New output: active
  fi
  [ $((now - ${!at})) -gt "$idle_timeout" ]  # 0 when idle
}

# Get the last N lines from a pane
get_pane_output() {
  local session="$1" pane="$2" lines="${3:-10}"
  tmux capture-pane -t "${session}:0.${pane}" -p -S "-${lines}" 2>/dev/null || echo "(no output)"
}

# Check if a pane's process is still alive
check_pane_alive() {
  local session="$1" pane="$2"
  tmux list-panes -t "${session}:0" -F '#{pane_index} #{pane_pid}' 2>/dev/null | \
    awk -v p="$pane" '$1 == p { print $2 }' | \
    while read -r pid; do
      kill -0 "$pid" 2>/dev/null && return 0
    done
  return 1
}

# Print status dashboard for all VPs
print_status() {
  local session="$1" idle_timeout="$2"
  shift 2
  # Remaining args: "role:pane" pairs
  local vp_specs=("$@")

  echo ""
  echo "${CYAN}${BOLD}agentswarm status${NC} ${DIM}$(date '+%H:%M:%S')${NC}"
  echo "${DIM}$( printf '─%.0s' {1..50} )${NC}"

  local all_done=true
  local done_count=0
  local total=${#vp_specs[@]}

  for spec in "${vp_specs[@]}"; do
    local role="${spec%%:*}"
    local pane="${spec##*:}"

    local status_icon status_color status_text

    if is_waiting "$role"; then
      status_icon="○"
      status_color="$DIM"
      status_text="PENDING"
      all_done=false
    elif check_pane_done "$session" "$pane" "$role"; then
      status_icon="✓"
      status_color="$GREEN"
      status_text="DONE"
      done_count=$((done_count + 1))
    elif check_pane_idle "$session" "$pane" "$idle_timeout"; then
      status_icon="⏸"
      status_color="$YELLOW"
      status_text="IDLE"
      all_done=false
    else
      status_icon="▶"
      status_color="$CYAN"
      status_text="RUNNING"
      all_done=false
    fi

    printf "  ${status_color}${status_icon}${NC}  %-20s ${status_color}%-8s${NC} ${DIM}pane %s${NC}\n" \
      "$role" "$status_text" "$pane"
  done

  echo ""
  echo "  ${BOLD}Progress: ${done_count}/${total} VPs complete${NC}"

  if $all_done; then
    echo "  ${GREEN}${BOLD}All VPs finished.${NC}"
    return 0
  fi
  return 1
}

# Wait for a specific VP to finish (used for dependency resolution)
wait_for_vp() {
  local session="$1" pane="$2" role="$3" timeout="${4:-600}"
  local start
  start=$(date +%s)

  while true; do
    if check_pane_done "$session" "$pane" "$role"; then
      return 0
    fi

    local elapsed=$(( $(date +%s) - start ))
    if [ "$elapsed" -gt "$timeout" ]; then
      echo "${YELLOW}[agentswarm] Timeout waiting for ${role} (${timeout}s)${NC}" >&2
      return 1
    fi

    sleep 10
  done
}

# True when every role in $2 (one per line) has printed its DONE line in its own pane. The remaining args are the
# swarm's "role:pane" pairs. A role that is not in the swarm is never done.
deps_done() {
  local session="$1" deps="$2" dep spec found
  shift 2
  while IFS= read -r dep; do
    if [ -z "$dep" ]; then continue; fi
    found=false
    for spec in "$@"; do
      if [ "${spec%%:*}" = "$dep" ]; then
        found=true
        check_pane_done "$session" "${spec##*:}" "$dep" || return 1
      fi
    done
    $found || return 1
  done <<< "$deps"
  return 0
}

# Write status to a JSON file (for programmatic consumption)
write_status_json() {
  local session="$1" outfile="$2" idle_timeout="$3"
  shift 3
  local vp_specs=("$@")

  local json='{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","session":"'"$session"'","vps":['
  local first=true

  for spec in "${vp_specs[@]}"; do
    local role="${spec%%:*}"
    local pane="${spec##*:}"
    local status="running"

    if is_waiting "$role"; then
      status="pending"
    elif check_pane_done "$session" "$pane" "$role"; then
      status="done"
    elif check_pane_idle "$session" "$pane" "$idle_timeout"; then
      status="idle"
    fi

    $first || json+=","
    first=false
    json+='{"role":"'"$role"'","pane":'"$pane"',"status":"'"$status"'"}'
  done

  json+=']}'
  echo "$json" > "$outfile"
}
