// Sidecar Tools — Let the LLM interact with the Python sidecar
// (camera, kitchen nagger, voice, security, notifications)

import { toolRegistry } from "./registry.js";
import {
  isSidecarAvailable,
  getSidecarStatus,
  triggerSidecarSpeak,
  triggerSidecarNotify,
} from "../services/sidecar-bridge.js";
import type { ToolResult } from "../types/index.js";

function makeResult(success: boolean, data?: unknown, error?: string): ToolResult {
  return { toolCallId: "", success, data, error };
}

async function guardSidecar(): Promise<ToolResult | null> {
  if (!(await isSidecarAvailable())) {
    return makeResult(false, undefined, "Sidecar is offline. Camera and voice features unavailable.");
  }
  return null;
}

export function registerSidecarTools(): void {
  toolRegistry.register({
    name: "check_camera",
    description: "Get the current camera scene analysis — what JARVIS sees right now (person detection, mess level, security, general observation)",
    category: "Sidecar",
    parameters: [],
    execute: async () => {
      const guard = await guardSidecar();
      if (guard) return guard;

      const status = await getSidecarStatus();
      if (!status) return makeResult(false, undefined, "Failed to get sidecar status");

      const analysis = status.last_analysis as Record<string, unknown> || {};
      return makeResult(true, {
        person_present: status.person_present,
        mess_level: analysis.mess_level ?? 0,
        observation: analysis.general_observation ?? "No recent scan",
        scene_type: analysis.scene_type,
        person_activity: analysis.person_appears_to_be,
        security_concern: analysis.security_concern,
        mood_suggestion: analysis.mood_suggestion,
      });
    },
  });

  toolRegistry.register({
    name: "check_kitchen_status",
    description: "Get the kitchen nagger status — current mess level, nag count, escalation level, cleanup history",
    category: "Sidecar",
    parameters: [],
    execute: async () => {
      const guard = await guardSidecar();
      if (guard) return guard;

      const status = await getSidecarStatus();
      if (!status) return makeResult(false, undefined, "Failed to get sidecar status");

      const analysis = status.last_analysis as Record<string, unknown> || {};
      return makeResult(true, {
        mess_level: analysis.mess_level ?? 0,
        mess_description: analysis.mess_description ?? "Unknown",
        cleanup_tasks: analysis.cleanup_tasks ?? [],
        consecutive_nags: status.consecutive_nags,
        total_nags_today: status.total_nags_today,
        total_cleanups_today: status.total_cleanups_today,
        daily_events: status.daily_events,
      });
    },
  });

  toolRegistry.register({
    name: "get_home_status",
    description: "Get full home status — person presence, voice mode (sleeping/conversation), security state, daily events",
    category: "Sidecar",
    parameters: [],
    execute: async () => {
      const guard = await guardSidecar();
      if (guard) return guard;

      const status = await getSidecarStatus();
      if (!status) return makeResult(false, undefined, "Failed to get sidecar status");

      return makeResult(true, {
        voice_mode: status.voice_mode,
        person_present: status.person_present,
        mess_level: (status.last_analysis as any)?.mess_level ?? 0,
        consecutive_nags: status.consecutive_nags,
        total_nags_today: status.total_nags_today,
        total_cleanups_today: status.total_cleanups_today,
        daily_events: status.daily_events,
      });
    },
  });

  toolRegistry.register({
    name: "speak_to_user",
    description: "Make JARVIS speak out loud through the home speakers. Use this when the user asks to hear something or when you need to announce something.",
    category: "Sidecar",
    parameters: [
      { name: "text", type: "string" as const, description: "What to say out loud", required: true },
    ],
    execute: async (params: Record<string, unknown>) => {
      const guard = await guardSidecar();
      if (guard) return guard;

      const text = params.text as string;
      if (!text) return makeResult(false, undefined, "No text provided");

      const ok = await triggerSidecarSpeak(text);
      return ok
        ? makeResult(true, { spoken: text })
        : makeResult(false, undefined, "Failed to trigger TTS on sidecar");
    },
  });

  toolRegistry.register({
    name: "send_alert",
    description: "Send a notification alert through home systems (Windows toast, optional phone call for critical alerts)",
    category: "Sidecar",
    parameters: [
      { name: "title", type: "string" as const, description: "Alert title", required: true },
      { name: "message", type: "string" as const, description: "Alert message", required: true },
      { name: "level", type: "string" as const, description: "Alert level: info, warning, or critical", required: false, enum: ["info", "warning", "critical"], default: "info" },
    ],
    execute: async (params: Record<string, unknown>) => {
      const guard = await guardSidecar();
      if (guard) return guard;

      const title = params.title as string;
      const message = params.message as string;
      const level = (params.level as string) || "info";

      if (!title || !message) return makeResult(false, undefined, "Title and message required");

      const ok = await triggerSidecarNotify(title, message, level);
      return ok
        ? makeResult(true, { sent: true, level })
        : makeResult(false, undefined, "Failed to send notification via sidecar");
    },
  });
}
