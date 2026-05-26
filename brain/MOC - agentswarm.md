---
type: moc
status: active
created: 2026-05-25
updated: 2026-05-26
tags: [agentswarm, moc]
related: ["[[ORG_CONTEXT]]", "[[ORG_MEMORY]]"]
---

# MOC — agentswarm

The master hub for this repo's brain. agentswarm is the **CEO layer** for AI agent swarms:
it reads a `swarm.yaml`, deploys one VP prompt per tmux pane running Claude Code, watches for
`{Role}: DONE` signals, resolves `depends_on` ordering, and writes a live JSON status file.
Every doc family is linked below — navigate from here, don't hunt the tree.

## Doc spine (agent operating contract)

- [[CLAUDE]] — agent operating brief: what-it-is + harness-component map + build/test + commits
- [[AGENTS]] — this repo's orchestration conventions, directory map, and invariants
- [[CONTEXT]] — current state + what's next + pointers to deeper docs
- [[README]] — human/OSS front door: install, the CEO pattern, full `swarm.yaml` reference
- [[QUICKSTART]] — install + build + run commands, inline
- [[CHANGELOG]] — version history (0.1.0 → 0.2.0)

## Company brain

- [[ORG_CONTEXT]] — what this repo is and the context every agent reads before acting
- [[ORG_MEMORY]] — what the fleet has learned; written back after acting

## Architecture

- The product source lives in `src/` (TypeScript CEO + Bash orchestrator) — see [[AGENTS]]
  "Directory map" and "The orchestration model" for the full picture.
- `examples/` holds runnable `swarm.yaml` topologies; `test/` holds the loader's Vitest suite.

## Operations

- Build / test / run commands: [[QUICKSTART]] and [[AGENTS]] "Build / test / run".
- CI (build + test on push/PR) is defined in `.github/workflows/ci.yml`.
- Inherited harness scripts (budget routing, memory compression, auto-switch, doc-health)
  live in `scripts/`.

## Decisions

- Dual-implementation CLI (TS default, Bash zero-build) — rationale in [[ORG_MEMORY]].
- Signal-based completion (`{Role}: DONE`) over output inference — see [[AGENTS]] invariants.

## Repository folder index (every top-level folder named)

| Folder               | What it holds                                                              |
| -------------------- | -------------------------------------------------------------------------- |
| `src/`               | PRODUCT source — TS CLI (`ceo.ts`, `loader.ts`, `tmux.ts`, `types.ts`) + Bash (`cli.sh`, `orchestrate.sh`, `parse-yaml.sh`, `status.sh`) |
| `dist/`              | Compiled JS (tsc output; gitignored)                                       |
| `examples/`          | Sample `swarm.yaml` configs (content-swarm, oss-pipeline)                  |
| `test/`              | Vitest unit tests (loader + validation paths)                              |
| `eval/`              | Harness eval + observer (self-improvement scoring)                         |
| `scripts/`           | Inherited Energy harness scripts (budget, memory, auto-switch, doc-health) |
| `skills/`            | Product-side harness skills (active set mirrored in `.claude/skills`)       |
| `hooks/`             | Product-side harness hooks (active set mirrored in `.claude/hooks`)         |
| `tools/`             | Product-side harness tool integrations                                     |
| `identity/`          | Agent identity — `SOUL.md`, `BRAND.md`, `HEARTBEAT.md`, `MEMORY.md`         |
| `memory/`            | Long-term memory — `MEMORY.md` index, `LEARNINGS.md`, `daily/topics/archive/maintainer-prompts/` |
| `brain/`             | Obsidian knowledge graph — this MOC + `ORG_CONTEXT` + `ORG_MEMORY`          |
| `MAINTAINER-PROMPTS/`| Root-level directive log (public-safe)                                     |
| `.claude/`           | Active harness — `rules/`, `skills/`, `hooks/`, `agents/`, `commands/`      |
| `.github/`           | CI workflow                                                                |
