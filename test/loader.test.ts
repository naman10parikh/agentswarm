import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSwarmConfig } from "../src/loader.js";

// Write each YAML fixture to a real temp file because loadSwarmConfig reads
// from a path (matching how the CLI invokes it).
let dir: string;
const write = (name: string, body: string): string => {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "agentswarm-test-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const VALID = `
swarm:
  name: my-swarm
  session: swarm-my
  poll_interval: 60
  max_runtime: 90
  idle_timeout: 200
ceo:
  prompt: |
    You are the CEO.
  model: opus
  context:
    - CLAUDE.md
vps:
  - role: VP Alpha
    pane: 1
    prompt: |
      Do alpha work. Say "VP Alpha: DONE" when finished.
    model: sonnet
  - role: VP Beta
    pane: 2
    prompt: |
      Do beta work. Say "VP Beta: DONE" when finished.
    model: haiku
    depends_on:
      - VP Alpha
`;

describe("loadSwarmConfig — valid configs", () => {
  it("parses a well-formed swarm config", () => {
    const cfg = loadSwarmConfig(write("valid.yaml", VALID));
    expect(cfg.swarm.name).toBe("my-swarm");
    expect(cfg.swarm.session).toBe("swarm-my");
    expect(cfg.swarm.poll_interval).toBe(60);
    expect(cfg.ceo.model).toBe("opus");
    expect(cfg.vps).toHaveLength(2);
    expect(cfg.vps[0].role).toBe("VP Alpha");
    expect(cfg.vps[1].depends_on).toEqual(["VP Alpha"]);
  });

  it("applies sensible defaults for optional swarm fields", () => {
    const minimal = `
swarm:
  name: m
  session: swarm-m
ceo:
  prompt: hi
vps:
  - role: Only
    prompt: do it
`;
    const cfg = loadSwarmConfig(write("minimal.yaml", minimal));
    expect(cfg.swarm.poll_interval).toBe(120);
    expect(cfg.swarm.max_runtime).toBe(180);
    expect(cfg.swarm.idle_timeout).toBe(300);
    expect(cfg.ceo.model).toBe("opus");
    expect(cfg.vps[0].model).toBe("sonnet");
    expect(cfg.vps[0].pane).toBe(1);
    expect(cfg.vps[0].workdir).toBe(".");
    expect(cfg.vps[0].depends_on).toEqual([]);
  });
});

describe("loadSwarmConfig — validation errors", () => {
  it("rejects a config missing the swarm section", () => {
    const bad = `ceo:\n  prompt: hi\nvps:\n  - role: A\n    prompt: x\n`;
    expect(() => loadSwarmConfig(write("no-swarm.yaml", bad))).toThrow(
      /swarm/,
    );
  });

  it("rejects a config missing the ceo section", () => {
    const bad = `swarm:\n  name: n\n  session: s\nvps:\n  - role: A\n    prompt: x\n`;
    expect(() => loadSwarmConfig(write("no-ceo.yaml", bad))).toThrow(/ceo/);
  });

  it("rejects duplicate VP role names", () => {
    const bad = `
swarm:
  name: n
  session: s
ceo:
  prompt: hi
vps:
  - role: Dup
    prompt: a
  - role: Dup
    prompt: b
`;
    expect(() => loadSwarmConfig(write("dup.yaml", bad))).toThrow(
      /Duplicate role: Dup/,
    );
  });

  it("rejects a depends_on that references an unknown role", () => {
    const bad = `
swarm:
  name: n
  session: s
ceo:
  prompt: hi
vps:
  - role: A
    prompt: a
    depends_on:
      - Ghost
`;
    expect(() => loadSwarmConfig(write("badep.yaml", bad))).toThrow(
      /depends_on "Ghost"/,
    );
  });
});
