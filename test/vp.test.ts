import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { isDoneSignal, shellQuote, vpLaunchCommand } from "../src/vp.js";

describe("vpLaunchCommand", () => {
  it("passes the prompt as one argument, joined into one line", () => {
    expect(vpLaunchCommand("Do research.\nSay it.")).toBe("claude --dangerously-skip-permissions 'Do research. Say it.'");
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
