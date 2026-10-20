#!/usr/bin/env node
// PreToolUse hook (shipped in the plugin, wired in hooks/hooks.json): protects running swarms from the agent's own
// shell commands. Claude Code sends the tool call as JSON on stdin; this prints a deny decision when the command
// would end every swarm (`tmux kill-server`) or steal the person's focus (`tmux select-pane`), and allows the rest.
import { readFileSync } from "node:fs";

const RULES = [
  [/\btmux\s+(?:-\S+\s+)*kill-server\b/, "tmux kill-server would end every running swarm. Stop one swarm with `agentswarm stop <session>`."],
  [/\btmux\s+(?:-\S+\s+)*select-pane\b(?![^;&|]*\s-T\b)/, "tmux select-pane steals the person's focus. Read a pane with `tmux capture-pane`, drive it with `tmux send-keys -t`."],
];

let call = {};
try {
  call = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  // Not a hook payload (for example, run by hand with no input): allow.
}
const command = call.tool_name === "Bash" ? String(call.tool_input?.command ?? "") : "";
const hit = RULES.find(([pattern]) => pattern.test(command));
if (hit) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `agentswarm: ${hit[1]}` },
  }));
} else {
  console.log("{}");
}
