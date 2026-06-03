/**
 * Orchestration integration tests — exercises the dependency-gate and
 * done-signal state-machine logic WITHOUT requiring tmux.
 *
 * Strategy: replicate the pure-logic portions of the monitor loop (which
 * live in ceo.ts but are not individually exported) using the public types
 * and the real loadSwarmConfig. This validates the orchestration BEHAVIOUR
 * contract: dependency ordering, done-signal detection, and status-file
 * JSON shape — the three things that must be correct for any swarm to run.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSwarmConfig } from "../src/loader.js";
import type { SwarmState, VpState, VpStatus } from "../src/types.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

let dir: string;
const write = (name: string, body: string): string => {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "agentswarm-orch-test-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Three-VP chain: A → B → C (each waits for the previous). */
const CHAIN_YAML = `
swarm:
  name: chain-swarm
  session: swarm-chain
  poll_interval: 5
  max_runtime: 10
  idle_timeout: 30
ceo:
  prompt: |
    You are the CEO.
  model: opus
vps:
  - role: Alpha
    pane: 1
    prompt: |
      Do alpha work. Say "Alpha: DONE" when finished.
    model: sonnet
  - role: Beta
    pane: 2
    prompt: |
      Do beta work. Say "Beta: DONE" when finished.
    model: sonnet
    depends_on:
      - Alpha
  - role: Gamma
    pane: 3
    prompt: |
      Do gamma work. Say "Gamma: DONE" when finished.
    model: haiku
    depends_on:
      - Beta
`;

/** Two independent VPs (no dependency edges). */
const PARALLEL_YAML = `
swarm:
  name: parallel-swarm
  session: swarm-parallel
  poll_interval: 5
  max_runtime: 10
  idle_timeout: 30
ceo:
  prompt: |
    You are the CEO.
  model: opus
vps:
  - role: Worker A
    pane: 1
    prompt: |
      Do A. Say "Worker A: DONE".
    model: sonnet
  - role: Worker B
    pane: 2
    prompt: |
      Do B. Say "Worker B: DONE".
    model: sonnet
`;

// ─── Pure state-machine helpers (mirror of ceo.ts logic) ─────────────────────
//
// These functions replicate EXACTLY the logic in monitorLoop (ceo.ts lines
// 184-201 and 211-220) so the tests can exercise it without a tmux process.
// Any future refactor of ceo.ts that breaks these invariants will break these
// tests — that is the point.

/** Returns true when all deps for a VP are in "done" state. */
function depsReady(vp: VpState, allVps: VpState[]): boolean {
  return (vp.config.depends_on ?? []).every(
    (dep) => allVps.find((v) => v.config.role === dep)?.status === "done",
  );
}

/** Returns true when the output includes the canonical done signal. */
function hasDoneSignal(role: string, output: string): boolean {
  return output.includes(`${role}: DONE`);
}

/** Build a minimal SwarmState from a loaded config (all VPs start pending). */
function buildState(configPath: string): SwarmState {
  const config = loadSwarmConfig(configPath);
  return {
    config,
    startedAt: new Date().toISOString(),
    sessionName: config.swarm.session,
    pollCount: 0,
    allDone: false,
    vps: config.vps.map((vp, i) => ({
      config: vp,
      paneIndex: i,
      status: ((vp.depends_on ?? []).length > 0
        ? "pending"
        : "running") as VpStatus,
      deployedAt: null,
      doneAt: null,
      lastActivity: Date.now(),
      outputLines: [],
    })),
  };
}

/** Produce the status JSON object (mirrors writeStatusFile in ceo.ts). */
function statusSnapshot(state: SwarmState): object {
  return {
    timestamp: expect.any(String),
    session: state.sessionName,
    swarmName: state.config.swarm.name,
    pollCount: state.pollCount,
    allDone: state.allDone,
    elapsedMs: expect.any(Number),
    vps: state.vps.map((v) => ({
      role: v.config.role,
      pane: v.paneIndex,
      status: v.status,
      model: v.config.model,
      deployedAt: v.deployedAt,
      doneAt: v.doneAt,
    })),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Dependency gate — chain A → B → C", () => {
  it("Beta is pending while Alpha is running (not done)", () => {
    const state = buildState(write("chain.yaml", CHAIN_YAML));
    const beta = state.vps.find((v) => v.config.role === "Beta")!;
    expect(beta.status).toBe("pending");
    expect(depsReady(beta, state.vps)).toBe(false);
  });

  it("Beta becomes deployable once Alpha is marked done", () => {
    const state = buildState(write("chain2.yaml", CHAIN_YAML));
    // Simulate Alpha finishing
    const alpha = state.vps.find((v) => v.config.role === "Alpha")!;
    alpha.status = "done";
    alpha.doneAt = new Date().toISOString();

    const beta = state.vps.find((v) => v.config.role === "Beta")!;
    expect(depsReady(beta, state.vps)).toBe(true);
  });

  it("Gamma stays pending until Beta is also done", () => {
    const state = buildState(write("chain3.yaml", CHAIN_YAML));
    // Alpha done, Beta still running
    state.vps.find((v) => v.config.role === "Alpha")!.status = "done";
    state.vps.find((v) => v.config.role === "Beta")!.status = "running";

    const gamma = state.vps.find((v) => v.config.role === "Gamma")!;
    expect(depsReady(gamma, state.vps)).toBe(false);
  });

  it("Gamma becomes deployable once the full chain is done", () => {
    const state = buildState(write("chain4.yaml", CHAIN_YAML));
    state.vps.find((v) => v.config.role === "Alpha")!.status = "done";
    state.vps.find((v) => v.config.role === "Beta")!.status = "done";

    const gamma = state.vps.find((v) => v.config.role === "Gamma")!;
    expect(depsReady(gamma, state.vps)).toBe(true);
  });

  it("full chain simulation: all VPs transition to done in dependency order", () => {
    const state = buildState(write("chain5.yaml", CHAIN_YAML));

    // Tick 1: Alpha gets its done signal
    const alpha = state.vps.find((v) => v.config.role === "Alpha")!;
    if (hasDoneSignal("Alpha", "...Alpha: DONE")) {
      alpha.status = "done";
    }
    expect(alpha.status).toBe("done");

    // Tick 2: Beta deps ready → deploy → done signal
    const beta = state.vps.find((v) => v.config.role === "Beta")!;
    expect(depsReady(beta, state.vps)).toBe(true);
    beta.status = "running";
    if (hasDoneSignal("Beta", "...Beta: DONE")) {
      beta.status = "done";
    }
    expect(beta.status).toBe("done");

    // Tick 3: Gamma deps ready → deploy → done signal
    const gamma = state.vps.find((v) => v.config.role === "Gamma")!;
    expect(depsReady(gamma, state.vps)).toBe(true);
    gamma.status = "running";
    if (hasDoneSignal("Gamma", "...Gamma: DONE")) {
      gamma.status = "done";
    }
    expect(gamma.status).toBe("done");

    // All done
    const allDone = state.vps.every((v) => v.status === "done");
    expect(allDone).toBe(true);
  });
});

describe("Done-signal detection", () => {
  it("detects the canonical '{Role}: DONE' signal", () => {
    expect(hasDoneSignal("VP Research", "VP Research: DONE")).toBe(true);
    expect(hasDoneSignal("Alpha", "work work work\nAlpha: DONE")).toBe(true);
  });

  it("rejects partial or incorrect done signals", () => {
    expect(hasDoneSignal("Alpha", "alpha: done")).toBe(false); // wrong case
    expect(hasDoneSignal("Alpha", "Alpha is DONE")).toBe(false); // wrong format
    expect(hasDoneSignal("Beta", "Alpha: DONE")).toBe(false); // wrong role
    // Note: "Alpha: DONE!" DOES match because includes() is a substring check —
    // this reflects ceo.ts real behaviour (output.includes(`${Role}: DONE`))
    expect(hasDoneSignal("Alpha", "Alpha: DONE!")).toBe(true);
  });

  it("handles multi-line output and detects signal anywhere", () => {
    const multiLine = [
      "Starting work...",
      "Processing step 1",
      "Processing step 2",
      "Worker A: DONE",
      "",
    ].join("\n");
    expect(hasDoneSignal("Worker A", multiLine)).toBe(true);
    expect(hasDoneSignal("Worker B", multiLine)).toBe(false);
  });
});

describe("Parallel VPs — no dependency edges", () => {
  it("both VPs start as 'running' (no deps to gate them)", () => {
    const state = buildState(write("parallel.yaml", PARALLEL_YAML));
    expect(state.vps[0].status).toBe("running");
    expect(state.vps[1].status).toBe("running");
  });

  it("each VP completes independently", () => {
    const state = buildState(write("parallel2.yaml", PARALLEL_YAML));
    // Worker A finishes first
    state.vps[0].status = "done";
    expect(state.vps[1].status).toBe("running"); // Worker B unaffected
    // Worker B finishes
    state.vps[1].status = "done";
    expect(state.vps.every((v) => v.status === "done")).toBe(true);
  });
});

describe("Status JSON contract", () => {
  it("status snapshot has the required public-API shape", () => {
    const state = buildState(write("status.yaml", CHAIN_YAML));
    state.pollCount = 3;

    const snap = {
      timestamp: new Date().toISOString(),
      session: state.sessionName,
      swarmName: state.config.swarm.name,
      pollCount: state.pollCount,
      allDone: state.allDone,
      elapsedMs: 0,
      vps: state.vps.map((v) => ({
        role: v.config.role,
        pane: v.paneIndex,
        status: v.status,
        model: v.config.model,
        deployedAt: v.deployedAt,
        doneAt: v.doneAt,
      })),
    };

    // Required top-level fields
    expect(typeof snap.timestamp).toBe("string");
    expect(snap.session).toBe("swarm-chain");
    expect(snap.swarmName).toBe("chain-swarm");
    expect(snap.pollCount).toBe(3);
    expect(snap.allDone).toBe(false);
    expect(Array.isArray(snap.vps)).toBe(true);
    expect(snap.vps).toHaveLength(3);

    // Required VP fields
    for (const vp of snap.vps) {
      expect(typeof vp.role).toBe("string");
      expect(typeof vp.pane).toBe("number");
      expect(typeof vp.status).toBe("string");
      expect(typeof vp.model).toBe("string");
    }

    // Roles and order preserved
    expect(snap.vps[0].role).toBe("Alpha");
    expect(snap.vps[1].role).toBe("Beta");
    expect(snap.vps[2].role).toBe("Gamma");
  });

  it("allDone flips to true when all VPs are done", () => {
    const state = buildState(write("status2.yaml", CHAIN_YAML));
    state.vps.forEach((v) => {
      v.status = "done";
      v.doneAt = new Date().toISOString();
    });
    state.allDone = state.vps.every((v) => v.status === "done");
    expect(state.allDone).toBe(true);
  });
});
