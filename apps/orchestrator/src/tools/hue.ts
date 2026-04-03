// Philips Hue Integration for JARVIS — Phase 2, Step 2.1
// Real Hue REST API: auto-discover bridge, pair, control lights
// Tools: hue_get_lights, hue_set_light, hue_set_all, hue_set_color_hex, hue_set_scene, hue_get_bridge_status

import { promises as fs } from "fs";
import path from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

// ─── Interfaces ──────────────────────────────────────────────

interface HueCredentials {
  bridgeIp: string;
  username: string;
  pairedAt: string;
}

interface HueLightState {
  on: boolean;
  bri: number; // 1-254
  hue?: number; // 0-65535
  sat?: number; // 0-254
  ct?: number; // color temp in mirek (153-500)
  reachable: boolean;
}

interface HueLight {
  id: string;
  name: string;
  type: string;
  state: HueLightState;
  modelid: string;
}

// ─── Constants ──────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const CRED_FILE = path.join(DATA_DIR, "hue-credentials.json");
const API_TIMEOUT = 8000; // 8s — local network, should be fast
const DISCOVERY_URL = "https://discovery.meethue.com/";
const DEVICE_TYPE = "JARVIS#orchestrator";

// Manual override from .env (for networks that block meethue.com discovery)
const ENV_BRIDGE_IP = process.env.HUE_BRIDGE_IP || "";

// ─── Credential Management ──────────────────────────────────

let cachedCredentials: HueCredentials | null = null;

async function loadCredentials(): Promise<HueCredentials | null> {
  if (cachedCredentials) return cachedCredentials;

  try {
    const data = await fs.readFile(CRED_FILE, "utf-8");
    cachedCredentials = JSON.parse(data);
    return cachedCredentials;
  } catch {
    return null;
  }
}

async function saveCredentials(creds: HueCredentials): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CRED_FILE, JSON.stringify(creds, null, 2));
  cachedCredentials = creds;
}

// ─── Bridge Discovery ───────────────────────────────────────

async function discoverBridge(): Promise<string | null> {
  // Check env override first
  if (ENV_BRIDGE_IP) return ENV_BRIDGE_IP;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(DISCOVERY_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const bridges = (await response.json()) as Array<{
      id: string;
      internalipaddress: string;
    }>;

    if (bridges.length === 0) return null;

    // Use the first discovered bridge
    return bridges[0].internalipaddress;
  } catch {
    return null;
  }
}

// ─── Bridge API Helper ──────────────────────────────────────

async function hueApi(
  method: "GET" | "PUT" | "POST",
  endpoint: string,
  body?: object
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const creds = await loadCredentials();

  if (!creds) {
    return {
      ok: false,
      error:
        "Hue bridge not paired. Ask Danny to press the bridge button, then use hue_get_bridge_status to pair.",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    const url = `http://${creds.bridgeIp}/api/${creds.username}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { ok: false, error: `Hue API HTTP ${response.status}` };
    }

    const data = await response.json();

    // Hue API returns errors as [{error: {type, address, description}}]
    if (Array.isArray(data) && data[0]?.error) {
      return { ok: false, error: data[0].error.description };
    }

    return { ok: true, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Hue bridge timeout — is it powered on?" };
    }
    return {
      ok: false,
      error: `Bridge unreachable: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ─── Color Conversion ───────────────────────────────────────
// Hue uses: hue 0-65535, sat 0-254, bri 1-254
// We convert from hex (#RRGGBB) via RGB to HSV then scale to Hue ranges

function hexToHueSat(hex: string): { hue: number; sat: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;

  const r = parseInt(match[1], 16) / 255;
  const g = parseInt(match[2], 16) / 255;
  const b = parseInt(match[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Saturation
  const sat = max === 0 ? 0 : Math.round((delta / max) * 254);

  // Hue (0-360 degrees then scaled to 0-65535)
  let hDeg = 0;
  if (delta !== 0) {
    if (max === r) {
      hDeg = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hDeg = 60 * ((b - r) / delta + 2);
    } else {
      hDeg = 60 * ((r - g) / delta + 4);
    }
  }
  if (hDeg < 0) hDeg += 360;

  const hue = Math.round((hDeg / 360) * 65535);

  return { hue, sat };
}

// Convert brightness percentage (0-100) to Hue bri (1-254)
function percentToBri(percent: number): number {
  return Math.max(1, Math.min(254, Math.round((percent / 100) * 254)));
}

// ─── Tool Definitions ────────────────────────────────────────

const hueGetLightsTool: Tool = {
  name: "hue_get_lights",
  description:
    "List all Philips Hue lights with their current state (on/off, brightness, color, reachability).",
  category: "smart_home",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const result = await hueApi("GET", "/lights");

    if (!result.ok) {
      return { toolCallId: "", success: false, error: result.error };
    }

    const raw = result.data as Record<
      string,
      { name: string; type: string; state: HueLightState; modelid: string }
    >;

    const lights: HueLight[] = Object.entries(raw).map(([id, light]) => ({
      id,
      name: light.name,
      type: light.type,
      state: {
        on: light.state.on,
        bri: light.state.bri,
        hue: light.state.hue,
        sat: light.state.sat,
        ct: light.state.ct,
        reachable: light.state.reachable,
      },
      modelid: light.modelid,
    }));

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `${lights.length} light(s) found.`,
        lights,
      },
    };
  },
};

const hueSetLightTool: Tool = {
  name: "hue_set_light",
  description:
    "Control a specific Hue light by ID. Set on/off, brightness (1-254), hue (0-65535), saturation (0-254).",
  category: "smart_home",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "Light ID (from hue_get_lights)",
      required: true,
    },
    {
      name: "on",
      type: "boolean",
      description: "Turn on (true) or off (false)",
      required: false,
    },
    {
      name: "bri",
      type: "number",
      description: "Brightness 1-254 (or use percent 1-100, auto-converted)",
      required: false,
    },
    {
      name: "hue",
      type: "number",
      description: "Hue color 0-65535",
      required: false,
    },
    {
      name: "sat",
      type: "number",
      description: "Saturation 0-254",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const id = params.id as string;
    const body: Record<string, unknown> = {};

    if (params.on !== undefined) body.on = params.on as boolean;

    if (params.bri !== undefined) {
      let bri = params.bri as number;
      // Auto-detect percentage input (1-100) vs raw (1-254)
      if (bri >= 1 && bri <= 100) bri = percentToBri(bri);
      body.bri = Math.max(1, Math.min(254, bri));
    }

    if (params.hue !== undefined) {
      body.hue = Math.max(0, Math.min(65535, params.hue as number));
    }

    if (params.sat !== undefined) {
      body.sat = Math.max(0, Math.min(254, params.sat as number));
    }

    if (Object.keys(body).length === 0) {
      return {
        toolCallId: "",
        success: false,
        error: "No changes specified. Provide on, bri, hue, or sat.",
      };
    }

    const result = await hueApi("PUT", `/lights/${id}/state`, body);

    if (!result.ok) {
      return { toolCallId: "", success: false, error: result.error };
    }

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Light ${id} updated.`,
        changes: body,
      },
    };
  },
};

const hueSetAllTool: Tool = {
  name: "hue_set_all",
  description:
    "Set all Hue lights at once. Affects group 0 (all lights). Accepts on/off, brightness, hue, saturation.",
  category: "smart_home",
  parameters: [
    {
      name: "on",
      type: "boolean",
      description: "Turn all on (true) or off (false)",
      required: false,
    },
    {
      name: "bri",
      type: "number",
      description: "Brightness 1-254 (or percent 1-100)",
      required: false,
    },
    {
      name: "hue",
      type: "number",
      description: "Hue color 0-65535",
      required: false,
    },
    {
      name: "sat",
      type: "number",
      description: "Saturation 0-254",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const body: Record<string, unknown> = {};

    if (params.on !== undefined) body.on = params.on as boolean;

    if (params.bri !== undefined) {
      let bri = params.bri as number;
      if (bri >= 1 && bri <= 100) bri = percentToBri(bri);
      body.bri = Math.max(1, Math.min(254, bri));
    }

    if (params.hue !== undefined) {
      body.hue = Math.max(0, Math.min(65535, params.hue as number));
    }

    if (params.sat !== undefined) {
      body.sat = Math.max(0, Math.min(254, params.sat as number));
    }

    if (Object.keys(body).length === 0) {
      return {
        toolCallId: "",
        success: false,
        error: "No changes specified. Provide on, bri, hue, or sat.",
      };
    }

    // Group 0 = all lights in the Hue ecosystem
    const result = await hueApi("PUT", "/groups/0/action", body);

    if (!result.ok) {
      return { toolCallId: "", success: false, error: result.error };
    }

    return {
      toolCallId: "",
      success: true,
      data: {
        message: "All lights updated.",
        changes: body,
      },
    };
  },
};

const hueSetColorHexTool: Tool = {
  name: "hue_set_color_hex",
  description:
    'Set a light color by hex code (e.g., "#00d4ff" for cyan, "#ff0000" for red). Converts hex to Hue color space automatically.',
  category: "smart_home",
  parameters: [
    {
      name: "id",
      type: "string",
      description: 'Light ID, or "all" to set all lights',
      required: true,
    },
    {
      name: "hex",
      type: "string",
      description: "Hex color code (e.g., #00d4ff)",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const id = params.id as string;
    const hex = params.hex as string;

    const color = hexToHueSat(hex);
    if (!color) {
      return {
        toolCallId: "",
        success: false,
        error: `Invalid hex color: "${hex}". Use format #RRGGBB.`,
      };
    }

    const body = { on: true, hue: color.hue, sat: color.sat };

    // "all" uses group 0, otherwise individual light
    const endpoint =
      id.toLowerCase() === "all"
        ? "/groups/0/action"
        : `/lights/${id}/state`;

    const result = await hueApi("PUT", endpoint, body);

    if (!result.ok) {
      return { toolCallId: "", success: false, error: result.error };
    }

    return {
      toolCallId: "",
      success: true,
      data: {
        message:
          id.toLowerCase() === "all"
            ? `All lights set to ${hex}.`
            : `Light ${id} set to ${hex}.`,
        hex,
        hueValues: color,
      },
    };
  },
};

const hueSetSceneTool: Tool = {
  name: "hue_set_scene",
  description:
    "Activate a Hue scene by name. Searches bridge for matching scenes. Also supports built-in presets: focus, relax, movie, party, sleep, bright, JARVIS.",
  category: "smart_home",
  parameters: [
    {
      name: "name",
      type: "string",
      description:
        "Scene name (e.g., 'Concentrate', 'Relax', 'focus', 'movie', 'JARVIS')",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const name = (params.name as string).toLowerCase();

    // Built-in presets (fallback if no bridge scene matches)
    const presets: Record<string, { hue: number; sat: number; bri: number }> = {
      focus: { hue: 43690, sat: 254, bri: 178 }, // Blue
      relax: { hue: 8597, sat: 140, bri: 102 }, // Warm orange
      movie: { hue: 47125, sat: 254, bri: 38 }, // Deep blue, very dim
      party: { hue: 56100, sat: 254, bri: 203 }, // Magenta
      sleep: { hue: 5000, sat: 200, bri: 13 }, // Dim warm red
      bright: { hue: 0, sat: 0, bri: 254 }, // Full white
      JARVIS: { hue: 43690, sat: 254, bri: 178 }, // Signature JARVIS blue
    };

    // Try bridge scenes first
    const scenesResult = await hueApi("GET", "/scenes");
    if (scenesResult.ok) {
      const scenes = scenesResult.data as Record<
        string,
        { name: string; lights: string[] }
      >;

      // Find best matching scene
      const match = Object.entries(scenes).find(([, scene]) =>
        scene.name.toLowerCase().includes(name)
      );

      if (match) {
        const [sceneId, scene] = match;
        const result = await hueApi("PUT", "/groups/0/action", {
          scene: sceneId,
        });

        if (result.ok) {
          return {
            toolCallId: "",
            success: true,
            data: {
              message: `Scene "${scene.name}" activated.`,
              source: "bridge",
              sceneId,
            },
          };
        }
      }
    }

    // Fall back to built-in presets
    const preset = presets[name];
    if (!preset) {
      return {
        toolCallId: "",
        success: false,
        error: `Scene "${params.name}" not found. Available presets: ${Object.keys(presets).join(", ")}`,
      };
    }

    const result = await hueApi("PUT", "/groups/0/action", {
      on: true,
      ...preset,
    });

    if (!result.ok) {
      return { toolCallId: "", success: false, error: result.error };
    }

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Preset "${name}" activated.`,
        source: "preset",
        values: preset,
      },
    };
  },
};

const hueGetBridgeStatusTool: Tool = {
  name: "hue_get_bridge_status",
  description:
    "Check Hue bridge connection status. If not paired, attempts auto-discovery and pairing (Danny must press bridge button first).",
  category: "smart_home",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    // Check if already paired
    const creds = await loadCredentials();

    if (creds) {
      // Verify bridge is reachable
      const result = await hueApi("GET", "/config");

      if (result.ok) {
        const cfg = result.data as {
          name: string;
          swversion: string;
          bridgeid: string;
          modelid: string;
        };
        return {
          toolCallId: "",
          success: true,
          data: {
            message: `Bridge connected: ${cfg.name} (${cfg.modelid})`,
            status: "connected",
            bridge: {
              ip: creds.bridgeIp,
              name: cfg.name,
              model: cfg.modelid,
              firmware: cfg.swversion,
              id: cfg.bridgeid,
            },
            pairedAt: creds.pairedAt,
          },
        };
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          message:
            "Bridge paired but unreachable. Check if it is powered on and on the same network.",
          status: "offline",
          bridgeIp: creds.bridgeIp,
        },
      };
    }

    // Not paired — attempt discovery + pairing
    const bridgeIp = await discoverBridge();

    if (!bridgeIp) {
      return {
        toolCallId: "",
        success: false,
        error:
          "No Hue bridge found on the network. Make sure it is plugged in and connected to the same network. You can also set HUE_BRIDGE_IP in .env manually.",
      };
    }

    // Attempt pairing — user must have pressed the bridge button within 30s
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(`http://${bridgeIp}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devicetype: DEVICE_TYPE }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = (await response.json()) as Array<{
        success?: { username: string };
        error?: { type: number; description: string };
      }>;

      if (data[0]?.success) {
        const newCreds: HueCredentials = {
          bridgeIp,
          username: data[0].success.username,
          pairedAt: new Date().toISOString(),
        };
        await saveCredentials(newCreds);

        return {
          toolCallId: "",
          success: true,
          data: {
            message: `Bridge paired successfully at ${bridgeIp}. JARVIS now controls your lights, sir.`,
            status: "paired",
            bridgeIp,
          },
        };
      }

      // Error type 101 = link button not pressed
      if (data[0]?.error?.type === 101) {
        return {
          toolCallId: "",
          success: false,
          error: `Bridge found at ${bridgeIp}. Press the physical button on the bridge, then try again within 30 seconds.`,
        };
      }

      return {
        toolCallId: "",
        success: false,
        error: `Pairing failed: ${data[0]?.error?.description || "Unknown error"}`,
      };
    } catch (err) {
      return {
        toolCallId: "",
        success: false,
        error: `Could not reach bridge at ${bridgeIp}: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  },
};

// ─── Registration ────────────────────────────────────────────

export function registerHueTools(): void {
  toolRegistry.register(hueGetLightsTool);
  toolRegistry.register(hueSetLightTool);
  toolRegistry.register(hueSetAllTool);
  toolRegistry.register(hueSetColorHexTool);
  toolRegistry.register(hueSetSceneTool);
  toolRegistry.register(hueGetBridgeStatusTool);
}
