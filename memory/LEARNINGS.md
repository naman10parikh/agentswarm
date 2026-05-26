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
