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
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Every file under `dir`, recursively. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/**
 * The files that run agentswarm's real loader inside the VM: the compiled loader, the `yaml` package it imports
 * (shipped from this install, so the VM needs no network), and a runner that prints VALID or INVALID.
 */
function validatorFiles(): { path: string; data: string }[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const yamlRoot = dirname(createRequire(import.meta.url).resolve("yaml/package.json"));
  const yamlFiles = [join(yamlRoot, "package.json"), ...listFiles(join(yamlRoot, "dist"))].map((f) => ({
    path: `/tmp/agentswarm/node_modules/yaml/${relative(yamlRoot, f)}`,
    data: readFileSync(f, "utf8"),
  }));
  const runner = [
    `import { loadSwarmConfig } from "./loader.mjs";`,
    `try {`,
    `  const c = loadSwarmConfig("/tmp/swarm.yaml");`,
    `  console.log("VALID: " + c.vps.length + " VP role(s), session " + c.swarm.session);`,
    `} catch (e) {`,
    `  console.error("INVALID: " + e.message);`,
    `  process.exit(1);`,
    `}`,
  ].join("\n");
  return [
    ...yamlFiles,
    { path: "/tmp/agentswarm/loader.mjs", data: readFileSync(join(here, "loader.js"), "utf8") },
    { path: "/tmp/agentswarm/check.mjs", data: runner },
  ];
}

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
 * The VM runs the same loader as `agentswarm validate` (required sections and
 * fields, unique roles, every depends_on names a defined role), so a config the
 * host would reject is rejected inside the sandbox too.
 */
export async function sandboxRun(configPath: string): Promise<SandboxRunResult> {
  if (!process.env.E2B_API_KEY) {
    throw new Error(
      "E2B_API_KEY is not set. Add it to .env (E2B sandbox cannot boot without it).",
    );
  }

  // Read the untrusted config on the host ONLY as bytes — never execute it here.
  const yamlText = readFileSync(configPath, "utf8");

  const sandbox = await Sandbox.create("base");
  const sandboxId = sandbox.sandboxId;
  try {
    // Ship the untrusted config + the real loader into the isolated VM.
    await sandbox.files.write([{ path: "/tmp/swarm.yaml", data: yamlText }, ...validatorFiles()]);

    // Execute the validation INSIDE the sandbox — host never runs the YAML. A failing
    // validation exits 1, which the SDK raises as an error carrying the result.
    const res = await sandbox.commands
      .run("node /tmp/agentswarm/check.mjs", { timeoutMs: 30_000 })
      .catch((e: unknown) => {
        const r = e as { exitCode?: number; stdout?: string; stderr?: string };
        if (typeof r.exitCode === "number") return r;
        throw e;
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
