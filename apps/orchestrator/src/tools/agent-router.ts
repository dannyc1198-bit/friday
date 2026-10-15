// Unified router so chat can hand a task to the same adapters the HUD uses.
// Offline backends return an error string; they never throw.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { dispatchAgent } from "../services/agents/registry.js";

const routeAgentTaskTool: Tool = {
  name: "route_agent_task",
  description:
    "Send a task to one agent backend: a Grok bot (id grok-bot:<name>), the Codex CLI (codex), " +
    "Claude Code (claude-code), or the xAI Grok API (xai-grok). " +
    "Use delegate_to_claude_code instead when you need a model alias or a long coding job. " +
    "If the backend is offline, tell the user it is offline. Do not invent a result.",
  category: "delegation",
  parameters: [
    {
      name: "agent",
      type: "string",
      description: "Backend id: grok-bot:<name>, codex, claude-code, or xai-grok.",
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
