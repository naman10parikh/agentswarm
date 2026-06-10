/**
 * Behavioral tests for the two newest product modules:
 *
 *   - memory-search.ts — the BM25 index over the repo's own knowledge corpus.
 *     Validates real ranking BEHAVIOUR (rare terms dominate, source-authority
 *     weighting, limit, snippet/line extraction) against a synthetic corpus,
 *     not just "it returns something".
 *
 *   - run-log.ts — the append-only JSONL observability trail. Validates the
 *     append→read round-trip, ordering, the limit cap, and the best-effort
 *     guarantee (a bad log path must NEVER throw into the CLI).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tokenize, searchMemory } from "../src/memory-search.js";
import { recordRun, readRuns, type RunLogEntry } from "../src/run-log.js";

// ─── Fixtures: a synthetic repo corpus ──────────────────────────────────────

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "agentswarm-mem-test-"));
  mkdirSync(join(root, "memory", "topics"), { recursive: true });
  mkdirSync(join(root, "brain"), { recursive: true });

  // Top-level doc — generic filler, mentions "swarm" a lot (common term).
  writeFileSync(
    join(root, "README.md"),
    "# demo\nThe swarm deploys a swarm of swarm panes for the swarm session.\n",
  );
  // High-authority memory doc — contains the rare term "deadlock".
  writeFileSync(
    join(root, "memory", "LEARNINGS.md"),
    "## Learnings\nA dependency deadlock happens when depends_on points at an undefined role.\n",
  );
  // Lower-authority brain doc — contains the SAME rare term once.
  writeFileSync(
    join(root, "brain", "notes.md"),
    "Misc note: deadlock was observed once during testing.\n",
  );
  // Unrelated doc — should never match the deadlock query.
  writeFileSync(
    join(root, "memory", "topics", "colors.md"),
    "Purple theme tokens and font pairings live here.\n",
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── tokenize ────────────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("lowercases, strips punctuation, and drops 1-char tokens", () => {
    expect(tokenize("Depends_On: a ROLE-name!")).toEqual([
      "depends",
      "on",
      "role",
      "name",
    ]);
  });

  it("returns [] for punctuation-only input", () => {
    expect(tokenize("--- ### !!!")).toEqual([]);
  });
});

// ─── searchMemory (BM25 + source weight) ────────────────────────────────────

describe("searchMemory — BM25 ranking over a synthetic corpus", () => {
  it("ranks the high-authority memory doc above the brain doc for a rare term", () => {
    const hits = searchMemory("dependency deadlock", 5, root);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    // memory/LEARNINGS.md (source weight 4) must beat brain/notes.md (weight 2).
    expect(hits[0].path).toBe("memory/LEARNINGS.md");
    const paths = hits.map((h) => h.path);
    expect(paths).toContain("brain/notes.md");
  });

  it("does not surface unrelated documents", () => {
    const hits = searchMemory("deadlock", 10, root);
    expect(hits.map((h) => h.path)).not.toContain("memory/topics/colors.md");
  });

  it("respects the limit parameter", () => {
    const hits = searchMemory("swarm deadlock note", 1, root);
    expect(hits.length).toBe(1);
  });

  it("returns the best-matching snippet with a 1-indexed line number", () => {
    const hits = searchMemory("undefined role", 1, root);
    expect(hits[0].snippet).toContain("undefined role");
    expect(hits[0].line).toBe(2); // line 2 of memory/LEARNINGS.md
  });

  it("returns [] for an empty / punctuation-only query", () => {
    expect(searchMemory("", 5, root)).toEqual([]);
    expect(searchMemory("###", 5, root)).toEqual([]);
  });
});

// ─── run-log (observability trail) ──────────────────────────────────────────

describe("run-log — append-only JSONL audit trail", () => {
  const entry = (n: number): RunLogEntry => ({
    ts: `2026-06-09T00:0${n}:00.000Z`,
    command: `cmd-${n}`,
    args: [`a${n}`],
    durationMs: n * 10,
    outcome: n === 3 ? "error" : "ok",
    ...(n === 3 ? { error: "boom" } : {}),
  });

  it("round-trips entries through append → read, preserving order", () => {
    const logPath = join(root, "logs", "runs.jsonl");
    recordRun(entry(1), logPath);
    recordRun(entry(2), logPath);
    recordRun(entry(3), logPath);

    const runs = readRuns(20, logPath);
    expect(runs.length).toBe(3);
    expect(runs.map((r) => r.command)).toEqual(["cmd-1", "cmd-2", "cmd-3"]);
    expect(runs[2].outcome).toBe("error");
    expect(runs[2].error).toBe("boom");
  });

  it("caps reads at the limit, returning the MOST RECENT entries", () => {
    const logPath = join(root, "logs", "runs.jsonl");
    const runs = readRuns(2, logPath);
    expect(runs.length).toBe(2);
    expect(runs.map((r) => r.command)).toEqual(["cmd-2", "cmd-3"]);
  });

  it("returns [] when the log file does not exist", () => {
    expect(readRuns(5, join(root, "nope", "missing.jsonl"))).toEqual([]);
  });

  it("never throws on an unwritable log path (best-effort guarantee)", () => {
    // /dev/null is a file, so mkdir of a child path must fail — recordRun
    // must swallow that failure rather than crash the CLI.
    expect(() =>
      recordRun(entry(4), "/dev/null/sub/runs.jsonl"),
    ).not.toThrow();
  });
});
