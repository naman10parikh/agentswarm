# AGENTS.md: agentswarm

> The one set of instructions for every coding agent (Codex, Cursor, OpenCode, Copilot, Gemini CLI, Claude Code) and
> for the people steering them. `CLAUDE.md` and `GEMINI.md` import this file.

## What it does

agentswarm turns one `swarm.yaml` into a team of coding agents. It opens one tmux pane per role, starts a Claude Code
agent in each with that role's prompt, starts a role only when the roles it depends on are done, and writes a live
status file. Its agent employee is **Hive** ([identity/SOUL.md](identity/SOUL.md)), whose job is **dispatch**. Use it
when a goal splits into parts with a clear order: research before writing, writing before editing.

## Tools and how to call them

**Command line** (`agentswarm`, TypeScript, built to `dist/ceo.js`):

| Command | What it does |
| --- | --- |
| `agentswarm validate <swarm.yaml>` | check a config: required sections, unique roles, every `depends_on` names a real role |
| `agentswarm run --dry <swarm.yaml>` | print the plan (panes, models, dependencies) without opening tmux |
| `agentswarm run <swarm.yaml>` | deploy the swarm and run the CEO loop until every role is done or `max_runtime` ends it |
| `agentswarm status <session>` | each role's status, from `/tmp/agentswarm-<session>-status.json` |
| `agentswarm stop <session>` | end the swarm's tmux session |
| `agentswarm list` | running swarm sessions |
| `agentswarm memory-search "<query>"` | BM25 search over this repository's memory and docs |
| `agentswarm log` | the append-only run log, one line per command (`logs/runs.jsonl`) |
| `agentswarm sandbox-run <swarm.yaml>` | validate an untrusted config inside an E2B microVM (needs `E2B_API_KEY`) |
| `agentswarm --help` · `agentswarm --version` | help and version |

`agentswarm-sh` is the same CLI in bash with no build step (it needs python3 and PyYAML). It adds
`agentswarm-sh init`, which writes a starter `swarm.yaml`. Like `agentswarm`, it waits on `depends_on` and passes
each role's `model` to its agent.

**MCP server** (`agentswarm-mcp`, stdio, 3 tools): `validate_swarm` checks a config, `swarm_status` reads a running
swarm's status, `memory_search` searches this repository's memory. Start it with
`npx -y -p github:naman10parikh/agentswarm agentswarm-mcp`.

**Skills** ([skills/](skills/)): `author-swarm` turns a goal into a valid `swarm.yaml`; `run-swarm` deploys one and
follows it to done; `debug-swarm` finds why a swarm is stuck.

**Sub-agents** ([.claude/agents/](.claude/agents/)): `swarm-designer` writes and validates a config for a goal;
`swarm-doctor` diagnoses a stuck swarm, read-only.

## What not to do

- Never put a role's prompt into a shell string unquoted: it reaches the pane's shell. `src/vp.ts` single-quotes it;
  keep every launch going through `vpLaunchCommand`.
- Never mark a role done on anything but a line that is exactly `{Role}: DONE`. The pane also shows the prompt, and
  the prompt names the signal.
- Never assume a tmux numbering: the person's tmux may count windows and panes from 1. The swarm session sets its own
  to 0.
- Never `tmux kill-server` or `tmux select-pane` (without `-T`) outside a private `-L` server: the first ends every
  swarm, the second steals the person's focus. The plugin's `swarm-guard` hook blocks both.
- Never test a swarm in the person's own tmux: `pnpm eval` runs every swarm on a private server with stand-in agents.
- Never commit a key, a home path or a run log (`logs/`, `.claude/audit.jsonl`).
- Never merge a change that fails `pnpm test` or `pnpm eval`.

## Directory map (the whole repo)

```
src/                  # PRODUCT source — the CLI itself
  ceo.ts              #   TypeScript CEO orchestrator (commander-based, bin `agentswarm`)
  vp.ts               #   how a role starts (quoted prompt) and when it is done (exact signal line)
  loader.ts           #   swarm.yaml parser + Zod-style schema validation (unit-tested)
  tmux.ts             #   tmux session/pane primitives (create, send-keys, capture)
  mcp-server.ts       #   the `agentswarm-mcp` stdio server (validate_swarm, swarm_status, memory_search)
  memory-search.ts    #   BM25 index over memory/, brain/ and the top-level docs
  run-log.ts          #   append-only run log (logs/runs.jsonl)
  sandbox.ts          #   E2B microVM validation for untrusted configs
  types.ts            #   shared TS types (SwarmConfig, VP, CeoConfig, status enums)
  cli.sh              #   Bash CLI entrypoint (bin `agentswarm-sh`)
  orchestrate.sh      #   Bash deploy loop — creates session, injects prompts, polls
  parse-yaml.sh       #   Bash YAML reader (python3 + PyYAML shim)
  status.sh           #   Bash status renderer + JSON status writer
dist/                 # Compiled JS (tsc output; gitignored, rebuilt by `pnpm build` and by `prepare`)
examples/             # Sample swarm.yaml configs (content-swarm, oss-pipeline)
test/                 # Vitest unit and integration tests
eval/                 # Evals: surfaces.py (every surface the docs promise), golden.sh (real swarms, pass^3)
scripts/              # improve.mjs (one turn of the improvement loop) + inherited harness scripts
skills/               # agentswarm's own skills (author-swarm, run-swarm, debug-swarm)
hooks/                # the plugin's hooks (swarm-guard.mjs, hooks.json)
identity/             # Agent identity: SOUL.md, BRAND.md, HEARTBEAT.md, MEMORY.md
memory/               # Long-term memory: MEMORY.md (index) + LEARNINGS.md + daily/topics/archive
brain/                # Obsidian knowledge graph: MOC + ORG_CONTEXT + ORG_MEMORY (navigation layer)
.claude/              # Active harness: rules/, skills/, hooks/, agents/ (subagents), commands/
.claude-plugin/       # Claude Code plugin manifest and one-plugin marketplace
.github/              # CI (build, test, eval on push/PR) and the nightly improvement loop
install.sh            # Installs the bash CLI into ~/.local/bin
```

The **product** is `src/` (+ `examples/`, `test/`, `install.sh`). Everything under `identity/`,
`memory/`, `brain/`, `skills/`, `hooks/`, `eval/`, `scripts/`, and `.claude/` is the
**agent-native harness**: the machinery that lets the repo maintain and improve itself.

## The orchestration model (what the code does)

```
CEO (the `agentswarm run` process)  ──reads──▶  swarm.yaml
   │                         (swarm settings · ceo prompt+model · vps[])
   │  deploys VP prompts → one pane per VP in window 0 (one Claude Code per pane)
   │  polls every poll_interval seconds:
   │     • a line in the pane's tail is exactly "{Role}: DONE"  → status: done
   │     • no new output past idle_timeout                       → status: idle
   │     • otherwise                                             → status: running
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
2. **Completion is signal-based:** a VP is "done" when a line of its pane output is exactly `{Role}: DONE`. Do not
   infer completion from anything else.
3. **`depends_on` gates deployment**, not just reporting: a VP must not be spawned before its dependencies report
   done.
4. **Models map to task tier:** `opus` strategic · `sonnet` implementation · `haiku` simple. Both runners pass a
   VP's `model` to `claude` as `--model <value>`, exactly as the file writes it. A VP with no `model` gets no flag and
   runs on Claude Code's default. Never fill in a model the file does not set.
5. **The two implementations stay behavior-equivalent.** A change to deploy/poll/status logic in
   `src/ceo.ts` must be mirrored in the bash path (`orchestrate.sh`/`status.sh`) and vice versa.
   `examples/*.yaml` must validate under both.
6. **Status JSON shape is a public API** (`/tmp/agentswarm-{session}-status.json`). Don't break
   the `{ timestamp, session, vps: [{ role, pane, status }] }` contract without a CHANGELOG note.
7. **A prompt is text, never shell.** Both implementations pass it to `claude` as one single-quoted argument.

## Build / test / run

```bash
pnpm install        # deps (chalk, commander, yaml, e2b)
pnpm build          # tsc → dist/   (REQUIRED before the TS bin works)
pnpm test           # vitest run    (loader, orchestration, memory, run log, signal and quoting)
pnpm eval           # surfaces + golden swarms on a private tmux server, pass^3 (needs tmux and python3)
pnpm lint           # tsc --noEmit

node dist/ceo.js --help            # TypeScript CLI (after build)
bash src/cli.sh validate examples/content-swarm.yaml   # Bash CLI (no build)
```

Anything touching `src/` must keep `pnpm build` (0 TS errors), `pnpm test` and `pnpm eval` green.
CI (`.github/workflows/ci.yml`) enforces all three on every push and PR.

## Commit convention

This repo follows Conventional Commits, plus three harness-granularity scopes so git snap-back
works at every level:

- `feat(skill):` — a reusable capability (smallest unit you can revert/restore)
- `feat(employee):` — an agent/VP role or persona
- `feat(company):` — a whole swarm definition / orchestration topology
- Standard scopes also used: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`.

## Operating model

Act, then test as a user: "it compiles" means nothing. Run the CLI against `examples/` and read the output. When
you fix an error, add it to `memory/LEARNINGS.md` as what broke, the root cause and the rule. Inherited rules in
`.claude/rules/` are glob-loaded every session and are binding.

## See also

- `CLAUDE.md` — what is specific to Claude Code in this repository.
- `brain/MOC - agentswarm.md` — the knowledge-graph hub for all docs.
- `README.md` — the front door, with the full `swarm.yaml` reference.
