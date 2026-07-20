// App-control tools — FRIDAY commands the local app fleet (added 2026-06-12)
//
// Three live apps, three base URLs (override via env, defaults = localhost):
//   Agent OS cockpit   AGENT_OS_URL        :7777  — fleet status / launch / stop / logs
//   Battle Station     BATTLE_STATION_URL  :9999  — market dashboard snapshot
//   Osiris intel map   OSIRIS_URL          :4000  — global news + country risk
//
// Every call uses an 8s abort timeout. When an app is unreachable the error
// string tells FRIDAY which app is down and how to bring it back via the
// cockpit, so she can self-heal the fleet instead of just apologizing.
//
// Also home to switch_voice (2026-07-09) — toggles the spoken-voice persona
// between JARVIS and FRIDAY via services/voice-registry.ts.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { setActivePersona, getActiveVoice } from "../services/voice-registry.js";

// ─── Base URLs (read at call time so env changes apply without restart) ──
const agentOsUrl = () => (process.env.AGENT_OS_URL || "http://127.0.0.1:7777").replace(/\/+$/, "");
const battleStationUrl = () => (process.env.BATTLE_STATION_URL || "http://127.0.0.1:9999").replace(/\/+$/, "");
const osirisUrl = () => (process.env.OSIRIS_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");

const FETCH_TIMEOUT_MS = 8000;

// ─── Helpers ────────────────────────────────────────────────────

async function fetchJson(
  url: string,
  options: { method?: string; headers?: Record<string, string> } = {}
): Promise<unknown> {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: options.headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function agentOsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.AGENT_OS_TOKEN) {
    headers["x-agent-os-token"] = process.env.AGENT_OS_TOKEN;
  }
  return headers;
}

// Graceful offline message — tells FRIDAY what is down and how to recover.
function offline(app: string, url: string, hint: string): ToolResult {
  return {
    toolCallId: "",
    success: false,
    error: `${app} offline at ${url} — ${hint}`,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// Compact one-liner for a market item with unknown exact shape.
function fmtMarketItem(item: unknown): string {
  if (!isRecord(item)) return String(item).slice(0, 60);
  const name = item.symbol ?? item.ticker ?? item.name ?? item.title ?? item.question ?? "?";
  const price = item.price ?? item.last ?? item.value;
  const change = item.change24h ?? item.changePercent ?? item.change ?? item.pct ?? item.move;
  const parts = [String(name)];
  if (price !== undefined) parts.push(String(price));
  if (change !== undefined) parts.push(`${change}%`.replace("%%", "%"));
  return parts.join(" ").slice(0, 60);
}

// ─── Tools ──────────────────────────────────────────────────────

const fleetStatusTool: Tool = {
  name: "fleet_status",
  description:
    "Get the live status of every agent/app in Danny's fleet from the Agent OS cockpit. " +
    "Use when Danny asks 'what's running', 'is X up', 'fleet status', or before " +
    "launching/stopping anything. Returns name, state, and port per agent.",
  category: "fleet",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const data = await fetchJson(`${agentOsUrl()}/api/agents`, { headers: agentOsHeaders() });
      const agents = isRecord(data) ? asArray(data.agents) : asArray(data);
      const lines = agents.map((a) => {
        if (!isRecord(a)) return String(a).slice(0, 60);
        const status = isRecord(a.status) ? a.status : {};
        const health = isRecord(a.health) ? a.health : {};
        const port = status.port ?? health.port;
        const state = status.state ?? "unknown";
        return `${a.id ?? a.name}: ${state}${port ? ` (:${port})` : ""}`;
      });
      return {
        toolCallId: "",
        success: true,
        data: {
          message: `${lines.length} agents in fleet`,
          agents: lines,
        },
      };
    } catch {
      return offline(
        "agent-os cockpit",
        agentOsUrl(),
        "the cockpit itself is down; it must be started manually (agent-os START.bat), not via fleet_launch"
      );
    }
  },
};

const fleetLaunchTool: Tool = {
  name: "fleet_launch",
  description:
    "Launch an agent/app in the fleet via the Agent OS cockpit. Use when Danny says " +
    "'start X', 'launch X', 'bring X online', or when another tool reports an app " +
    "offline. Get valid ids from fleet_status first if unsure.",
  category: "fleet",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "Agent id from fleet_status (e.g. 'battle-station', 'osiris').",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const id = String(params.id ?? "").trim();
    if (!id) {
      return { toolCallId: "", success: false, error: "id is required" };
    }
    try {
      const data = await fetchJson(`${agentOsUrl()}/api/launch/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: agentOsHeaders(),
      });
      return {
        toolCallId: "",
        success: true,
        data: { message: `Launch requested for '${id}'`, response: data },
      };
    } catch (err) {
      return offline(
        "agent-os cockpit",
        agentOsUrl(),
        `could not launch '${id}': ${(err as Error).message}. If the cockpit is down, start it manually (agent-os START.bat)`
      );
    }
  },
};

const fleetStopTool: Tool = {
  name: "fleet_stop",
  description:
    "Stop a running agent/app in the fleet via the Agent OS cockpit. Use when Danny " +
    "says 'stop X', 'kill X', or 'shut X down'. Get valid ids from fleet_status first " +
    "if unsure. Do not stop 'friday' — that is this orchestrator itself.",
  category: "fleet",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "Agent id from fleet_status (e.g. 'battle-station', 'osiris').",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const id = String(params.id ?? "").trim();
    if (!id) {
      return { toolCallId: "", success: false, error: "id is required" };
    }
    try {
      const data = await fetchJson(`${agentOsUrl()}/api/stop/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: agentOsHeaders(),
      });
      return {
        toolCallId: "",
        success: true,
        data: { message: `Stop requested for '${id}'`, response: data },
      };
    } catch (err) {
      return offline(
        "agent-os cockpit",
        agentOsUrl(),
        `could not stop '${id}': ${(err as Error).message}. If the cockpit is down, start it manually (agent-os START.bat)`
      );
    }
  },
};

const fleetLogsTool: Tool = {
  name: "fleet_logs",
  description:
    "Read the recent log output (last ~40 lines) of a fleet agent via the Agent OS " +
    "cockpit. Use to diagnose why an agent crashed, errored, or is misbehaving " +
    "before relaunching it.",
  category: "fleet",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "Agent id from fleet_status.",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const id = String(params.id ?? "").trim();
    if (!id) {
      return { toolCallId: "", success: false, error: "id is required" };
    }
    try {
      const data = await fetchJson(`${agentOsUrl()}/api/logs/${encodeURIComponent(id)}`, {
        headers: agentOsHeaders(),
      });
      // Logs may arrive as raw text, { logs: "..." }, or { lines: [...] }.
      let lines: string[];
      if (typeof data === "string") {
        lines = data.split("\n");
      } else if (isRecord(data) && Array.isArray(data.lines)) {
        lines = data.lines.map(String);
      } else if (isRecord(data) && typeof data.logs === "string") {
        lines = data.logs.split("\n");
      } else {
        lines = JSON.stringify(data, null, 0).split("\n");
      }
      const tail = lines.filter((l) => l.trim()).slice(-40);
      return {
        toolCallId: "",
        success: true,
        data: { message: `Last ${tail.length} log lines for '${id}'`, lines: tail },
      };
    } catch (err) {
      return offline(
        "agent-os cockpit",
        agentOsUrl(),
        `could not read logs for '${id}': ${(err as Error).message}`
      );
    }
  },
};

const marketSnapshotTool: Tool = {
  name: "market_snapshot",
  description:
    "Get a compact market snapshot from the Battle Station dashboard: crypto watchlist " +
    "moves, top stock gainers/losers, active price spikes, and top Polymarket radar " +
    "hits. Use when Danny asks 'how are the markets', 'what's moving', 'crypto check', " +
    "or for the morning briefing. Summarize in a sentence or two; don't read every line.",
  category: "intel",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const data = await fetchJson(`${battleStationUrl()}/api/dashboard`);
      if (!isRecord(data)) {
        return { toolCallId: "", success: false, error: "battle-station returned an unexpected payload" };
      }

      // Shape is owned by battle-station and may evolve — parse defensively
      // and cap every section hard (this feeds straight into LLM context).
      const sections: string[] = [];

      const cryptoRaw = data.crypto ?? data.watchlist;
      const crypto = Array.isArray(cryptoRaw)
        ? cryptoRaw
        : isRecord(cryptoRaw)
          ? asArray(cryptoRaw.watchlist)
          : [];
      if (crypto.length > 0) {
        sections.push(`CRYPTO: ${crypto.slice(0, 6).map(fmtMarketItem).join(" | ")}`);
      }

      const stocks = isRecord(data.stocks) ? data.stocks : {};
      const gainers = asArray(stocks.gainers ?? data.gainers);
      const losers = asArray(stocks.losers ?? data.losers);
      if (gainers.length > 0) {
        sections.push(`TOP GAINERS: ${gainers.slice(0, 5).map(fmtMarketItem).join(" | ")}`);
      }
      if (losers.length > 0) {
        sections.push(`TOP LOSERS: ${losers.slice(0, 5).map(fmtMarketItem).join(" | ")}`);
      }

      const spikes = asArray(data.spikes ?? data.activeSpikes);
      if (spikes.length > 0) {
        sections.push(`ACTIVE SPIKES: ${spikes.slice(0, 5).map(fmtMarketItem).join(" | ")}`);
      }

      const polymarketRaw = data.polymarket ?? data.radar;
      const polymarket = Array.isArray(polymarketRaw)
        ? polymarketRaw
        : isRecord(polymarketRaw)
          ? asArray(polymarketRaw.radar)
          : [];
      if (polymarket.length > 0) {
        sections.push(`POLYMARKET RADAR: ${polymarket.slice(0, 4).map(fmtMarketItem).join(" | ")}`);
      }

      const summary = sections.length > 0
        ? sections.join("\n").slice(0, 1500)
        : `Dashboard online but no recognized sections. Keys: ${Object.keys(data).slice(0, 10).join(", ")}`;

      return {
        toolCallId: "",
        success: true,
        data: { message: summary },
      };
    } catch {
      return offline(
        "battle-station",
        battleStationUrl(),
        "launch it via fleet_launch('battle-station')"
      );
    }
  },
};

const intelNewsTool: Tool = {
  name: "intel_news",
  description:
    "Get current global news headlines with risk scores from the Osiris intel map. " +
    "Use when Danny asks 'what's happening in the world', 'any big news', or for " +
    "geopolitical context in the morning briefing. Higher risk_score = more serious.",
  category: "intel",
  parameters: [
    {
      name: "limit",
      type: "number",
      description: "Max headlines to return. Default 10.",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const limit = Math.min(25, Math.max(1, Number(params.limit) || 10));
    try {
      const data = await fetchJson(`${osirisUrl()}/api/news?limit=${limit}`);
      const items = isRecord(data) ? asArray(data.news) : asArray(data);
      const headlines = items.slice(0, limit).map((n) => {
        if (!isRecord(n)) return String(n).slice(0, 120);
        return `[risk ${n.risk_score ?? "?"}] ${String(n.title ?? "").slice(0, 110)} — ${n.source ?? "?"}`;
      });
      return {
        toolCallId: "",
        success: true,
        data: { message: `${headlines.length} headlines`, headlines },
      };
    } catch {
      return offline("osiris intel map", osirisUrl(), "launch it via fleet_launch('osiris')");
    }
  },
};

const intelRiskTool: Tool = {
  name: "intel_risk",
  description:
    "Get the top elevated-risk countries from the Osiris intel map (score 0-100 with " +
    "risk level and driver tags). Use when Danny asks about geopolitical risk, a " +
    "specific region's stability, or travel/conflict risk.",
  category: "intel",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const data = await fetchJson(`${osirisUrl()}/api/country-risk`);
      const countries = isRecord(data) ? asArray(data.countries) : asArray(data);
      const top = countries
        .filter(isRecord)
        .filter((c) => String(c.risk_level ?? "").toUpperCase() !== "LOW")
        .slice(0, 12)
        .map((c) => `${c.code}: ${c.risk_score} ${c.risk_level} (${asArray(c.tags).slice(0, 3).join(", ")})`);
      return {
        toolCallId: "",
        success: true,
        data: { message: `${top.length} elevated-risk countries`, countries: top },
      };
    } catch {
      return offline("osiris intel map", osirisUrl(), "launch it via fleet_launch('osiris')");
    }
  },
};

const switchVoiceTool: Tool = {
  name: "switch_voice",
  description:
    "Switch the assistant's spoken voice persona. 'jarvis' = measured British butler AI " +
    "(male, calm, authoritative — the default). 'friday' = warm female voice. Use when " +
    "Danny says 'switch to the JARVIS voice', 'use the FRIDAY voice', 'change your voice', " +
    "or similar. Persists across restarts and takes effect on the next spoken reply.",
  category: "voice",
  parameters: [
    {
      name: "persona",
      type: "string",
      description: "Which voice persona to activate.",
      required: true,
      enum: ["jarvis", "friday"],
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const persona = String(params.persona ?? "").trim().toLowerCase();
    if (persona !== "jarvis" && persona !== "friday") {
      return {
        toolCallId: "",
        success: false,
        error: "persona must be 'jarvis' or 'friday'",
      };
    }
    const before = getActiveVoice();
    const active = setActivePersona(persona);
    const note =
      before.persona === active.persona
        ? ` (already active)`
        : "";
    return {
      toolCallId: "",
      success: true,
      data: { message: `Voice switched to ${active.displayName}.${note}` },
    };
  },
};

// ─── Registration ───────────────────────────────────────────────

export function registerAppControlTools(): void {
  toolRegistry.register(fleetStatusTool);
  toolRegistry.register(fleetLaunchTool);
  toolRegistry.register(fleetStopTool);
  toolRegistry.register(fleetLogsTool);
  toolRegistry.register(marketSnapshotTool);
  toolRegistry.register(intelNewsTool);
  toolRegistry.register(intelRiskTool);
  toolRegistry.register(switchVoiceTool);
}
