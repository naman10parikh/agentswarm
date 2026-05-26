---
type: operations
status: active
created: 2026-05-26
updated: 2026-05-26
tags: [agentswarm, changelog, history]
source: ../CHANGELOG.md
related: ["[[MOC - agentswarm]]", "[[CONTEXT]]"]
---

# CHANGELOG (navigation note)

Navigation note for the version history. **Source of truth:** [`CHANGELOG.md`](../CHANGELOG.md).

## Summary

Release history. **0.2.0** — standalone public repo (zero `@energy/*` deps), Vitest suite for the
config loader, plus two fixes (TS `require` → `readFileSync` import so `status` works in the built
binary; Bash `validate` now prints specific errors under `set -e`). **0.1.0** — the `swarm.yaml`
format, the full command set, the CEO orchestration engine, status monitoring + JSON file,
`depends_on` resolution, two example configs, and YAML validation.

## Related notes

- [[MOC - agentswarm]]
- [[CONTEXT]]
