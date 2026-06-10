/**
 * Observability spine — append-only JSONL run-log for every agentswarm invocation.
 *
 * The harness audit's "Observability" component requires a runtime audit trail the
 * product WRITES on each invocation: command + duration + outcome. This is that
 * trail. It is best-effort — a logging failure must NEVER break the CLI, so every
 * write is wrapped and swallowed. Ported from the Energy/helios run-log pattern.
 *
 * Trail location: `logs/runs.jsonl` at the repo root (gitignored runtime state).
 */
import {
  appendFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Default audit-trail location: `<repo>/logs/runs.jsonl` (dist/ sits one level under repo root). */
export const RUN_LOG_PATH = join(HERE, "..", "logs", "runs.jsonl");

export interface RunLogEntry {
  /** ISO-8601 timestamp of when the run finished. */
  ts: string;
  /** CLI subcommand (e.g. "run", "validate", "status"). */
  command: string;
  /** Remaining argv tokens passed after the subcommand. */
  args: string[];
  /** Wall-clock duration of the invocation, milliseconds. */
  durationMs: number;
  /** Whether the invocation completed cleanly or threw. */
  outcome: "ok" | "error";
  /** Error message when outcome === "error". */
  error?: string;
  /** Optional one-line summary a command can attach (e.g. "4 VPs deployed"). */
  note?: string;
}

/** Append one run entry to the JSONL audit trail. Best-effort — never throws. */
export function recordRun(
  entry: RunLogEntry,
  logPath: string = RUN_LOG_PATH,
): void {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch {
    // Observability is best-effort; a log-write failure must not break the CLI.
  }
}

/** Read the most-recent run entries (oldest→newest), capped at `limit`. */
export function readRuns(
  limit = 20,
  logPath: string = RUN_LOG_PATH,
): RunLogEntry[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RunLogEntry)
    .slice(-limit);
}
