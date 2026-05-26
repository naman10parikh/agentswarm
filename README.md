# agentswarm

**CEO orchestration for AI agent swarms.** Define VP roles in a `swarm.yaml`, deploy each
into its own tmux pane running Claude Code, and let a CEO loop monitor progress, resolve
dependencies, and report status — automatically.

## Why

You can spawn a grid of Claude Code panes (with [agentgrid](https://github.com/naman10parikh/agentgrid)
or raw tmux). But who coordinates them? Who decides what each pane works on, tracks
progress, handles ordering, and notices when a pane has gone idle?

**agentswarm is the CEO layer.** It reads a config, deploys VP prompts, watches for
completion signals, sequences work via `depends_on`, and writes a live status file — so a
multi-agent run is declarative instead of manual.

## The CEO pattern

```
                    ┌─────────┐
                    │   CEO   │  reads swarm.yaml
                    │ (pane 0)│  monitors all VPs
                    └────┬────┘  resolves dependencies
                         │
          ┌──────────┬───┴───┬──────────┐
          ▼          ▼       ▼          ▼
     ┌─────────┐┌────────┐┌────────┐┌──────────┐
     │VP Research││VP Writer││VP Editor││VP Distrib│
     │ (pane 1) ││(pane 2)││(pane 3)││ (pane 4) │
     └─────────┘└────────┘└────────┘└──────────┘
```

Each VP runs in its own tmux pane with its own Claude Code instance and model. The CEO
polls for `{Role}: DONE`, tracks `depends_on`, and flags idle panes.

## Two ways to run it

agentswarm ships **two implementations of the same CLI**:

| Path           | Bin             | Needs                            | When                                      |
| -------------- | --------------- | -------------------------------- | ----------------------------------------- |
| **TypeScript** | `agentswarm`    | Node ≥ 18 only                   | Default. Portable, no Python dependency.  |
| **Bash**       | `agentswarm-sh` | `bash`, `tmux`, `python3`+PyYAML | Zero build step, fully tmux-native.       |

Both speak the same `swarm.yaml` and the same commands. Pick whichever fits your machine.

## Install

### Via npm (TypeScript CLI)

```bash
npm install -g agentswarm     # or: pnpm add -g agentswarm
agentswarm --help
```

### From source

```bash
git clone https://github.com/naman10parikh/agentswarm.git
cd agentswarm
pnpm install && pnpm build
node dist/ceo.js --help        # TypeScript CLI
```

### Bash CLI (standalone, no build)

```bash
# Installs `agentswarm` into ~/.local/bin (wraps src/cli.sh)
bash install.sh

# Requirements: bash, tmux, and python3 with PyYAML
pip3 install pyyaml            # if not already present
```

> The bash path uses `python3` + PyYAML to parse YAML. If PyYAML is missing, the CLI tells
> you exactly that. The TypeScript path has no Python dependency.

## Quick start

```bash
# 1. Create a starter config
agentswarm init                       # writes swarm.yaml

# 2. Validate it (shows the exact error if anything is wrong)
agentswarm validate swarm.yaml

# 3. Preview the deployment — no tmux session is created
agentswarm run --dry swarm.yaml

# 4. Deploy the swarm for real
agentswarm run swarm.yaml

# 5. Check progress / stop
agentswarm status swarm-my
agentswarm stop swarm-my
```

## `swarm.yaml` format

```yaml
swarm:
  name: my-swarm # Human-readable name
  session: swarm-my # tmux session name
  poll_interval: 120 # Seconds between CEO status checks
  max_runtime: 180 # Minutes before auto-shutdown
  idle_timeout: 300 # Seconds of no output ⇒ pane marked idle

ceo:
  prompt: |
    You are the CEO. Monitor VPs and coordinate.
  model: opus # opus | sonnet | haiku
  context:
    - CLAUDE.md # Files injected into CEO context

vps:
  - role: VP Research # Unique role name
    pane: 1 # Pane number
    prompt: |
      Do research. Say "VP Research: DONE" when finished.
    model: sonnet
    workdir: .
    depends_on: [] # Roles that must finish before this VP starts
    outputs: # Files this VP produces (advisory)
      - research/output.md
```

### Rules

1. **Role names must be unique** across the swarm.
2. **Completion signal:** each VP must print `{Role}: DONE` on its last line when finished.
3. **Dependencies:** `depends_on` lists role names that must complete first.
4. **Models:** `opus` for strategic, `sonnet` for implementation, `haiku` for simple tasks.

## Commands

| Command                         | Description                           |
| ------------------------------- | ------------------------------------- |
| `agentswarm run <config>`       | Deploy swarm from YAML config         |
| `agentswarm run --dry <config>` | Preview deployment without tmux       |
| `agentswarm validate <config>`  | Check config; prints precise errors   |
| `agentswarm status <session>`   | Show VP progress dashboard            |
| `agentswarm stop <session>`     | Kill a running swarm                  |
| `agentswarm list`               | List active swarm sessions (bash CLI) |
| `agentswarm init`               | Create a starter swarm.yaml (bash CLI)|

## Status monitoring

agentswarm tracks each VP as `RUNNING ▶`, `IDLE ⏸` (no output past `idle_timeout`), or
`DONE ✓`. Status is also written to `/tmp/agentswarm-{session}-status.json` for
programmatic access:

```json
{
  "timestamp": "2026-03-17T14:30:00Z",
  "session": "swarm-content",
  "vps": [
    { "role": "VP Research", "pane": 1, "status": "done" },
    { "role": "VP Writer", "pane": 2, "status": "running" }
  ]
}
```

## Examples

```bash
agentswarm run examples/content-swarm.yaml   # Research → Writer → Editor → Distribution
agentswarm run examples/oss-pipeline.yaml     # Research → Builder → Docs
```

## Development

```bash
pnpm install      # install deps
pnpm build        # tsc → dist/
pnpm test         # vitest (config loader + validation)
pnpm lint         # tsc --noEmit
```

## See also

- [agentgrid](https://github.com/naman10parikh/agentgrid) — the tmux grid primitives agentswarm deploys onto.
- Built on the [Energy](https://github.com/naman10parikh/Energy) agent-native harness formula.

## License

MIT
