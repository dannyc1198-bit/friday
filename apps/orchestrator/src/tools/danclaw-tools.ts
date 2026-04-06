// DanClaw Agent Tools
// Gives JARVIS direct access to all 21 DanClaw agents by ID.
// JARVIS can dispatch any agent, list what's available, and check execution history.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { isOpenClawAvailable, resetOpenClawHealth } from "../services/openclaw-bridge.js";

const DANCLAW_BASE = process.env.DANCLAW_BASE_URL || "http://localhost:8080";
const TIMEOUT_MS = 45_000;

function makeResult(success: boolean, data?: unknown, error?: string): ToolResult {
  return { toolCallId: "", success, data, error };
}

async function danclawFetch(path: string, options?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${DANCLAW_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`DanClaw ${response.status}: ${text.slice(0, 200)}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`DanClaw request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Dispatch Agent ───────────────────────────────────────────────────────────

const danclaw_dispatch: Tool = {
  name: "danclaw_dispatch",
  description:
    "Dispatches a task to a specific DanClaw agent by ID. Use danclaw_agents to see all available agents. " +
    "Examples: larry (social media posts), nova (outreach emails), ghostwriter (content), " +
    "clawdy (general ops), hunter (lead research), prospector (cold outreach), " +
    "receptionist (call summaries), morning-brief (daily briefings).",
  category: "danclaw",
  parameters: [
    {
      name: "agent_id",
      type: "string",
      description: "Agent ID to dispatch (e.g. 'larry', 'nova', 'clawdy', 'ghostwriter')",
      required: true,
    },
    {
      name: "task",
      type: "string",
      description: "The task to give the agent — be specific and include all relevant context",
      required: true,
    },
    {
      name: "fast",
      type: "boolean",
      description: "Use fast model (Haiku) instead of default — good for quick drafts",
      required: false,
      default: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const agent_id = params.agent_id as string;
    const task = params.task as string;
    const fast_model = (params.fast as boolean) || false;

    if (!(await isOpenClawAvailable())) {
      return makeResult(
        false,
        undefined,
        "DanClaw is offline. Start it with: cd ~/danclaw && python main.py"
      );
    }

    try {
      const data = (await danclawFetch("/api/dispatch", {
        method: "POST",
        body: JSON.stringify({ agent_id, task, fast_model }),
      })) as { success: boolean; agent_name?: string; result?: string; tokens?: number; model?: string; error?: string };

      if (!data.success) {
        return makeResult(false, undefined, data.error || "Agent returned failure");
      }

      return makeResult(true, {
        agent: data.agent_name || agent_id,
        result: data.result,
        tokens: data.tokens,
        model: data.model,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Dispatch failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── List Agents ──────────────────────────────────────────────────────────────

const danclaw_agents: Tool = {
  name: "danclaw_agents",
  description:
    "Lists all available DanClaw agents with their IDs, names, and roles. " +
    "Check this before dispatching to know the right agent ID.",
  category: "danclaw",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    if (!(await isOpenClawAvailable())) {
      return makeResult(
        false,
        undefined,
        "DanClaw is offline. Start it with: cd ~/danclaw && python main.py"
      );
    }

    try {
      const data = (await danclawFetch("/api/agents")) as {
        agents: Array<{ id: string; name: string; role: string; schedule: string }>;
      };

      return makeResult(true, {
        count: data.agents.length,
        agents: data.agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          schedule: a.schedule,
        })),
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Failed to list agents: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── Execution History ────────────────────────────────────────────────────────

const danclaw_history: Tool = {
  name: "danclaw_history",
  description:
    "Gets the recent DanClaw agent execution history — who ran, what task, success/fail, token usage.",
  category: "danclaw",
  parameters: [
    {
      name: "limit",
      type: "number",
      description: "How many recent executions to return (default 10)",
      required: false,
      default: 10,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const limit = (params.limit as number) || 10;

    if (!(await isOpenClawAvailable())) {
      return makeResult(
        false,
        undefined,
        "DanClaw is offline. Start it with: cd ~/danclaw && python main.py"
      );
    }

    try {
      const data = (await danclawFetch(`/api/history?limit=${limit}`)) as {
        history: Array<{
          agent_id: string;
          agent_name: string;
          task: string;
          success: boolean;
          tokens?: number;
          timestamp: string;
        }>;
      };

      return makeResult(true, {
        count: data.history.length,
        history: data.history.map((h) => ({
          agent: h.agent_name || h.agent_id,
          task: h.task.slice(0, 80) + (h.task.length > 80 ? "…" : ""),
          success: h.success,
          tokens: h.tokens,
          at: h.timestamp,
        })),
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Failed to get history: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── System Status ────────────────────────────────────────────────────────────

const danclaw_status: Tool = {
  name: "danclaw_status",
  description:
    "Gets DanClaw full system status — agents loaded, scheduler state, last execution.",
  category: "danclaw",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    // Force a fresh health check
    resetOpenClawHealth();

    if (!(await isOpenClawAvailable())) {
      return makeResult(true, {
        online: false,
        message: "DanClaw is offline. Start it with: cd ~/danclaw && python main.py",
      });
    }

    try {
      const data = (await danclawFetch("/api/status")) as {
        agents_available: number;
        scheduler_running: boolean;
        last_execution?: { agent_name: string; task: string; timestamp: string };
      };

      return makeResult(true, {
        online: true,
        agents: data.agents_available,
        scheduler: data.scheduler_running ? "running" : "stopped",
        last_execution: data.last_execution
          ? {
              agent: data.last_execution.agent_name,
              task: data.last_execution.task.slice(0, 80),
              at: data.last_execution.timestamp,
            }
          : null,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Status check failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerDanClawTools(): void {
  toolRegistry.register(danclaw_dispatch);
  toolRegistry.register(danclaw_agents);
  toolRegistry.register(danclaw_history);
  toolRegistry.register(danclaw_status);
}
