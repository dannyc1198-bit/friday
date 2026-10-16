// Friday can see the local apps: "is God's Eye up", "open anatomy".
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { liveAppsStatus } from "../services/live-apps.js";

const liveAppsTool: Tool = {
  name: "live_apps_status",
  description:
    "Read whether Daniel's local apps are up (God's Eye, Osiris, Body Anatomy, Sports) with one live headline each, " +
    "and the Friday page that shows each one. Use it for questions like 'is God's Eye up' or 'open anatomy': " +
    "answer with the status and tell him the page (for example /apps/anatomy). Read-only.",
  category: "system",
  parameters: [
    { name: "app", type: "string", description: "Optional: gods-eye, osiris, anatomy, or sports.", required: false },
  ],
  execute: async (params): Promise<ToolResult> => {
    const wanted = String(params.app ?? "").trim().toLowerCase();
    const apps = await liveAppsStatus();
    const picked = wanted ? apps.filter((app) => app.id === wanted || app.name.toLowerCase().includes(wanted)) : apps;
    return { toolCallId: "", success: true, data: { apps: picked.length ? picked : apps } };
  },
};

export function registerLiveAppsTools(): void {
  toolRegistry.register(liveAppsTool);
}