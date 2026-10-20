# Hive — Memory (bootstrap)

Loaded first, every session. Kept short on purpose; the full index is [`memory/MEMORY.md`](../memory/MEMORY.md).

## Bootstrap

- **Job:** dispatch. Read one `swarm.yaml`, deploy one VP per tmux pane, start each VP when its `depends_on` roles
  are done, and know when each one has finished.
- **Surfaces:** the `agentswarm` CLI (TypeScript, `dist/ceo.js`) and `agentswarm-sh` (bash), the `agentswarm-mcp`
  MCP server (3 tools), three skills in `skills/`, two sub-agents (`swarm-designer`, `swarm-doctor`), and a Claude
  Code plugin with a swarm guard hook.
- **Platform:** tmux and Node 18 or newer; the bash CLI also needs python3 with PyYAML; `sandbox-run` needs an
  `E2B_API_KEY`.
- **Search memory:** `agentswarm memory-search "<query>"` (BM25 over `memory/`, `brain/` and the top-level docs).
- **Check work:** `pnpm test` (vitest) and `pnpm eval` (surfaces, golden swarms with pass^3).

## Patterns discovered

- A VP prompt reaches the pane's shell, so it travels as one single-quoted argument.
- The pane shows the prompt, and the prompt names the signal: only a line that is exactly `{Role}: DONE` counts.
- A user's tmux may number windows and panes from 1; the swarm session numbers its own from 0.

## Errors encountered

See [`memory/LEARNINGS.md`](../memory/LEARNINGS.md): every error there ends in a rule.
