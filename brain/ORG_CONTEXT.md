---
type: company-brain
status: active
created: 2026-05-25
updated: 2026-05-26
tags: [agentswarm, company-brain]
source: CLAUDE.md
related: ["[[MOC - agentswarm]]", "[[ORG_MEMORY]]"]
---

# agentswarm — ORG_CONTEXT (the company brain's context)

Every agent reads this before acting. "If it is recorded, it happened to the AI."

## What this repo is

agentswarm is the **CEO layer** for AI agent swarms. Tools like agentgrid (or raw tmux) can
spawn a grid of Claude Code panes, but nothing coordinates them — agentswarm fills that gap. It
reads a declarative `swarm.yaml`, deploys a VP prompt into each pane, watches each pane's output
for a `{Role}: DONE` completion signal, resolves `depends_on` edges so VPs start in the right
order, flags panes that have gone idle, and writes a live status JSON to
`/tmp/agentswarm-{session}-status.json`. It is fractal delegation made concrete: one CEO, N VPs,
each in its own pane with its own model (opus for strategy, sonnet for implementation, haiku for
simple work).

## How it ships

A **dual-implementation CLI**. The TypeScript path (`src/ceo.ts` → `dist/ceo.js`, bin
`agentswarm`) is the default — self-contained, Node-only, no Python required. The Bash path
(`src/cli.sh` + `orchestrate.sh`/`parse-yaml.sh`/`status.sh`, bin `agentswarm-sh`) needs no build
step and is fully tmux-native, requiring only `bash`, `tmux`, and `python3` + PyYAML. Both speak
the same `swarm.yaml` and the same command set, and they must stay behavior-equivalent.

## The harness layer

Beyond the product, this repo carries the full Energy agent-native harness so it can maintain and
improve itself: `identity/` (SOUL/BRAND/HEARTBEAT), `memory/` + `brain/` (long-term memory + this
Obsidian knowledge graph), `skills/` + `.claude/skills`, `hooks/` + `.claude/hooks`,
`.claude/agents` (subagents), and `eval/` (eval + observer). The product is the CLI in `src/`; the
harness is how the repo evolves. Same formula as every Energy harness, different data.

## Source

Canonical operating brief: `CLAUDE.md`. Repo conventions: `AGENTS.md`. See [[MOC - agentswarm]]
for the full navigation graph.

## Related notes

- [[MOC - agentswarm]]
- [[ORG_MEMORY]]
