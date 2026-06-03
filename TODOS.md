# TODOS — agentswarm

Community-facing task list. Checked items are done; unchecked items welcome contributions.

## Harness completion (CP117 Wave-D)

- [x] **T-001** Add real orchestration integration tests (dependency-gate, done-signal, status-JSON contract) — `test/orchestration.test.ts` (18 tests total, 12 new)
- [x] **T-002** Update `package.json` name to scoped `@energy/agentswarm` — code prep complete

## Publish (chairman-blocked — needs npm login)

- [ ] **T-003** `npm login` with an account that can publish under the `@energy` npm org scope, then `pnpm publish --access public` from this repo. (Cannot be done by agent — requires interactive npm auth.)

## Future improvements

- [ ] **T-004** Extract pure state-machine logic from `ceo.ts` into a testable `orchestrator.ts` module so L2 behavioral tests can drive the full poll loop without mocking.
- [ ] **T-005** Add L3 eval / golden-output scoring in `eval/` for the done-signal detection accuracy across diverse pane outputs.
- [ ] **T-006** Integration test for the `validate` CLI subcommand (spawn child process, assert exit 0 + output text).
- [ ] **T-007** Test `writeStatusFile` end-to-end: write status to a temp file, read it back, assert JSON schema.
