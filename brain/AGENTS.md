---
type: architecture
status: active
created: 2026-05-26
updated: 2026-05-26
tags: [agentswarm, conventions]
source: ../AGENTS.md
related: ["[[MOC - agentswarm]]", "[[CLAUDE]]", "[[README]]"]
---

# AGENTS (navigation note)

Navigation note for this repo's orchestration conventions. **Source of truth:** [`AGENTS.md`](../AGENTS.md).

## Summary

The agent-native contract for working *inside* agentswarm: the full directory map, the
orchestration model (CEO reads `swarm.yaml` → deploys VP prompts to panes → polls for
`{Role}: DONE` → resolves `depends_on` → writes status JSON), the six invariants (unique roles,
signal-based completion, dependency-gated deploys, model tiers, TS/Bash equivalence, status-JSON
as public API), build/test commands, and the commit convention. This file was rewritten in CP104
from the mis-copied WikiMem wiki-schema template.

## Related notes

- [[MOC - agentswarm]]
- [[CLAUDE]]
- [[README]]
