// Quiet mode (DND) tools — pause/filter proactive alerts.
// Priority filter: only alerts at or above `minPriority` get spoken.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { proactiveMonitor } from "../services/proactive-monitor.js";

const setDnd: Tool = {
  name: "set_dnd",
  description: "Enable quiet mode (do-not-disturb) for a duration. Only alerts at or above min_priority will be spoken. Use this for focus blocks.",
  category: "System",
  parameters: {
    type: "object",
    properties: {
      duration_minutes: { type: "number", description: "How long to stay quiet (1-480 minutes). Default 60." },
      min_priority: { type: "string", enum: ["low", "medium", "high"], description: "Minimum priority that still alerts. Default 'high' (only critical comes through)." },
      reason: { type: "string", description: "Optional reason (e.g. 'deep work block')." },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    const minutes = Math.min(480, Math.max(1, (params.duration_minutes as number) ?? 60));
    const minPriority = (params.min_priority as "low" | "medium" | "high") ?? "high";
    const reason = params.reason as string | undefined;

    const state = proactiveMonitor.enableQuietMode(minutes * 60 * 1000, minPriority, reason);
    return {
      toolCallId: "",
      success: true,
      data: {
        enabled: true,
        minutes,
        minPriority,
        until: new Date(state.until).toISOString(),
        reason,
      },
    };
  },
};

const clearDnd: Tool = {
  name: "clear_dnd",
  description: "Disable quiet mode immediately and resume all proactive alerts.",
  category: "System",
  parameters: { type: "object", properties: {} },
  execute: async (): Promise<ToolResult> => {
    proactiveMonitor.disableQuietMode();
    return { toolCallId: "", success: true, data: { enabled: false } };
  },
};

const dndStatus: Tool = {
  name: "dnd_status",
  description: "Check current quiet-mode state and time remaining.",
  category: "System",
  parameters: { type: "object", properties: {} },
  execute: async (): Promise<ToolResult> => {
    const s = proactiveMonitor.getQuietModeStatus();
    return {
      toolCallId: "",
      success: true,
      data: {
        enabled: s.enabled,
        minPriority: s.minPriority,
        remainingMinutes: Math.round(s.remainingMs / 60000),
        until: s.enabled ? new Date(s.until).toISOString() : null,
        reason: s.reason ?? null,
      },
    };
  },
};

export function registerQuietModeTools(): void {
  toolRegistry.register(setDnd);
  toolRegistry.register(clearDnd);
  toolRegistry.register(dndStatus);
}
