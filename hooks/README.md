# hooks/

Hooks that ship with the Claude Code plugin.

- [`hooks.json`](hooks.json): the plugin's hook map, loaded by Claude Code when the plugin is installed.
- [`swarm-guard.mjs`](swarm-guard.mjs): a `PreToolUse` hook on Bash. It denies `tmux kill-server`, which would end
  every running swarm, and `tmux select-pane`, which steals the person's focus. A command on a private server
  (`tmux -L <name> ...`) and `tmux select-pane -T <title>` are allowed.

The hooks for contributors working inside this repository live in `.claude/settings.json` (a dangerous-command
block, a secret guard and an append-only audit log in `.claude/audit.jsonl`).
