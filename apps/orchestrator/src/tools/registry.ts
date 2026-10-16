import type { Tool, ToolResult } from "../types/index.js";
import { isOutboundTool } from "../services/intent-router.js";
import { publishThought } from "../services/thought-bus.js";
import {
  assessBrowserEffect,
  browserEffectContext,
  consumeGrantedEffect,
  noteBrowserDraft,
  stageEffect,
} from "../services/effect-gate.js";

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  // Register a tool
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  // Get a tool by name
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  // Get all tools
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Get tools by category
  getToolsByCategory(category: string): Tool[] {
    return this.getAllTools().filter((t) => t.category === category);
  }

  // Execute a tool
  async execute(
    toolName: string,
    parameters: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);

    if (signal?.aborted) {
      return { toolCallId: "", success: false, error: "Cancelled before the tool started." };
    }

    if (isOutboundTool(toolName)) {
      return {
        toolCallId: "",
        success: false,
        error: `Refused "${toolName}". Messages, spending, and live trades stay drafts until Danny explicitly approves one.`,
      };
    }

    const effect = assessBrowserEffect(toolName, parameters, browserEffectContext());
    if (effect && !consumeGrantedEffect(effect)) {
      const token = stageEffect(toolName, parameters, effect);
      return {
        toolCallId: "",
        success: false,
        error: `Approval required before this browser submission. Action: ${effect.action}. Destination: ${effect.destination}. Content: ${effect.content}. Amount: ${effect.amount}. Approve token ${token}. A model cannot approve this itself.`,
        data: { needsApproval: true, token, ...effect },
      };
    }

    if (!tool) {
      return {
        toolCallId: "",
        success: false,
        error: `Tool "${toolName}" not found`,
      };
    }

    try {
      console.log(`[ToolRegistry] Executing tool: ${toolName}`);
      const result = await runWithStop(tool.execute(parameters), signal);
      if (toolName === "browser_type" && result.success && typeof parameters.text === "string") {
        noteBrowserDraft(parameters.text);
      }
      if (result.success && toolName.startsWith("obsidian_")) {
        const raw = parameters.note ?? parameters.title ?? parameters.path;
        if (typeof raw === "string" && raw.trim()) {
          const writes = ["obsidian_create", "obsidian_edit", "obsidian_daily"].includes(toolName);
          const notePath = raw.trim().toLowerCase().endsWith(".md") ? raw.trim() : `${raw.trim()}.md`;
          publishThought({ kind: writes ? "learning" : "recall", label: raw.trim(), detail: notePath, source: toolName });
        }
      }
      console.log(`[ToolRegistry] Tool result: ${toolName} ${result.success ? "ok" : "failed"}`);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[ToolRegistry] Tool execution failed:`, errorMessage);
      return {
        toolCallId: "",
        success: false,
        error: errorMessage,
      };
    }
  }

  // Check if tools are available
  hasTools(): boolean {
    return this.tools.size > 0;
  }

  // Get tool count
  getToolCount(): number {
    return this.tools.size;
  }
}

function runWithStop(pending: Promise<ToolResult>, signal?: AbortSignal): Promise<ToolResult> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      resolve({
        toolCallId: "",
        success: false,
        error: "Stop requested. This tool was already running and may not be interruptible.",
        data: { uninterruptible: true },
      });
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
