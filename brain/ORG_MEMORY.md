---
type: company-brain
status: active
created: 2026-05-25
updated: 2026-05-26
tags: [agentswarm, company-brain, learnings]
source: memory/LEARNINGS.md
related: ["[[MOC - agentswarm]]", "[[ORG_CONTEXT]]"]
---

# agentswarm — ORG_MEMORY (the company brain's memory)

Every agent writes back here after acting. The fleet inherits every workflow's learnings.

## Durable learnings (seeded)

- **Completion must be signal-based, never inferred.** A VP is "done" only when its prompt makes
  it print `{Role}: DONE` on its last line. Inferring completion from "no more output" or "file
  exists" is unreliable — panes pause, stream, and re-render. The `idle_timeout` heuristic is for
  *detecting stalls*, not for declaring success.
- **Keep the two implementations behavior-equivalent.** Any change to deploy/poll/status logic in
  the TypeScript path (`src/ceo.ts`) must be mirrored in the Bash path (`orchestrate.sh` /
  `status.sh`). `examples/*.yaml` must validate under both CLIs. Divergence is a silent bug class.
- **`depends_on` gates deployment, not just reporting.** A VP must not be *spawned* until all its
  dependencies report done — otherwise downstream panes burn tokens waiting on inputs that don't
  exist yet.
- **The status-JSON shape is a public API.** `/tmp/agentswarm-{session}-status.json` is consumed
  programmatically; changing `{ timestamp, session, vps: [{ role, pane, status }] }` requires a
  CHANGELOG entry.

## How this connects

These mirror the canonical, append-only log in `memory/LEARNINGS.md` and the invariants in
`AGENTS.md`. New cross-session learnings get added there first, then summarized here for the
brain graph.

## Related notes

- [[MOC - agentswarm]]
- [[ORG_CONTEXT]]
