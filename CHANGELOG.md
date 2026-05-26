# Changelog

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
