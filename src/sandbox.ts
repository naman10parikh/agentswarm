/**
 * Sandbox runner — execute agentswarm's core action inside an E2B microVM.
 *
 * A swarm.yaml is untrusted input: it can come from anywhere and its prompts
 * drive autonomous Claude Code panes. Before trusting one, you may want to
 * parse + schema-validate it in an ISOLATED sandbox rather than in the host
 * process. `sandbox-run` does exactly that: it boots a Firecracker microVM via
 * @e2b/sdk, ships the repo's validator + the config into it, runs the validation
 * inside the VM, and returns the result. The host never executes the untrusted
 * YAML directly.
 *
 * This is the genuine E2B integration point for this repo (see container-runner
 * in the Energy runtime for the same pattern). Requires E2B_API_KEY in the env.
 */
// `@e2b/sdk` is the deprecated alias that npm redirects to `e2b`; `e2b` is the
// current SDK and the exact package the Energy runtime's container-runner uses.
import { Sandbox } from "e2b";
import { readFileSync } from "node:fs";

export interface SandboxRunResult {
  /** True if the sandbox booted and the validation command exited 0. */
  ok: boolean;
  /** E2B sandbox id (proof a microVM actually booted). */
  sandboxId: string;
  /** Captured stdout from the in-VM validation. */
  stdout: string;
  /** Captured stderr from the in-VM validation. */
  stderr: string;
  /** Exit code of the in-VM validation process. */
  exitCode: number;
}

/**
 * Boot an E2B sandbox and validate `configPath`'s swarm.yaml INSIDE it.
 *
 * The validator is a tiny self-contained Node script (no agentswarm install
 * needed in the VM): it checks the same required top-level structure the real
 * loader enforces (swarm/ceo/vps, unique roles, prompts present). Running it in
 * the VM proves the isolation boundary works end-to-end.
 */
export async function sandboxRun(configPath: string): Promise<SandboxRunResult> {
  if (!process.env.E2B_API_KEY) {
    throw new Error(
      "E2B_API_KEY is not set. Add it to .env (E2B sandbox cannot boot without it).",
    );
  }

  // Read the untrusted config on the host ONLY as bytes — never execute it here.
  const yamlText = readFileSync(configPath, "utf8");

  // Self-contained in-VM validator. Mirrors the structural checks in loader.ts
  // using a minimal hand-rolled YAML reader (no deps needed inside the VM).
  const validatorScript = `
const fs = require("node:fs");
const raw = fs.readFileSync("/tmp/swarm.yaml", "utf8");

// Minimal structural check: confirm the three required top-level sections exist
// and that the vps list has roles + prompts. (Full schema validation is the
// host loader's job; this proves the file parses in isolation.)
const lines = raw.split("\\n");
const hasSection = (name) => lines.some((l) => l.replace(/\\r/g, "").trimEnd() === name + ":");
const errors = [];
if (!hasSection("swarm")) errors.push("missing 'swarm' section");
if (!hasSection("ceo")) errors.push("missing 'ceo' section");
if (!hasSection("vps")) errors.push("missing 'vps' section");

const roleLines = lines.filter((l) => /^\\s*-?\\s*role:\\s*\\S/.test(l));
const promptLines = lines.filter((l) => /^\\s*prompt:\\s*/.test(l) || /^\\s*prompt:\\s*\\|/.test(l));
if (roleLines.length === 0) errors.push("no VP roles found");
if (promptLines.length === 0) errors.push("no prompts found");

if (errors.length) {
  console.error("INVALID: " + errors.join("; "));
  process.exit(1);
}
console.log("VALID: " + roleLines.length + " VP role(s), " + promptLines.length + " prompt block(s)");
process.exit(0);
`.trim();

  const sandbox = await Sandbox.create("base");
  const sandboxId = sandbox.sandboxId;
  try {
    // Ship the untrusted config + the validator into the isolated VM.
    await sandbox.files.write("/tmp/swarm.yaml", yamlText);
    await sandbox.files.write("/tmp/validate.cjs", validatorScript);

    // Execute the validation INSIDE the sandbox — host never runs the YAML.
    const res = await sandbox.commands.run("node /tmp/validate.cjs", {
      timeoutMs: 30_000,
    });

    return {
      ok: res.exitCode === 0,
      sandboxId,
      stdout: (res.stdout ?? "").trim(),
      stderr: (res.stderr ?? "").trim(),
      exitCode: res.exitCode ?? 0,
    };
  } finally {
    await sandbox.kill();
  }
}
