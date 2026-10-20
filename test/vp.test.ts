import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { isDoneSignal, shellQuote, trackIdle, vpLaunchCommand, waitingCommand } from "../src/vp.js";
import type { VpState } from "../src/types.js";

describe("vpLaunchCommand", () => {
  it("passes the prompt as one argument, joined into one line", () => {
    expect(vpLaunchCommand("Do research.\nSay it.")).toBe("claude --dangerously-skip-permissions 'Do research. Say it.'");
  });

  it("passes the swarm file's model through claude's own --model flag, and no flag when the file sets none", () => {
    expect(vpLaunchCommand("Do it.", "model-from-swarm-file")).toBe(
      "claude --dangerously-skip-permissions --model 'model-from-swarm-file' 'Do it.'",
    );
    expect(vpLaunchCommand("Do it.", "$(id)")).toContain("--model '$(id)' ");
    expect(vpLaunchCommand("Do it.")).not.toContain("--model");
  });

  it("never lets the pane's shell expand the prompt", () => {
    // The shell receives exactly the text, with $(...), backticks and quotes intact.
    const prompt = `Summarise $(whoami) and \`id\`, then say "VP: DONE" and it's done`;
    const echoed = execFileSync("sh", ["-c", `printf %s ${shellQuote(prompt)}`], { encoding: "utf8" });
    expect(echoed).toBe(prompt);
  });
});

describe("isDoneSignal", () => {
  it("accepts the signal on its own line, after a reply bullet, with a full stop", () => {
    expect(isDoneSignal("working...\nVP Research: DONE\n", "VP Research")).toBe(true);
    expect(isDoneSignal("⏺ VP Research: DONE", "VP Research")).toBe(true);
    expect(isDoneSignal("VP Research: DONE.", "VP Research")).toBe(true);
  });

  it("ignores the signal inside the prompt the pane shows", () => {
    const pane = `$ claude --dangerously-skip-permissions 'Do research. Say "VP Research: DONE" when finished.'`;
    expect(isDoneSignal(pane, "VP Research")).toBe(false);
    expect(isDoneSignal(`> Say "VP Research: DONE" when finished.`, "VP Research")).toBe(false);
  });

  it("does not confuse one role with another", () => {
    expect(isDoneSignal("VP Research Lead: DONE", "VP Research")).toBe(false);
    expect(isDoneSignal("VP Research: DONE", "Research")).toBe(false);
  });

  it("treats regex characters in a role as plain text", () => {
    expect(isDoneSignal("QA (v2): DONE", "QA (v2)")).toBe(true);
    expect(isDoneSignal("QA v2: DONE", "QA (v2)")).toBe(false);
  });
});

describe("waitingCommand", () => {
  it("shows a waiting role and its dependencies as text, never as shell syntax", () => {
    const line = execFileSync("sh", ["-c", waitingCommand("$(id)", ["`id`", "Alpha"])], { encoding: "utf8" });
    expect(line).toBe("⏳ $(id) waiting for: `id`, Alpha\n");
  });
});

describe("trackIdle", () => {
  const vp = (): VpState => ({
    config: { role: "Writer", pane: 1, prompt: "Write.", workdir: "." },
    paneIndex: 1, status: "running", deployedAt: null, doneAt: null, lastActivity: 0, outputLines: [],
  });

  it("marks a pane idle only after its last lines stay the same for longer than the timeout", () => {
    const v = vp();
    expect(trackIdle(v, ["working 1"], 60, 1_000)).toBe(false);
    expect(trackIdle(v, ["working 1"], 60, 50_000)).toBe(false);
    expect(trackIdle(v, ["working 1"], 60, 62_000)).toBe(true);
  });

  it("counts any new output as activity", () => {
    const v = vp();
    trackIdle(v, ["working 1"], 60, 1_000);
    expect(trackIdle(v, ["working 1", "working 2"], 60, 90_000)).toBe(false);
    expect(v.lastActivity).toBe(90_000);
    expect(v.outputLines).toEqual(["working 1", "working 2"]);
  });
});
