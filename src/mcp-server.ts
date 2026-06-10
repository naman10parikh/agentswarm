#!/usr/bin/env node
/**
 * agentswarm MCP server
 *
 * The repo's OWN MCP server (NOT the inherited github/context7/memory/obsidian
 * client template). Exposes agentswarm's real product capabilities to any MCP
 * client (Claude Code, etc.) over JSON-RPC 2.0 on stdio:
 *
 *   - validate_swarm  — parse + schema-check a swarm.yaml (reuses loadSwarmConfig)
 *   - swarm_status    — read a running swarm's /tmp status file
 *   - memory_search   — BM25 query over this repo's own knowledge corpus
 *
 * Zero external deps: only node:fs / node:readline + the existing product modules.
 *
 * Add to .mcp.json:
 *   { "mcpServers": { "agentswarm": { "command": "node",
 *       "args": ["dist/mcp-server.js"] } } }
 */
import * as readline from "node:readline";
import { readFileSync } from "node:fs";
import { loadSwarmConfig } from "./loader.js";
import { searchMemory } from "./memory-search.js";

// ─── JSON-RPC helpers ───
function send(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function ok(id: unknown, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}
function rpcErr(id: unknown, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// ─── Tool definitions ───
const TOOLS = [
  {
    name: "validate_swarm",
    description:
      "Parse and schema-validate a swarm.yaml config. Returns valid:true/false, the swarm name/session, and the VP roster (role, model, depends_on).",
    inputSchema: {
      type: "object",
      properties: {
        config_path: {
          type: "string",
          description: "Path to the swarm.yaml file to validate.",
        },
      },
      required: ["config_path"],
    },
  },
  {
    name: "swarm_status",
    description:
      "Read the live status of a running swarm from /tmp/agentswarm-{session}-status.json. Returns the per-VP status array and completion progress.",
    inputSchema: {
      type: "object",
      properties: {
        session: {
          type: "string",
          description: "tmux session name of the running swarm.",
        },
      },
      required: ["session"],
    },
  },
  {
    name: "memory_search",
    description:
      "BM25-ranked search over agentswarm's own knowledge corpus (MEMORY.md, memory/, brain/, top-level docs). Returns the top hits with file path + best-matching snippet.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        limit: {
          type: "number",
          description: "Max results to return (default 5).",
        },
      },
      required: ["query"],
    },
  },
];

// ─── Tool handlers ───
function handleValidateSwarm(id: unknown, args: Record<string, unknown>): void {
  const configPath = args["config_path"];
  if (typeof configPath !== "string") {
    rpcErr(id, -32602, "config_path (string) is required");
    return;
  }
  try {
    const cfg = loadSwarmConfig(configPath);
    ok(id, {
      valid: true,
      name: cfg.swarm.name,
      session: cfg.swarm.session,
      vpCount: cfg.vps.length,
      vps: cfg.vps.map((v) => ({
        role: v.role,
        model: v.model,
        pane: v.pane,
        depends_on: v.depends_on ?? [],
      })),
    });
  } catch (e) {
    ok(id, {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function handleSwarmStatus(id: unknown, args: Record<string, unknown>): void {
  const session = args["session"];
  if (typeof session !== "string") {
    rpcErr(id, -32602, "session (string) is required");
    return;
  }
  const file = `/tmp/agentswarm-${session}-status.json`;
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const vps: Array<{ status: string }> = Array.isArray(data.vps)
      ? data.vps
      : [];
    const done = vps.filter((v) => v.status === "done").length;
    ok(id, { ...data, doneCount: done, total: vps.length });
  } catch {
    ok(id, {
      found: false,
      error: `No status file for session "${session}" — is the swarm running?`,
    });
  }
}

function handleMemorySearch(id: unknown, args: Record<string, unknown>): void {
  const query = args["query"];
  if (typeof query !== "string") {
    rpcErr(id, -32602, "query (string) is required");
    return;
  }
  const limit = typeof args["limit"] === "number" ? args["limit"] : 5;
  ok(id, { query, hits: searchMemory(query, limit) });
}

// ─── stdio JSON-RPC loop ───
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }

  const { id, method } = msg;
  const params = (msg["params"] ?? {}) as Record<string, unknown>;

  switch (method) {
    case "initialize":
      ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "agentswarm", version: "0.2.0" },
      });
      break;

    case "tools/list":
      ok(id, { tools: TOOLS });
      break;

    case "tools/call": {
      const toolName = params["name"] as string | undefined;
      const toolArgs = (params["arguments"] ?? {}) as Record<string, unknown>;
      if (toolName === "validate_swarm") handleValidateSwarm(id, toolArgs);
      else if (toolName === "swarm_status") handleSwarmStatus(id, toolArgs);
      else if (toolName === "memory_search") handleMemorySearch(id, toolArgs);
      else rpcErr(id, -32601, `Unknown tool: ${String(toolName)}`);
      break;
    }

    default:
      rpcErr(id, -32601, `Method not found: ${String(method)}`);
  }
});
