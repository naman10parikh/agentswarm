# Changelog

## Unreleased

### Fixed

- A VP prompt now reaches `claude` as one single-quoted argument, so `$(...)` and backticks in a swarm.yaml never run
  in the pane's shell (both CLIs).
- A VP is done only when a line of its pane is exactly `{Role}: DONE`; the echoed prompt no longer counts as done.
- The swarm session numbers its window and panes from 0 even when tmux is configured to start at 1.
- MCP tool results use the `content` shape that MCP clients read.
- Every CLI run is logged, including runs that end in an error.
- `agentswarm-sh` finds its helper scripts when npm installs it as a symlink.
- `sandbox-run` runs the real loader inside the VM, so it rejects what `validate` rejects.
- A VP's `model` now reaches its agent as `claude --model <value>`, in both CLIs. A VP with no `model` gets no flag,
  so Claude Code uses its default. The plan then shows "default model", not a model that was never passed.
- `agentswarm-sh run` now waits on `depends_on`: a VP starts once every role it names is done, and shows as PENDING
  until then. Its status now reads the pane each VP runs in, so it sees each finish line.
- `agentswarm-sh validate` rejects a `depends_on` that names no role, as `agentswarm validate` does.

### Added

- `agentswarm-mcp` bin, a `prepare` script (the CLI runs straight from GitHub), a Claude Code plugin with a
  `swarm-guard` hook and two sub-agents, a Gemini CLI extension and an A2A agent card.
- Evals (`pnpm eval`: surfaces and golden swarms with pass^3) in CI, and a nightly improvement loop that writes
  proposals.

## 0.2.0

### Added

- Standalone public repo, extracted from the Energy monorepo (zero `@energy/*` deps).
- Vitest unit tests for the config loader (valid configs, defaults, and the five
  validation error paths).

### Fixed

- TypeScript CLI: replaced a `require("node:fs")` call (invalid in an ESM module) with a
  proper `readFileSync` import so `agentswarm status` works in the built binary.
- Bash CLI: `validate` now prints the specific errors for an invalid config instead of
  silently exiting under `set -e`.

## 0.1.0

### Added

- `swarm.yaml` config format: swarm settings, CEO definition, VP role list
- CLI: `run`, `run --dry`, `validate`, `status`, `stop`, `list`, `init`
- CEO orchestration engine: creates tmux session, deploys prompts to panes
- Status monitoring: done detection (completion signal), idle detection (output timeout)
- JSON status file at `/tmp/agentswarm-{session}-status.json`
- Dependency resolution: `depends_on` field for VP sequencing
- 2 example configs: content-swarm.yaml, oss-pipeline.yaml
- YAML validation with schema checks (unique roles, required fields)
- Max runtime auto-shutdown
