export type AgentKind = "grok-bot" | "codex" | "claude-code" | "xai-grok";
export type AgentState = "online" | "offline" | "degraded";

export interface AgentStatus {
  id: string;
  name: string;
  kind: AgentKind;
  state: AgentState;
  detail: string;
  render: "dot" | "row";
  canDispatch: boolean;
}

export interface DispatchResponse {
  ok: boolean;
  state?: AgentState;
  summary?: string;
  output?: string;
  error?: string;
}

export async function fetchAgentStatuses(): Promise<AgentStatus[]> {
  const res = await fetch("/api/agents", { cache: "no-store" });
  if (!res.ok) throw new Error("agent panel unavailable");
  const data = await res.json();
  return Array.isArray(data.agents) ? data.agents : [];
}

export async function dispatchAgentTask(agentId: string, task: string): Promise<DispatchResponse> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, task }),
  });
  const data = (await res.json().catch(() => ({}))) as DispatchResponse;
  if (!res.ok && !data.summary) {
    return { ok: false, summary: data.error || `dispatch failed (${res.status})` };
  }
  return data;
}
