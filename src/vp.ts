/**
 * vp.ts: how a VP is launched in its pane, and how its completion is recognised.
 *
 * Kept apart from ceo.ts so both rules are unit-tested directly (test/vp.test.ts).
 */

/** Quote one argument for a POSIX shell, so the text can never expand ($, backticks) or break out. */
export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * The command typed into a VP's pane. The prompt travels as one shell-quoted argument: a prompt from a
 * swarm.yaml written by someone else can hold `$(...)` or backticks, and the pane's shell must not run them.
 * The role's `model`, when the swarm file sets one, goes through Claude Code's own `--model` flag, quoted the same
 * way. With no model, no flag is passed and Claude Code uses its default model.
 */
export function vpLaunchCommand(prompt: string, model?: string): string {
  const oneLine = prompt.replace(/\s*\n\s*/g, " ").trim();
  const modelFlag = model ? `--model ${shellQuote(model)} ` : "";
  return `claude --dangerously-skip-permissions ${modelFlag}${shellQuote(oneLine)}`;
}

/**
 * True when one line of the pane is the VP's own completion signal, `{Role}: DONE`.
 *
 * The line may start with symbols (Claude Code prints its replies after a bullet) and end with a full stop, but it
 * must hold nothing else. The prompt itself says `Say "{Role}: DONE" when finished`, and the pane shows the prompt,
 * so a plain substring match would mark a VP done before it did any work.
 */
export function isDoneSignal(output: string, role: string): boolean {
  const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const signal = new RegExp(`^[^A-Za-z0-9]*${escaped}: DONE[.!]?$`);
  return output.split("\n").some((line) => signal.test(line.trim()));
}
