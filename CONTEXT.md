# agentswarm — Session Context

**Read this at the start of every session.**

## Current state

- **v0.2.0 — shipped & green.** Standalone public OSS repo (zero `@energy/*` deps). Build passes
  (`tsc`, 0 errors) and `pnpm test` passes (6 tests: config loader + 5 validation paths).
- **Product is real:** dual-implementation CLI (TypeScript `src/ceo.ts` → bin `agentswarm`; Bash
  `src/cli.sh` → bin `agentswarm-sh`). Commands: `run`, `run --dry`, `validate`, `status`, `stop`,
  `list`, `init`. Two example swarms in `examples/`.
- **Docs:** agent-native doc spine in place (CLAUDE.md, AGENTS.md, README, QUICKSTART, brain/ MOC +
  ORG_CONTEXT + ORG_MEMORY, memory/ seeded). AGENTS.md is repo-specific (rewritten from the
  mis-copied WikiMem schema in CP104).

## Origin

- **Forged:** 2026-05-25 from Energy (CP103 multi-repo extraction via harness-forge).
- **Standardized:** 2026-05-26 to the CP104 agent-native doc standard.

## What's next

- Layer in a real `.env` if/when the CEO loop needs API keys directly (currently it deploys
  Claude Code into panes, which carry their own auth).
- Keep the TypeScript and Bash implementations behavior-equivalent (see AGENTS.md invariant #5).
- Grow `examples/` with more swarm topologies (earning, research, engineering-sprint).

## Pointers to deeper docs

- `README.md` — full `swarm.yaml` reference, command table, status-JSON contract.
- `AGENTS.md` — directory map + orchestration invariants + commit convention.
- `CLAUDE.md` — agent operating brief + harness-component map.
- `brain/MOC - agentswarm.md` — navigation hub linking every doc.
- `CHANGELOG.md` — version history (0.1.0 → 0.2.0).
