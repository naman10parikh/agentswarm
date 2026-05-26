import { execSync, exec } from "node:child_process";

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}

function runAsync(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { encoding: "utf-8", timeout: 10_000 }, (_err, stdout) => {
      resolve((stdout ?? "").trim());
    });
  });
}

export function hasTmux(): boolean {
  return run("which tmux") !== "";
}

export function sessionExists(session: string): boolean {
  return (
    run(`tmux has-session -t "${session}" 2>/dev/null && echo yes`) === "yes"
  );
}

export function killSession(session: string): void {
  run(`tmux kill-session -t "${session}" 2>/dev/null`);
}

export function createSession(session: string, width = 220, height = 55): void {
  run(`tmux new-session -d -s "${session}" -x ${width} -y ${height}`);
}

export function splitPane(session: string, direction: "h" | "v" = "h"): number {
  const flag = direction === "h" ? "-h" : "-v";
  run(`tmux split-window -t "${session}:0" ${flag}`);
  // Return the index of the new pane
  const panes = run(`tmux list-panes -t "${session}:0" -F "#{pane_index}"`);
  const indices = panes.split("\n").map(Number);
  return Math.max(...indices);
}

export function tileLayout(session: string): void {
  run(`tmux select-layout -t "${session}:0" tiled`);
}

export function sendKeys(
  session: string,
  paneIndex: number,
  text: string,
): void {
  // Escape single quotes for tmux
  const escaped = text.replace(/'/g, "'\\''");
  run(`tmux send-keys -t "${session}:0.${paneIndex}" '${escaped}' Enter`);
}

export function renamePane(
  session: string,
  paneIndex: number,
  title: string,
): void {
  // Set pane title via escape sequence
  const esc = `\\033]2;${title}\\033\\\\`;
  run(`tmux send-keys -t "${session}:0.${paneIndex}" "printf '${esc}'" Enter`);
  // Also set pane border title if tmux >= 3.2
  run(
    `tmux select-pane -t "${session}:0.${paneIndex}" -T "${title}" 2>/dev/null`,
  );
}

export function enablePaneTitles(session: string): void {
  run(`tmux set-option -t "${session}" pane-border-status top 2>/dev/null`);
  run(
    `tmux set-option -t "${session}" pane-border-format " #{pane_index}: #{pane_title} " 2>/dev/null`,
  );
}

export async function capturePaneOutput(
  session: string,
  paneIndex: number,
  lines = 50,
): Promise<string> {
  return runAsync(
    `tmux capture-pane -t "${session}:0.${paneIndex}" -p -S -${lines} 2>/dev/null`,
  );
}

export function getPaneActivity(session: string, paneIndex: number): number {
  const ts = run(
    `tmux display-message -t "${session}:0.${paneIndex}" -p "#{pane_last_activity}" 2>/dev/null`,
  );
  return ts ? parseInt(ts, 10) : 0;
}

export function getPaneCount(session: string): number {
  const output = run(
    `tmux list-panes -t "${session}:0" -F "#{pane_index}" 2>/dev/null`,
  );
  return output ? output.split("\n").length : 0;
}

export function listSwarmSessions(): string[] {
  const output = run("tmux list-sessions -F '#{session_name}' 2>/dev/null");
  if (!output) return [];
  return output.split("\n").filter((s) => s.startsWith("swarm"));
}
