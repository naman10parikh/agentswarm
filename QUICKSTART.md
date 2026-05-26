# agentswarm — Quickstart

agentswarm is the **CEO layer** for AI agent swarms: define VP roles in a `swarm.yaml`, deploy
each into its own tmux pane running Claude Code, and let a CEO loop monitor progress, resolve
`depends_on` ordering, and write a live status file.

## Install + build + run (TypeScript CLI — the default path)

```bash
git clone https://github.com/naman10parikh/agentswarm.git
cd agentswarm
pnpm install            # install deps
pnpm build              # tsc → dist/  (required before the bin works)
node dist/ceo.js --help # the agentswarm CLI

# or after global install:  npm install -g agentswarm  →  agentswarm --help
```

## First swarm (3 commands)

```bash
agentswarm init                       # writes a starter swarm.yaml
agentswarm validate swarm.yaml        # prints the exact error if anything is wrong
agentswarm run --dry swarm.yaml       # preview the deployment — no tmux session created
agentswarm run swarm.yaml             # deploy for real; agentswarm status / stop to manage
```

Or run a bundled example directly:

```bash
agentswarm run examples/content-swarm.yaml   # Research → Writer → Editor → Distribution
```

## Bash CLI (zero build step, tmux-native)

```bash
bash install.sh                                  # installs `agentswarm-sh` into ~/.local/bin
pip3 install pyyaml                              # the bash path needs python3 + PyYAML
bash src/cli.sh validate examples/oss-pipeline.yaml
```

## Develop

```bash
pnpm test    # vitest — config loader + validation paths (keep green)
pnpm lint    # tsc --noEmit
```

## Where everything lives

- **Full `swarm.yaml` reference + command table:** `README.md`
- **Repo conventions + directory map + invariants:** `AGENTS.md`
- **Agent operating brief + harness-component map:** `CLAUDE.md`
- **Knowledge-graph hub for all docs:** `brain/MOC - agentswarm.md`
