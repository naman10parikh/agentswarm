---
name: run-swarm
description: Deploy a validated agentswarm `swarm.yaml` and run the CEO monitoring loop to completion. Use when the user has a config and wants to "deploy the swarm", "spin up the panes and watch them", "kick off the CEO loop", or "run it and tell me when it's done". Covers the full deploy → monitor → status → completion lifecycle, including pre-validating an untrusted config in an E2B sandbox first.
trigger: deploy the swarm | run swarm.yaml | start the CEO loop | spin up the VPs | watch the swarm | run it and tell me when done | check swarm progress | swarm status
---

# run-swarm — Deploy a config and run the CEO loop to completion

`author-swarm` produces the `swarm.yaml`; `debug-swarm` fixes one that is stuck. This skill is
the step between them: take a *validated* config, deploy the CEO + VP panes, and run the
monitoring loop until every VP reports done (or `max_runtime` fires). It is agentswarm's
actual run-time job — deploy, poll, sequence `depends_on`, flag idle, write status.

## Trigger

Invoke when the user has a config in hand and wants it running: "deploy `content-swarm.yaml`",
"run it and watch the panes", "kick off the CEO", or "is the swarm done yet?".

## Steps

1. **Validate first — every time.** `agentswarm validate <config>` (or the MCP `validate_swarm`
   tool). Never deploy an unvalidated file: a duplicate role or a `depends_on` pointing at an
   undefined role aborts mid-deploy and leaves a half-spawned tmux session. Fix every error
   before going further.
2. **For an UNTRUSTED config, validate in isolation.** If the `swarm.yaml` came from outside
   (a teammate, a generated artifact, the internet), run `agentswarm sandbox-run <config>`
   first. It boots an E2B microVM, ships the config + validator into it, and validates the file
   *inside the sandbox* — so the host never parses/executes untrusted prompt text directly.
   Requires `E2B_API_KEY` in `.env`.
3. **Dry-run to see the deployment plan.** `agentswarm run --dry <config>` prints the CEO + VP
   layout, model tiers, and dependency edges WITHOUT touching tmux. Confirm the plan matches
   intent (right panes, right deps, right models) before spawning anything.
4. **Deploy for real.** `agentswarm run <config>` creates the tmux session, splits one pane per
   VP, deploys dependency-free VPs immediately (and holds `depends_on` VPs as `pending`), then
   enters the monitoring loop. Attach to watch live: `tmux attach -t <session>`.
5. **Monitor progress without attaching.** From another shell: `agentswarm status <session>`
   for the per-VP RUNNING/IDLE/DONE summary, or read the machine-readable
   `/tmp/agentswarm-<session>-status.json` (the programmatic public API). The CEO marks a VP
   `done` only on the exact `{Role}: DONE` string and deploys a `pending` VP only once all its
   deps are done.
6. **Watch for the two stall modes.** A pane flagged `IDLE` (no output past `idle_timeout`) or
   a `pending` VP that never deploys means something upstream is stuck → switch to the
   `debug-swarm` skill and walk its failure tree. Do not lower `idle_timeout` to mask a stall.
7. **Confirm completion + review the audit trail.** The loop prints `All VPs complete!` and
   sets `allDone: true` in the status JSON when every VP is done. Afterwards, `agentswarm log`
   shows the run-log audit trail (each invocation: command + duration + ok/error) so you can
   confirm the deploy ran clean and how long it took.

## Quick command sequence

```bash
agentswarm validate swarm.yaml          # 1. schema-check (always)
agentswarm sandbox-run swarm.yaml       # 2. isolate-validate IF untrusted (needs E2B_API_KEY)
agentswarm run --dry swarm.yaml         # 3. preview the deployment plan
agentswarm run swarm.yaml               # 4. deploy + start the CEO monitoring loop
agentswarm status <session>             # 5. check progress from another shell
agentswarm log --limit 20               # 7. review the run-log audit trail
```

## Output

A deployed, monitored swarm plus the verification you ran, e.g.:

```
validate swarm.yaml      → ✓ Config valid (4 VPs, chain Research → Writer → Editor → Distribution)
run --dry swarm.yaml     → deployment plan printed (panes 0..4, models opus/sonnet/sonnet/sonnet/haiku)
run swarm.yaml           → session "swarm-content" created; CEO loop running
status swarm-content     → 4/4 VPs complete · allDone: true
log                      → run ✓ (deploy 1m12s)
```

## Invariants this skill must preserve

- Always `validate` (and `sandbox-run` for untrusted configs) BEFORE `run` — never deploy an
  unchecked file into a live tmux session.
- Completion is read ONLY from the `{Role}: DONE` signal and the status JSON — never inferred
  from a quiet pane or an existing output file.
- A stalled run is a `debug-swarm` problem, not a reason to relaunch the whole swarm.
