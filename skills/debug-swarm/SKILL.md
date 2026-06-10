---
name: debug-swarm
description: Diagnose a swarm that is stuck, idle, deadlocked, or never finishing. Use when a swarm "isn't progressing", "a VP is stuck/idle", "it never says DONE", "the dependent VP never started", or "the run timed out". Walks the failure tree (config → signal → dependency → idle) and names the exact fix.
trigger: swarm stuck | VP idle | never finishes | dependency deadlock | DONE not detected | swarm timed out | pane not deploying | run hung
---

# debug-swarm — Diagnose a stuck or failing swarm

agentswarm completion is signal-based and dependency-gated, so almost every "it's stuck"
report traces to one of four causes. Walk them in order; stop at the first that matches.

## Trigger

Invoke when a deployed swarm is not making progress: a VP shows `IDLE`, a downstream VP never
deploys, the run hits `max_runtime` with VPs still `running`, or `agentswarm status` shows
fewer done than expected.

## Steps (the failure tree — check in this order)

1. **Config is invalid (it never deployed cleanly).** Run `agentswarm validate <config>`. A
   duplicate role, a missing section, or a `depends_on` pointing at an undefined role aborts
   the run. Fix and re-deploy. *Symptom:* the CLI errored at `run` time.
2. **Missing completion signal (VP works but is never marked done).** The CEO only marks a VP
   done when its pane output contains the exact string `{Role}: DONE`. Read the pane:
   `tmux capture-pane -t <session> -p` (or `agentswarm status <session>` for the summary). If
   the agent finished its work but never printed `Role: DONE`, the prompt is missing the
   signal instruction — every VP prompt must end with `Say "{Role}: DONE" on your last line`.
   Note the match is a substring check and case-sensitive: `role: done` does NOT match.
3. **Dependency deadlock (downstream VP never deploys).** A `pending` VP only deploys once
   *every* role in its `depends_on` is `done`. If an upstream VP is stuck (cause #2) or a
   `depends_on` name is misspelled so it can never be satisfied, the downstream VP waits
   forever. Inspect the chain in `agentswarm status` / the status JSON: find the first
   non-done VP in the chain and fix *that* one.
4. **Genuinely idle (agent stalled / waiting on input).** If a pane has produced no output for
   longer than `idle_timeout`, the CEO flags it `IDLE`. Attach (`tmux attach -t <session>`)
   and look: it may be blocked on a permission prompt, waiting on a network call, or done but
   silent. Deploy VPs with `--dangerously-skip-permissions` (the CEO does this) so they never
   block on approvals.

## Quick triage commands

```bash
agentswarm status <session>                 # per-VP RUNNING/IDLE/DONE summary
cat /tmp/agentswarm-<session>-status.json   # machine-readable state (public API)
tmux capture-pane -t <session> -p | tail -30 # raw tail of the focused pane
agentswarm log --limit 20                    # was the last run ok or error?
```

## Output

A one-line diagnosis naming the cause and the fix, e.g.:

```
Cause #2 (missing signal): VP Writer finished but never printed "VP Writer: DONE".
Fix: append the signal instruction to its prompt and re-run. Downstream VP Editor was
blocked on it (cause #3 cascade).
```

## Anti-patterns

- Inferring completion from "the file exists" or "the pane went quiet" — only `{Role}: DONE`
  counts.
- Restarting the whole swarm when only one VP in the chain is broken.
- Lowering `idle_timeout` to "fix" an idle pane — that hides the stall instead of resolving it.
