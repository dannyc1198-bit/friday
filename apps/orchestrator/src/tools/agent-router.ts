// Unified router so chat can hand a task to the same adapters the HUD uses.
// Offline backends return an error string; they never throw.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { dispatchAgent } from "../services/agents/registry.js";

const routeAgentTaskTool: Tool = {
  name: "route_agent_task",
  description:
    "Send a task to one agent backend: Codex CLI (codex), the xAI Grok code model (xai-grok), " +
    "or a Grok bot (id grok-bot:<name>). Codex is the coding default. Use xai-grok when Codex is offline. " +
    "If the backend is offline, tell the user it is offline. Do not invent a result.",
  category: "delegation",
  parameters: [
    {
      name: "agent",
      type: "string",
      description: "Backend id: codex, xai-grok, or grok-bot:<name>.",
      required: true,
    },
    {
      name: "task",
      type: "string",
      description: "Complete task. The backend does not see the rest of this conversation.",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const agent = String(params.agent ?? "").trim();
    const task = String(params.task ?? "").trim();
    if (!agent || !task) {
      return { toolCallId: "", success: false, error: "agent and task are required" };
    }
    if (agent === "claude-code") {
      return {
        toolCallId: "",
        success: false,
        error: "Claude Code is not available. Use codex, or xai-grok if Codex is offline.",
      };
    }
    const result = await dispatchAgent(agent, task);
    if (!result.ok) {
      return { toolCallId: "", success: false, error: result.summary };
    }
    return {
      toolCallId: "",
      success: true,
      data: { message: result.summary, output: result.output || "" },
    };
  },
};

export function registerAgentRouterTools(): void {
  toolRegistry.register(routeAgentTaskTool);
}
