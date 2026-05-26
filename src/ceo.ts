#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, readFileSync } from "node:fs";
import { loadSwarmConfig } from "./loader.js";
import {
  hasTmux,
  sessionExists,
  killSession,
  createSession,
  splitPane,
  tileLayout,
  sendKeys,
  renamePane,
  enablePaneTitles,
  capturePaneOutput,
  getPaneActivity,
  listSwarmSessions,
} from "./tmux.js";
import type { SwarmState, VpState, VpStatus } from "./types.js";

const log = (msg: string) =>
  console.log(`${chalk.cyan("[agentswarm]")} ${msg}`);
const err = (msg: string) =>
  console.error(`${chalk.red("[agentswarm]")} ${msg}`);

// ─── Deploy ───

async function deploy(configPath: string, dryRun: boolean): Promise<void> {
  const config = loadSwarmConfig(configPath);
  const { swarm, vps } = config;

  log(`${chalk.bold(swarm.name)} — ${vps.length} VPs`);
  log(
    `Session: ${swarm.session} | Poll: ${swarm.poll_interval}s | Max: ${swarm.max_runtime}m | Idle: ${swarm.idle_timeout}s`,
  );
  console.log();

  // Show VP plan
  for (const vp of vps) {
    const deps =
      vp.depends_on && vp.depends_on.length > 0
        ? chalk.dim(` → waits for ${vp.depends_on.join(", ")}`)
        : "";
    log(`  [${vp.pane}] ${chalk.bold(vp.role)} (${vp.model})${deps}`);
  }
  console.log();

  if (dryRun) {
    log(chalk.yellow("DRY RUN — nothing deployed."));
    for (const vp of vps) {
      console.log(chalk.dim(`  ${vp.role}: ${vp.prompt.slice(0, 100)}...`));
    }
    return;
  }

  // Preflight
  if (!hasTmux()) {
    err("tmux is required. Install: brew install tmux");
    process.exit(1);
  }

  // Kill existing session
  if (sessionExists(swarm.session)) {
    log(`Killing existing session: ${swarm.session}`);
    killSession(swarm.session);
  }

  // Create session
  log(`Creating tmux session: ${chalk.green(swarm.session)}`);
  createSession(swarm.session);
  enablePaneTitles(swarm.session);

  // Create panes — pane 0 already exists, split for each additional VP
  for (let i = 1; i < vps.length; i++) {
    const direction = i % 2 === 0 ? "v" : "h";
    splitPane(swarm.session, direction);
  }
  tileLayout(swarm.session);

  // Name and deploy each VP
  const state: SwarmState = {
    config,
    startedAt: new Date().toISOString(),
    sessionName: swarm.session,
    vps: [],
    pollCount: 0,
    allDone: false,
  };

  for (let i = 0; i < vps.length; i++) {
    const vp = vps[i];
    const paneIndex = i; // tmux panes are 0-indexed after creation

    // Name the pane
    renamePane(swarm.session, paneIndex, vp.role);

    // Build the claude command
    const promptOneLine = vp.prompt
      .replace(/\n/g, " ")
      .replace(/"/g, '\\"')
      .trim();

    // Check if VP has unmet dependencies
    const hasDeps = vp.depends_on && vp.depends_on.length > 0;
    const initialStatus: VpStatus = hasDeps ? "pending" : "deploying";

    state.vps.push({
      config: vp,
      paneIndex,
      status: initialStatus,
      deployedAt: null,
      doneAt: null,
      lastActivity: Date.now(),
      outputLines: [],
    });

    if (!hasDeps) {
      // Deploy immediately
      const cmd = `claude --dangerously-skip-permissions "${promptOneLine}"`;
      sendKeys(swarm.session, paneIndex, cmd);
      state.vps[i].status = "running";
      state.vps[i].deployedAt = new Date().toISOString();
      log(`  ${chalk.green("▶")} Deployed: ${vp.role} → pane ${paneIndex}`);
    } else {
      // Show waiting message in pane
      sendKeys(
        swarm.session,
        paneIndex,
        `echo "⏳ ${vp.role} waiting for: ${vp.depends_on!.join(", ")}"`,
      );
      log(
        `  ${chalk.yellow("⏸")} Pending: ${vp.role} (needs ${vp.depends_on!.join(", ")})`,
      );
    }

    // Brief pause between deployments
    await sleep(500);
  }

  console.log();
  log(`${chalk.green("All VPs initialized.")} Starting monitoring loop...`);
  log(`Attach: ${chalk.cyan(`tmux attach -t ${swarm.session}`)}`);
  console.log();

  // ─── Monitoring loop ───
  await monitorLoop(state);
}

async function monitorLoop(state: SwarmState): Promise<void> {
  const { config, sessionName } = state;
  const pollMs = config.swarm.poll_interval * 1000;
  const maxMs = config.swarm.max_runtime * 60 * 1000;
  const idleTimeout = config.swarm.idle_timeout;
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;

    // Max runtime check
    if (elapsed > maxMs) {
      log(
        chalk.yellow(
          `Max runtime reached (${config.swarm.max_runtime}m). Shutting down.`,
        ),
      );
      break;
    }

    state.pollCount++;

    // Check each VP
    let doneCount = 0;
    let deployedPending = false;

    for (const vp of state.vps) {
      if (vp.status === "done") {
        doneCount++;
        continue;
      }

      // Check pending VPs — deploy if deps are met
      if (vp.status === "pending") {
        const depsReady = (vp.config.depends_on ?? []).every(
          (dep) =>
            state.vps.find((v) => v.config.role === dep)?.status === "done",
        );

        if (depsReady) {
          const promptOneLine = vp.config.prompt
            .replace(/\n/g, " ")
            .replace(/"/g, '\\"')
            .trim();
          const cmd = `claude --dangerously-skip-permissions "${promptOneLine}"`;
          sendKeys(sessionName, vp.paneIndex, cmd);
          vp.status = "running";
          vp.deployedAt = new Date().toISOString();
          deployedPending = true;
          log(`  ${chalk.green("▶")} Deployed: ${vp.config.role} (deps met)`);
        }
        continue;
      }

      // Check running VPs for done signal
      const output = await capturePaneOutput(sessionName, vp.paneIndex, 30);
      vp.outputLines = output.split("\n").slice(-10);

      const donePattern = `${vp.config.role}: DONE`;
      if (output.includes(donePattern)) {
        vp.status = "done";
        vp.doneAt = new Date().toISOString();
        doneCount++;
        log(`  ${chalk.green("✓")} Done: ${vp.config.role}`);
        continue;
      }

      // Check for idle
      const activity = getPaneActivity(sessionName, vp.paneIndex);
      if (activity > 0) {
        const idleSecs = Math.floor(Date.now() / 1000) - activity;
        if (idleSecs > idleTimeout) {
          if (vp.status !== "idle") {
            vp.status = "idle";
            log(
              `  ${chalk.yellow("⏸")} Idle: ${vp.config.role} (${idleSecs}s no output)`,
            );
          }
        } else {
          vp.status = "running";
        }
        vp.lastActivity = activity * 1000;
      }
    }

    // Print status
    printStatus(state, elapsed);

    // Write status file
    writeStatusFile(state);

    // All done?
    if (doneCount === state.vps.length) {
      state.allDone = true;
      console.log();
      log(chalk.green.bold("All VPs complete! Swarm finished."));
      log(`Total time: ${formatElapsed(elapsed)}`);
      writeStatusFile(state);
      break;
    }

    // If we just deployed pending VPs, do a quick re-check soon
    if (deployedPending) {
      await sleep(5000);
      continue;
    }

    await sleep(pollMs);
  }
}

// ─── Status display ───

function printStatus(state: SwarmState, elapsed: number): void {
  const statusIcons: Record<VpStatus, string> = {
    pending: chalk.dim("○"),
    deploying: chalk.blue("◐"),
    running: chalk.cyan("▶"),
    idle: chalk.yellow("⏸"),
    done: chalk.green("✓"),
    failed: chalk.red("✗"),
  };

  console.log();
  console.log(
    `${chalk.cyan.bold("agentswarm")} ${chalk.dim(`poll #${state.pollCount} · ${formatElapsed(elapsed)}`)}`,
  );
  console.log(chalk.dim("─".repeat(55)));

  const doneCount = state.vps.filter((v) => v.status === "done").length;

  for (const vp of state.vps) {
    const icon = statusIcons[vp.status];
    const statusText = vp.status.toUpperCase().padEnd(9);
    const lastLine =
      vp.outputLines.length > 0
        ? chalk.dim(
            ` ${vp.outputLines[vp.outputLines.length - 1]?.slice(0, 50) ?? ""}`,
          )
        : "";
    console.log(
      `  ${icon} ${vp.config.role.padEnd(22)} ${statusText}${lastLine}`,
    );
  }

  console.log();
  console.log(
    `  Progress: ${chalk.bold(`${doneCount}/${state.vps.length}`)} VPs complete`,
  );
}

function writeStatusFile(state: SwarmState): void {
  const file = `/tmp/agentswarm-${state.sessionName}-status.json`;
  const data = {
    timestamp: new Date().toISOString(),
    session: state.sessionName,
    swarmName: state.config.swarm.name,
    pollCount: state.pollCount,
    allDone: state.allDone,
    elapsedMs: Date.now() - new Date(state.startedAt).getTime(),
    vps: state.vps.map((v) => ({
      role: v.config.role,
      pane: v.paneIndex,
      status: v.status,
      model: v.config.model,
      deployedAt: v.deployedAt,
      doneAt: v.doneAt,
    })),
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── Helpers ───

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

// ─── CLI ───

const program = new Command();

program
  .name("agentswarm")
  .description("CEO orchestration for AI agent swarms")
  .version("0.2.0");

program
  .command("run")
  .description("Deploy a swarm from config")
  .argument("<config>", "Path to swarm.yaml")
  .option("--dry", "Preview without deploying", false)
  .action(async (configPath: string, opts: { dry: boolean }) => {
    try {
      await deploy(configPath, opts.dry);
    } catch (e) {
      err((e as Error).message);
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate a swarm config")
  .argument("<config>", "Path to swarm.yaml")
  .action((configPath: string) => {
    try {
      const config = loadSwarmConfig(configPath);
      log(chalk.green("✓ Config valid"));
      console.log();
      console.log(`  Swarm:   ${config.swarm.name}`);
      console.log(`  Session: ${config.swarm.session}`);
      console.log(`  VPs:     ${config.vps.length}`);
      console.log();
      for (const vp of config.vps) {
        const deps =
          vp.depends_on && vp.depends_on.length > 0
            ? chalk.dim(` → ${vp.depends_on.join(", ")}`)
            : "";
        console.log(`  [${vp.pane}] ${vp.role} (${vp.model})${deps}`);
      }
      console.log();
    } catch (e) {
      err((e as Error).message);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show status of a running swarm")
  .argument("<session>", "tmux session name")
  .action((session: string) => {
    const statusFile = `/tmp/agentswarm-${session}-status.json`;
    try {
      const raw = readFileSync(statusFile, "utf-8");
      const data = JSON.parse(raw);
      console.log();
      console.log(
        `${chalk.cyan.bold("agentswarm status")} ${chalk.dim(data.timestamp)}`,
      );
      console.log(chalk.dim("─".repeat(55)));
      console.log(
        `  Swarm: ${data.swarmName} | Polls: ${data.pollCount} | ${formatElapsed(data.elapsedMs)}`,
      );
      console.log();

      const icons: Record<string, string> = {
        pending: chalk.dim("○"),
        running: chalk.cyan("▶"),
        idle: chalk.yellow("⏸"),
        done: chalk.green("✓"),
        failed: chalk.red("✗"),
      };

      for (const vp of data.vps) {
        const icon = icons[vp.status] ?? "?";
        console.log(
          `  ${icon} ${vp.role.padEnd(22)} ${vp.status.toUpperCase().padEnd(9)} pane ${vp.pane}`,
        );
      }

      const done = data.vps.filter(
        (v: { status: string }) => v.status === "done",
      ).length;
      console.log();
      console.log(`  Progress: ${done}/${data.vps.length} VPs complete`);
      if (data.allDone) console.log(chalk.green("  All done!"));
      console.log();
    } catch {
      err(`No status file for session "${session}". Is the swarm running?`);
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop a running swarm")
  .argument("<session>", "tmux session name")
  .action((session: string) => {
    if (sessionExists(session)) {
      killSession(session);
      log(chalk.green(`Stopped: ${session}`));
    } else {
      err(`Session "${session}" not found`);
    }
  });

program
  .command("list")
  .description("List running swarm sessions")
  .action(() => {
    const sessions = listSwarmSessions();
    console.log();
    console.log(chalk.cyan.bold("Running swarm sessions:"));
    if (sessions.length === 0) {
      console.log("  (none)");
    } else {
      for (const s of sessions) {
        console.log(`  ${s}`);
      }
    }
    console.log();
  });

program.parse();
