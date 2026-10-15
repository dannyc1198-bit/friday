import type { AgentAdapter, AgentDeps, AgentStatus, DispatchRequest, DispatchResult } from "./types.js";

export interface GrokBot {
  name: string;
  statusUrl?: string;
  dispatchUrl?: string;
}

function isHttp(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** GROK_BOTS=Name|statusUrl|dispatchUrl,Other|statusUrl */
export function parseGrokBots(raw: string | undefined): GrokBot[] {
  if (!raw?.trim()) return [];
  const bots: GrokBot[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [nameRaw, statusRaw, dispatchRaw] = trimmed.split("|").map((s) => s.trim());
    const name = nameRaw || "bot";
    bots.push({
      name,
      statusUrl: isHttp(statusRaw) ? statusRaw : undefined,
      dispatchUrl: isHttp(dispatchRaw) ? dispatchRaw : undefined,
    });
  }
  return bots;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bot";
}

async function probe(url: string, fetchImpl: typeof fetch, token: string | undefined): Promise<{ state: AgentStatus["state"]; detail: string }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(2500),
      redirect: "follow",
    });
    if (response.ok) return { state: "online", detail: `status ${response.status}` };
    return { state: "offline", detail: `status ${response.status}` };
  } catch (err) {
    return { state: "offline", detail: (err as Error).message || "unreachable" };
  }
}

export function createGrokBotAdapter(deps: AgentDeps): AgentAdapter {
  return {
    id: "grok-bot",
    kind: "grok-bot",
    async list(): Promise<AgentStatus[]> {
      const bots = parseGrokBots(deps.env.GROK_BOTS);
      if (bots.length === 0) {
        return [{
          id: "grok-bot",
          name: "Grok Bots",
          kind: "grok-bot",
          state: "offline",
          detail: "needs GROK_BOTS — Name|http://127.0.0.1:port/health|http://127.0.0.1:port/dispatch",
          render: "dot",
          canDispatch: false,
        }];
      }
      const token = deps.env.GROK_BOT_TOKEN?.trim();
      const statuses = await Promise.all(bots.map(async (bot): Promise<AgentStatus> => {
        const id = `grok-bot:${slug(bot.name)}`;
        if (!bot.statusUrl) {
          return {
            id,
            name: bot.name,
            kind: "grok-bot",
            state: "offline",
            detail: "No status URL. Use Name|http://127.0.0.1:port/health|http://127.0.0.1:port/dispatch",
            render: "dot",
            canDispatch: false,
          };
        }
        const probed = await probe(bot.statusUrl, deps.fetchImpl, token);
        return {
          id,
          name: bot.name,
          kind: "grok-bot",
          state: probed.state,
          detail: probed.detail,
          render: "dot",
          canDispatch: probed.state !== "offline" && Boolean(bot.dispatchUrl),
        };
      }));
      return statuses;
    },
    async dispatch(id, request): Promise<DispatchResult> {
      const bots = parseGrokBots(deps.env.GROK_BOTS);
      const bot = bots.find((b) => `grok-bot:${slug(b.name)}` === id);
      if (!bot) {
        return { ok: false, state: "offline", summary: `Unknown Grok bot ${id}` };
      }
      if (!bot.dispatchUrl) {
        return { ok: false, state: "offline", summary: `${bot.name} has no dispatch URL` };
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = deps.env.GROK_BOT_TOKEN?.trim();
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const response = await deps.fetchImpl(bot.dispatchUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ agent: bot.name, task: request.task }),
          signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
        });
        const text = await response.text();
        if (!response.ok) {
          return { ok: false, state: "degraded", summary: `${bot.name} dispatch HTTP ${response.status}`, output: text.slice(0, 2000) };
        }
        return { ok: true, state: "online", summary: `${bot.name} accepted the task`, output: text.slice(0, 4000) };
      } catch (err) {
        return { ok: false, state: "offline", summary: `${bot.name} dispatch failed: ${(err as Error).message}` };
      }
    },
  };
}

export function offlineDispatch(summary: string): DispatchResult {
  return { ok: false, state: "offline", summary };
}

export type { DispatchRequest };
