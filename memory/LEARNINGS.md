# agentswarm — LEARNINGS (append-only)

Every error → root cause → rule. Auto-compressed when >500 lines (memory-compress.sh).

## 2026-05-26 — TS `require()` is invalid in an ESM module

- **What broke:** `agentswarm status` threw in the built binary because `src/ceo.ts` used
  `require("node:fs")` while the package is `"type": "module"`.
- **Root cause:** ESM modules have no `require`; the dev path (tsx) tolerated it, the built `.js`
  did not.
- **Rule:** In ESM packages, always `import { readFileSync } from "node:fs"` — never `require`.
  Test the **built** binary (`node dist/ceo.js ...`), not just `tsx src/ceo.ts`. (Fixed in 0.2.0.)

## 2026-05-26 — Bash `validate` swallowed errors under `set -e`

- **What broke:** The Bash CLI's `validate` exited silently on an invalid config instead of
  printing the specific schema errors.
- **Root cause:** `set -e` aborted the script before the error-reporting branch ran.
- **Rule:** Under `set -e`, capture a failing command's status explicitly (`if ! cmd; then ...`)
  before exiting, so the user always sees the precise reason. (Fixed in 0.2.0.)

## 2026-05-26 — AGENTS.md was a mis-copied cross-repo template (CP104)

- **What broke:** `AGENTS.md` shipped as the WikiMem wiki-schema template (sha `627eebad…`)
  instead of agentswarm's own conventions — wrong directory map, wrong operations.
- **Root cause:** Harness extraction copied the file verbatim from a different repo flavor.
- **Rule:** After extracting a repo, verify `shasum AGENTS.md` ≠ the known mis-copy sha and that
  the directory map matches *this* repo's folders. (Rewritten in CP104.)

## 2026-10-19 — A VP was marked done by its own prompt

- **What broke:** the CEO checked `output.includes("{Role}: DONE")`, but the pane shows the launch command, and the
  prompt says `Say "{Role}: DONE" when finished`, so a VP could count as done before it did any work.
- **Root cause:** a substring match cannot tell the instruction from the answer.
- **Rule:** only a whole line that is the signal counts (`isDoneSignal` in `src/vp.ts`; the same rule in
  `src/status.sh`). The golden eval keeps a VP that never finishes and checks it is never marked done.

## 2026-10-19 — A swarm.yaml prompt could run shell code

- **What broke:** prompts went into the pane inside double quotes, so `$(...)` or backticks in a swarm.yaml would
  have run in the pane's shell on deploy.
- **Root cause:** double quotes still expand `$` and backticks.
- **Rule:** a prompt travels as one single-quoted argument (`vpLaunchCommand` in `src/vp.ts`, `quoted_prompt` in
  `src/orchestrate.sh`). The golden eval deploys a prompt holding `$(touch ...)` and checks no file appears.

## 2026-10-19 — MCP tool results need the `content` shape

- **What broke:** `tools/call` returned bare objects (`{"valid": true}`), which MCP clients do not read.
- **Root cause:** the server answered tool calls like plain JSON-RPC methods.
- **Rule:** every tool result is `{content: [{type: "text", text}], structuredContent}` (`toolResult` in
  `src/mcp-server.ts`), and the golden eval reads it the way a client does.

## 2026-10-19 — Failed runs left no trace in the run log

- **What broke:** an action that ended in `process.exit(1)` (an invalid config) skipped the run-log line.
- **Root cause:** the log line was written only after the action's promise settled.
- **Rule:** record each invocation once, from a `process.on("exit")` hook as well as the promise, so failures are
  logged too.

## 2026-10-19 — The swarm assumed tmux numbers from 0

- **What broke:** with `base-index 1` (agentgrid's installer sets it), `session:0` does not exist and every pane
  command misses.
- **Root cause:** window and pane numbers follow the user's tmux.conf.
- **Rule:** after creating the swarm session, set its `base-index` and `pane-base-index` to 0 and renumber. The
  golden eval runs on a tmux server configured from 1.

## 2026-10-19 — The bash CLI broke when npm linked it

- **What broke:** `agentswarm-sh validate` from an npm install failed with `parse-yaml.sh: No such file or directory`.
- **Root cause:** npm installs a bin as a symlink, and `dirname "${BASH_SOURCE[0]}"` is the link's folder, not the
  script's.
- **Rule:** a bash bin follows its symlinks before it looks for files beside it (`src/cli.sh`). The golden eval runs
  the bash CLI through a symlink.

## 2026-10-19 — The sandbox passed a config the host rejects

- **What broke:** `agentswarm sandbox-run` printed "Config valid" for a swarm with a duplicate role and a
  dependency on a role that does not exist.
- **Root cause:** the VM ran a hand-written line counter, not the loader, so the two validators disagreed.
- **Rule:** the sandbox runs the real loader (`dist/loader.js` and the `yaml` package, shipped from the install, in
  `src/sandbox.ts`). Check a sandbox path with a config that must fail, not only with one that passes.
