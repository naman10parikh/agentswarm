# skills/

Product-side harness skills authored specifically for agentswarm's job — turning a goal into a
deployed, monitored swarm. Each is a single `SKILL.md` with a trigger, numbered steps, and an
output contract:

| Skill          | When to use                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `author-swarm` | Turn a multi-step goal into a correct, deployable `swarm.yaml`.           |
| `run-swarm`    | Deploy a validated config and run the CEO loop to completion.             |
| `debug-swarm`  | Diagnose a swarm that is stuck, idle, deadlocked, or never finishing.     |

These are agentswarm-specific (they speak `swarm.yaml`, the `{Role}: DONE` signal, `depends_on`,
and the CEO monitoring loop) — distinct from the inherited harness skills in `.claude/skills/`
(architect, deep-think, self-improve, troubleshoot, etc.), which are general-purpose. See
`AGENTS.md` for the full directory map.
