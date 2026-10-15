import type { AgentAdapter, AgentDeps, AgentStatus, DispatchResult } from "./types.js";

const DEFAULT_MODEL = "grok-4";
const DEFAULT_BASE = "https://api.x.ai/v1/chat/completions";

export function createXaiAdapter(deps: AgentDeps): AgentAdapter {
  return {
    id: "xai-grok",
    kind: "xai-grok",
    async list(): Promise<AgentStatus[]> {
      const key = deps.env.XAI_API_KEY?.trim();
      if (!key) {
        return [row("offline", "XAI_API_KEY is not set.", false)];
      }
      const model = deps.env.XAI_MODEL?.trim() || DEFAULT_MODEL;
      return [row("online", `credential present · ${model}`, true)];
    },
    async dispatch(_id, request): Promise<DispatchResult> {
      const key = deps.env.XAI_API_KEY?.trim();
      if (!key) return { ok: false, state: "offline", summary: "XAI_API_KEY is not set." };
      const model = deps.env.XAI_MODEL?.trim() || DEFAULT_MODEL;
      const url = deps.env.XAI_BASE_URL?.trim() || DEFAULT_BASE;
      try {
        const response = await deps.fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            messages: [
              {
                role: "system",
                content: "You are a Grok agent assisting Danny. Be concise and concrete. Do not invent tools.",
              },
              { role: "user", content: request.task },
            ],
          }),
          signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
        });
        const text = await response.text();
        if (!response.ok) {
          return {
            ok: false,
            state: response.status === 401 ? "offline" : "degraded",
            summary: `xAI Grok HTTP ${response.status}`,
            output: text.slice(0, 1500),
          };
        }
        let summary = text.slice(0, 500);
        try {
          const parsed = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
          const content = parsed.choices?.[0]?.message?.content;
          if (content) summary = content.slice(0, 500);
        } catch {
          /* keep raw slice */
        }
        return { ok: true, state: "online", summary, output: text.slice(0, 8000) };
      } catch (err) {
        return { ok: false, state: "offline", summary: `xAI Grok request failed: ${(err as Error).message}` };
      }
    },
  };
}

function row(state: AgentStatus["state"], detail: string, canDispatch: boolean): AgentStatus {
  return {
    id: "xai-grok",
    name: "xAI Grok",
    kind: "xai-grok",
    state,
    detail,
    render: "row",
    canDispatch,
  };
}
