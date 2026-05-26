import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { SwarmConfig, VpConfig } from "./types.js";

export function loadSwarmConfig(filePath: string): SwarmConfig {
  const raw = readFileSync(filePath, "utf-8");
  const doc = parse(raw) as Record<string, unknown>;

  // Validate required top-level keys
  const errors: string[] = [];

  if (!doc.swarm || typeof doc.swarm !== "object") {
    errors.push("Missing 'swarm' section");
  }
  if (!doc.ceo || typeof doc.ceo !== "object") {
    errors.push("Missing 'ceo' section");
  }
  if (!doc.vps || !Array.isArray(doc.vps)) {
    errors.push("Missing 'vps' section (must be a list)");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid swarm.yaml:\n  ${errors.join("\n  ")}`);
  }

  const swarm = doc.swarm as Record<string, unknown>;
  const ceo = doc.ceo as Record<string, unknown>;
  const vpsRaw = doc.vps as Record<string, unknown>[];

  // Validate swarm section
  if (!swarm.name) errors.push("swarm.name is required");
  if (!swarm.session) errors.push("swarm.session is required");

  // Validate CEO
  if (!ceo.prompt) errors.push("ceo.prompt is required");

  // Validate VPs
  const roles = new Set<string>();
  const vps: VpConfig[] = vpsRaw.map((vp, i) => {
    const role = (vp.role as string) ?? "";
    if (!role) errors.push(`vps[${i}].role is required`);
    if (roles.has(role)) errors.push(`Duplicate role: ${role}`);
    roles.add(role);

    if (!vp.prompt) errors.push(`vps[${i}].prompt is required`);

    return {
      role,
      pane: (vp.pane as number) ?? i + 1,
      prompt: ((vp.prompt as string) ?? "").trim(),
      model: (vp.model as "opus" | "sonnet" | "haiku") ?? "sonnet",
      workdir: (vp.workdir as string) ?? ".",
      depends_on: (vp.depends_on as string[]) ?? [],
      outputs: (vp.outputs as string[]) ?? [],
    };
  });

  // Validate dependency references
  for (const vp of vps) {
    for (const dep of vp.depends_on ?? []) {
      if (!roles.has(dep)) {
        errors.push(
          `${vp.role} depends_on "${dep}" which is not a defined role`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid swarm.yaml:\n  ${errors.join("\n  ")}`);
  }

  return {
    swarm: {
      name: swarm.name as string,
      session: swarm.session as string,
      poll_interval: (swarm.poll_interval as number) ?? 120,
      max_runtime: (swarm.max_runtime as number) ?? 180,
      idle_timeout: (swarm.idle_timeout as number) ?? 300,
    },
    ceo: {
      prompt: ((ceo.prompt as string) ?? "").trim(),
      model: (ceo.model as "opus" | "sonnet" | "haiku") ?? "opus",
      context: (ceo.context as string[]) ?? [],
    },
    vps,
  };
}
