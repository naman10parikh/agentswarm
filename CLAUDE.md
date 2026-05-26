# agentswarm — Agent-Native Harness

> Forged from Energy via harness-forge (CP103). One repo = one recursively self-improving
> agent-native harness. Energy is the control center; this is a self-contained flavor.

## What this is
agentswarm is the **CEO layer** for AI agent swarms. agentgrid (or raw tmux) can spawn a
grid of Claude Code panes — but who coordinates them? agentswarm reads a `swarm.yaml`,
deploys a VP prompt into each pane, watches for completion signals (`{Role}: DONE`),
resolves `depends_on` dependencies so VPs start in the right order, detects idle panes,
and writes a live JSON status file. It is a fractal-delegation orchestrator: one CEO,
N VPs, each in its own pane with its own model (opus/sonnet/haiku).

It ships as a **dual-implementation CLI**:
- **TypeScript** (`src/ceo.ts` → `dist/ceo.js`, bin `agentswarm`) — self-contained, only
  needs Node. This is the primary, portable path (no Python required).
- **Bash** (`src/cli.sh` + `orchestrate.sh`/`parse-yaml.sh`/`status.sh`, bin `agentswarm-sh`)
  — zero build step, tmux-native; requires `bash`, `tmux`, and `python3` + PyYAML.

## Product layout (standard CLI)
- `src/` — product source (TS modules + bash scripts). `dist/` — compiled JS (built by `tsc`).
- `examples/` — sample `swarm.yaml` configs (content pipeline, OSS pipeline).
- `test/` — Vitest unit tests (config loader + validation). Run with `pnpm test`.
- `install.sh` — installs the bash CLI into `~/.local/bin`.

## Harness components (the inherited formula)
This repo also carries the Energy agent-native harness so it can improve itself:
identity/ (SOUL/BRAND/HEARTBEAT) · memory/ + brain/ (long-term memory + Obsidian graph) ·
skills/ + .claude/skills · hooks/ + .claude/hooks · .claude/agents (subagents) ·
.mcp.json (MCP plugins) · eval/ (eval + observer). The **product** is the CLI in `src/`;
the harness layer is how the repo maintains and evolves itself. Same formula as every
Energy harness, different data.

## Operating model
You are Naman's co-founder. Act, don't ask. Self-improve every session. Test as a user.
Inherited rules in .claude/rules/ are glob-loaded every session.

## Commit convention
feat(skill): · feat(employee): · feat(company): — so git snap-back works at all 3 granularities.
