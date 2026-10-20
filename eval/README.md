# eval/

The evals that gate every push and pull request in CI, and that the nightly improvement loop runs.

| File | What it checks |
| --- | --- |
| [`run.sh`](run.sh) | runs both suites below, in order; `pnpm eval` calls it |
| [`surfaces.py`](surfaces.py) | every surface a coding agent uses is present and well formed: the required docs, the JSON files, the bins and the `prepare` script, a stranger-safe `.mcp.json`, the plugin, the hook scripts, the skills, the sub-agents, `MEMORY.md` within 2,000 tokens, the `llms.txt` links and the DSIP shape (it reads files only) |
| [`golden.sh`](golden.sh) | real swarms on a private tmux server with stand-in agents, so no model is called and the person's tmux is never touched; each task must pass K rounds in a row (`AG_EVAL_K`, default 3) |
| [`fixtures/`](fixtures/) | the swarms the golden tasks run: a three-role chain, a role that never finishes, and an invalid config |

The golden tasks: both CLIs answer `--help` and `--version`; the bash CLI runs through a symlink, as npm installs it; validate accepts a good config and names both errors in a bad one; a dry run plans without tmux;
a chain finishes in dependency order; status reports every role and stop ends the session; shell syntax in a prompt
reaches the agent as text and never runs; a role that never finishes is never marked done; another agent drives the
MCP server; every CLI run lands in the run log.

Results go to `logs/eval-golden.json` (gitignored). `scripts/improve.mjs` compares its time with
[`baseline.json`](baseline.json) once that file exists.
