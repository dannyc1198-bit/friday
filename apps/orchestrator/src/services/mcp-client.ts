// MCP client — spawns Model Context Protocol servers as child processes,
// discovers their tools, and registers them as proxy tools in FRIDAY's
// registry alongside the 50 native tools.
//
// Config lives at ~/.friday/mcp.json. Schema:
//   { "servers": { "<name>": { "command": "npx", "args": [...], "env": {...}, "enabled": true } } }
//
// Tools from MCP servers get the prefix "mcp_<server>_<tool>" to prevent
// name collisions when two servers expose the same tool name.
//
// Failure mode: if a single server fails to connect, log and skip it.
// FRIDAY keeps booting with the rest. One bad MCP server should never
// take down the whole orchestrator.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { toolRegistry } from "../tools/registry.js";
import type { Tool, ToolResult } from "../types/index.js";

interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

interface MCPConfig {
  servers: Record<string, MCPServerConfig>;
}

const CONFIG_PATH = join(homedir(), ".friday", "mcp.json");

interface ConnectedServer {
  name: string;
  client: Client;
  toolCount: number;
}

const connectedServers: ConnectedServer[] = [];

function ensureConfigExists(): void {
  if (existsSync(CONFIG_PATH)) return;
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    const stub: MCPConfig = { servers: {} };
    writeFileSync(CONFIG_PATH, JSON.stringify(stub, null, 2) + "\n", "utf-8");
    console.log(`[MCP] Created empty config at ${CONFIG_PATH}`);
  } catch (err) {
    console.warn(`[MCP] Could not seed config:`, err);
  }
}

function loadConfig(): MCPConfig {
  ensureConfigExists();
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as MCPConfig;
    if (!parsed.servers || typeof parsed.servers !== "object") {
      return { servers: {} };
    }
    return parsed;
  } catch (err) {
    console.warn(`[MCP] Failed to read ${CONFIG_PATH}:`, err);
    return { servers: {} };
  }
}

async function connectServer(
  name: string,
  cfg: MCPServerConfig
): Promise<ConnectedServer | null> {
  if (cfg.enabled === false) {
    console.log(`[MCP] Skipping ${name} (disabled)`);
    return null;
  }

  try {
    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args ?? [],
      env: { ...process.env, ...(cfg.env ?? {}) } as Record<string, string>,
    });

    const client = new Client(
      { name: "friday-orchestrator", version: "2.1.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    const { tools } = await client.listTools();

    for (const t of tools) {
      const proxyName = `mcp_${name}_${t.name}`;
      const proxy: Tool = {
        name: proxyName,
        description: `[${name}] ${t.description ?? t.name}`,
        category: `mcp_${name}`,
        parameters: (t.inputSchema as Tool["parameters"]) ?? {
          type: "object",
          properties: {},
          required: [],
        },
        execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
          try {
            const result = await client.callTool({
              name: t.name,
              arguments: params,
            });
            const isError = Boolean(result.isError);
            return {
              toolCallId: "",
              success: !isError,
              data: result.content,
              error: isError ? "MCP server reported an error" : undefined,
            };
          } catch (err) {
            return {
              toolCallId: "",
              success: false,
              error: err instanceof Error ? err.message : "MCP call failed",
            };
          }
        },
      };
      toolRegistry.register(proxy);
    }

    console.log(`[MCP] Connected ${name}: ${tools.length} tool(s)`);
    return { name, client, toolCount: tools.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[MCP] Failed to connect ${name}: ${msg}`);
    return null;
  }
}

export async function initializeMCPClients(): Promise<void> {
  const config = loadConfig();
  const serverNames = Object.keys(config.servers);

  if (serverNames.length === 0) {
    console.log(`[MCP] No servers configured at ${CONFIG_PATH}`);
    return;
  }

  console.log(`[MCP] Connecting ${serverNames.length} server(s)...`);

  const results = await Promise.all(
    serverNames.map((n) => connectServer(n, config.servers[n]))
  );

  for (const r of results) {
    if (r) connectedServers.push(r);
  }

  const totalTools = connectedServers.reduce((s, c) => s + c.toolCount, 0);
  console.log(`  ✓ MCP: ${connectedServers.length} server(s), ${totalTools} tool(s)`);
}

export async function shutdownMCPClients(): Promise<void> {
  for (const s of connectedServers) {
    try {
      await s.client.close();
    } catch {
      // best-effort shutdown
    }
  }
  connectedServers.length = 0;
}

export function getMCPStatus(): { servers: number; tools: number; names: string[] } {
  return {
    servers: connectedServers.length,
    tools: connectedServers.reduce((s, c) => s + c.toolCount, 0),
    names: connectedServers.map((c) => c.name),
  };
}
