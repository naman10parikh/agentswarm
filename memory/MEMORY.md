# agentswarm — Long-Term Memory (index)

> Inherited memory-harness structure. One line per durable fact.
> Layers: this index → topics/ deep-dives → daily/ logs → archive/ (compressed >30d, never deleted).

## Architecture Decisions

- Dual-implementation CLI: TypeScript (`src/ceo.ts`, bin `agentswarm`, Node-only, default) +
  Bash (`src/cli.sh`, bin `agentswarm-sh`, zero-build, tmux-native, needs python3+PyYAML).
- Completion is **signal-based** (`{Role}: DONE` on a VP's last line), never inferred from output
  silence or file existence. `idle_timeout` detects stalls, it does not declare success.
- `depends_on` gates *deployment* (a VP isn't spawned until its deps are done), not just reporting.

## Key Patterns

- Fractal delegation: one CEO (pane 0) + N VPs (panes 1..N), each VP in its own pane with its own
  model tier (opus strategic / sonnet implementation / haiku simple).
- `swarm.yaml` is the single declarative contract: `swarm` settings, `ceo` def, `vps[]` list.
- Status is mirrored to `/tmp/agentswarm-{session}-status.json` as a programmatic public API.

## Technology Choices

- TypeScript strict mode, ESM (`"type": "module"`); deps: `commander`, `chalk`, `yaml`.
- Vitest for tests; `tsc` for build + `tsc --noEmit` for lint.
- Zero `@energy/*` dependencies — fully standalone for public release.

## People & Resources

- Maintainer: the repo author (see LICENSE / package.json).
- Sibling tool: agentgrid (the tmux grid primitives agentswarm deploys onto).
- Forged from the Energy agent-native harness formula.

## What NOT to Do

- Do not let the TypeScript and Bash implementations drift — keep deploy/poll/status equivalent.
- Do not break the status-JSON shape without a CHANGELOG note.
- Do not infer VP completion from anything but the explicit `{Role}: DONE` signal.

## Operating Model

- Co-founder posture: act, don't ask; self-improve every session; test as a user (run the CLI
  against `examples/` and read the output, not just `pnpm build`).

## Topic Files Index

- _(none yet — add deep-dives under memory/topics/ as the repo grows)_
