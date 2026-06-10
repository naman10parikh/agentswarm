---
name: author-swarm
description: Turn a multi-step goal into a correct, deployable agentswarm `swarm.yaml`. Use when the user wants to "run a swarm", "spin up a CEO + VPs", "parallelize this work across agents", or asks how to write/structure a swarm config. Produces a validated YAML that `agentswarm run` can deploy.
trigger: write a swarm | author a swarm.yaml | run a swarm | parallelize across agents | CEO + VPs | spin up a multi-agent run | how do I structure depends_on
---

# author-swarm — Goal → deployable `swarm.yaml`

This skill is agentswarm's core authoring task: take a goal that has several pieces of work
and express it as a `swarm.yaml` that the CEO orchestrator can deploy. The output is a
declarative file — one CEO in pane 0, N VPs in panes 1..N, each with its own model tier and
dependency edges.

## Trigger

Invoke when the user wants to run a multi-agent job and needs the config, e.g. "research →
write → edit → distribute", "build the package and write the docs in parallel", or any
request to "run a swarm" / "set up the VPs".

## Steps

1. **Decompose the goal into VP roles.** One role per independent unit of work. Give each a
   short, unique role name (the loader rejects duplicates). Strategic/coordination work →
   `opus`; implementation → `sonnet`; simple/mechanical → `haiku`.
2. **Draw the dependency graph.** For each VP, list the role names that must finish first in
   `depends_on`. A VP with no deps starts immediately; a VP with deps stays `pending` until
   every dep reports done. `depends_on` gates *deployment*, not just reporting — never assume
   a downstream VP can read an upstream output before the upstream is done.
3. **Write each prompt to end with the completion signal.** Every VP prompt MUST instruct the
   agent to print `{Role}: DONE` on its last line — that exact string is the ONLY thing the
   CEO treats as completion. No signal = the VP is never marked done (it will go idle and
   eventually hit `max_runtime`).
4. **Set the swarm-level knobs.** `name`, `session` (tmux session name), `poll_interval`
   (seconds between CEO checks — 60–120 is typical), `max_runtime` (minutes before
   auto-shutdown), `idle_timeout` (seconds of no output before a pane is flagged idle).
5. **List advisory `outputs`** per VP (the files it produces). These document intent; they do
   not gate anything.
6. **Validate before deploying.** Run `agentswarm validate <file>` (or the MCP
   `validate_swarm` tool). Fix every reported error — the validator catches missing sections,
   duplicate roles, and `depends_on` edges that point at undefined roles.
7. **Dry-run, then deploy.** `agentswarm run --dry <file>` prints the deployment plan without
   touching tmux; `agentswarm run <file>` deploys for real.

## Skeleton

```yaml
swarm:
  name: my-swarm
  session: swarm-my
  poll_interval: 90
  max_runtime: 120
  idle_timeout: 300
ceo:
  prompt: |
    You are the CEO. Monitor the VPs, resolve blockers, compile the result when all are done.
  model: opus
  context: [CLAUDE.md]
vps:
  - role: Research
    pane: 1
    prompt: |
      Do the research. Say "Research: DONE" on your last line.
    model: sonnet
  - role: Writer
    pane: 2
    prompt: |
      Wait for Research, then write. Say "Writer: DONE" on your last line.
    model: sonnet
    depends_on: [Research]
    outputs: [out/article.md]
```

## Output

A complete `swarm.yaml` plus the two verification commands you ran:

```
swarm.yaml written (N VPs, dependency chain: A → B → C)
agentswarm validate swarm.yaml   → ✓ Config valid
agentswarm run --dry swarm.yaml  → deployment plan printed
```

## Invariants this skill must preserve

- Role names unique across the swarm.
- Every VP prompt ends with its own `{Role}: DONE` line.
- Every `depends_on` entry references a role defined in the same file.
- Model tiers map to task tier (opus strategic / sonnet implementation / haiku simple).
