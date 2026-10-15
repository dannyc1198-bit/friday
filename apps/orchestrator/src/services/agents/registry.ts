import { isUnapprovedExternalAction } from "../intent-router.js";
import { runCommand } from "./command.js";
import { createClaudeAdapter } from "./claude.js";
import { createCodexAdapter } from "./codex.js";
import { createGrokBotAdapter } from "./grok-bots.js";
import type { AgentDeps, AgentStatus, DispatchRequest, DispatchResult } from "./types.js";
import { createXaiAdapter } from "./xai.js";

function defaultDeps(overrides?: Partial<AgentDeps>): AgentDeps {
  return {
    env: overrides?.env ?? process.env,
    fetchImpl: overrides?.fetchImpl ?? fetch,
    run: overrides?.run ?? runCommand,
  };
}

export function createAgentService(overrides?: Partial<AgentDeps>) {
  const deps = defaultDeps(overrides);
  const adapters = [
    createGrokBotAdapter(deps),
    createCodexAdapter(deps),
    createClaudeAdapter(deps),
    createXaiAdapter(deps),
  ];

  return {
    async list(): Promise<AgentStatus[]> {
      const groups = await Promise.all(adapters.map(async (adapter) => {
        try {
          return await adapter.list();
        } catch (err) {
          return [{
            id: adapter.id,
            name: adapter.id,
            kind: adapter.kind,
            state: "offline" as const,
            detail: (err as Error).message || "status check failed",
            render: adapter.kind === "grok-bot" ? "dot" as const : "row" as const,
            canDispatch: false,
          }];
        }
      }));
      return groups.flat();
    },

    async dispatch(agentId: string, task: string, extra?: Omit<DispatchRequest, "task">): Promise<DispatchResult> {
      const trimmed = task.trim();
      if (!trimmed) return { ok: false, state: "offline", summary: "task is required" };
      if (isUnapprovedExternalAction(trimmed)) {
        return {
          ok: false,
          state: "offline",
          summary: "Draft only. I will not send that message, spend money, or trade live unless Danny approves that exact action.",
        };
      }
      const request: DispatchRequest = { task: trimmed, ...extra };
      const adapter = adapters.find((a) => agentId === a.id || agentId.startsWith(`${a.id}:`));
      if (!adapter) return { ok: false, state: "offline", summary: `Unknown agent ${agentId}` };
      try {
        return await adapter.dispatch(agentId, request);
      } catch (err) {
        return { ok: false, state: "offline", summary: (err as Error).message || "dispatch failed" };
      }
    },
  };
}

export const agentService = createAgentService();

export function dispatchAgent(
  agentId: string,
  task: string,
  extra?: Omit<DispatchRequest, "task">
): Promise<DispatchResult> {
  return agentService.dispatch(agentId, task, extra);
}
