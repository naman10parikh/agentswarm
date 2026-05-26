# AGENTS.md — agentswarm Orchestration Conventions

> How agents (and contributors) operate **inside this repo**. agentswarm is the CEO layer
> for AI agent swarms: it reads a `swarm.yaml`, deploys one VP prompt per tmux pane running
> Claude Code, watches for `{Role}: DONE` completion signals, resolves `depends_on` ordering,
> detects idle panes, and writes a live JSON status file. This document is the agent-native
> contract for working on agentswarm — it co-evolves with the code.

## What this repo is (one line)

A **dual-implementation CLI** (TypeScript + Bash) that orchestrates a swarm of Claude Code
panes from a declarative `swarm.yaml`: CEO in pane 0, N VPs in panes 1..N, each with its own
model and dependency edges.

## Directory map (the whole repo)

```
src/                  # PRODUCT source — the CLI itself
  ceo.ts              #   TypeScript CEO orchestrator (commander-based, bin `agentswarm`)
  loader.ts           #   swarm.yaml parser + Zod-style schema validation (unit-tested)
  tmux.ts             #   tmux session/pane primitives (create, send-keys, capture)
  types.ts            #   shared TS types (SwarmConfig, VP, CeoConfig, status enums)
  cli.sh              #   Bash CLI entrypoint (bin `agentswarm-sh`)
  orchestrate.sh      #   Bash deploy loop — creates session, injects prompts, polls
  parse-yaml.sh       #   Bash YAML reader (python3 + PyYAML shim)
  status.sh           #   Bash status renderer + JSON status writer
dist/                 # Compiled JS (tsc output; gitignored, rebuilt by `pnpm build`)
examples/             # Sample swarm.yaml configs (content-swarm, oss-pipeline)
test/                 # Vitest unit tests (loader.test.ts — config + 5 validation paths)
eval/                 # Harness eval + observer (self-improvement scoring; see CLAUDE.md)
scripts/              # Inherited Energy harness scripts (budget, memory, auto-switch, doc-health)
skills/ hooks/ tools/ # Harness extension points (product-side; .claude/ mirrors the active set)
identity/             # Agent identity: SOUL.md, BRAND.md, HEARTBEAT.md, MEMORY.md
memory/               # Long-term memory: MEMORY.md (index) + LEARNINGS.md + daily/topics/archive
  maintainer-prompts/ #   Captured directives that shaped the repo (public-safe)
brain/                # Obsidian knowledge graph: MOC + ORG_CONTEXT + ORG_MEMORY (navigation layer)
MAINTAINER-PROMPTS/   # Root-level directive log (public-safe; mirrors memory/maintainer-prompts)
.claude/              # Active harness: rules/, skills/, hooks/, agents/ (subagents), commands/
.github/              # CI workflow (build + test on push/PR)
install.sh            # Installs the bash CLI into ~/.local/bin
```

The **product** is `src/` (+ `examples/`, `test/`, `install.sh`). Everything under `identity/`,
`memory/`, `brain/`, `skills/`, `hooks/`, `tools/`, `eval/`, `scripts/`, and `.claude/` is the
inherited **agent-native harness** — the machinery that lets the repo maintain and improve
itself. Same formula as every Energy harness, different data.

## The orchestration model (what the code does)

```
CEO (pane 0)  ──reads──▶  swarm.yaml
   │                         (swarm settings · ceo prompt+model · vps[])
   │  deploys VP prompts → panes 1..N (one Claude Code per pane, per-VP model)
   │  polls every poll_interval seconds:
   │     • scans each pane's tail for "{Role}: DONE"  → status: done
   │     • no new output past idle_timeout            → status: idle
   │     • otherwise                                  → status: running
   │  honors depends_on: a VP is only deployed once all its deps are done
   │  writes /tmp/agentswarm-{session}-status.json every cycle
   └──auto-shuts-down after max_runtime minutes
```

### swarm.yaml is the contract

`swarm:` (name, session, poll_interval, max_runtime, idle_timeout) · `ceo:` (prompt, model,
context files) · `vps[]:` (role, pane, prompt, model, workdir, depends_on, outputs). Full schema
and an annotated example live in `README.md` and `examples/`.

### Invariants every agent working here must preserve

1. **Role names are unique** across a swarm (the loader rejects duplicates).
2. **Completion is signal-based:** a VP is "done" when its prompt makes it print `{Role}: DONE`
   on its final line. Do not infer completion from anything else.
3. **`depends_on` gates deployment**, not just reporting — a VP must not be spawned before its
   dependencies report done.
4. **Models map to task tier:** `opus` strategic · `sonnet` implementation · `haiku` simple.
5. **The two implementations stay behavior-equivalent.** A change to deploy/poll/status logic in
   `src/ceo.ts` must be mirrored in the bash path (`orchestrate.sh`/`status.sh`) and vice versa.
   `examples/*.yaml` must validate under both.
6. **Status JSON shape is a public API** (`/tmp/agentswarm-{session}-status.json`). Don't break
   the `{ timestamp, session, vps: [{ role, pane, status }] }` contract without a CHANGELOG note.

## Build / test / run

```bash
pnpm install        # deps (chalk, commander, yaml)
pnpm build          # tsc → dist/   (REQUIRED before the TS bin works)
pnpm test           # vitest run    (loader + 5 validation paths — must stay green)
pnpm lint           # tsc --noEmit

node dist/ceo.js --help            # TypeScript CLI (after build)
bash src/cli.sh validate examples/content-swarm.yaml   # Bash CLI (no build)
```

Anything touching `src/` must keep `pnpm build` (0 TS errors) and `pnpm test` (all pass) green —
CI (`.github/workflows/ci.yml`) enforces both on every push and PR.

## Commit convention

This repo follows Conventional Commits, plus three harness-granularity scopes so git snap-back
works at every level:

- `feat(skill):` — a reusable capability (smallest unit you can revert/restore)
- `feat(employee):` — an agent/VP role or persona
- `feat(company):` — a whole swarm definition / orchestration topology
- Standard scopes also used: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`.

## Operating model

You are the maintainer's co-founder, not an assistant. Act, don't ask. Self-improve every
session (append to `memory/LEARNINGS.md`). Test as a user — "it compiles" means nothing; run the
CLI against `examples/` and read the output. Inherited rules in `.claude/rules/` are glob-loaded
every session and are binding.

## See also

- `CLAUDE.md` — the agent operating brief (this file's companion).
- `brain/MOC - agentswarm.md` — the knowledge-graph hub for all docs.
- `README.md` — human/OSS front door with the full `swarm.yaml` reference.
- `AGENTS.md.example` — *(not present)* this repo writes its real conventions directly here;
  the WikiMem-style wiki-schema template this file was forged from has been fully replaced.
