"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dispatchAgentTask,
  fetchAgentStatuses,
  type AgentStatus,
  type DispatchResponse,
} from "@/lib/agents";

export function useAgents(enabled = true) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTasks = useCallback(async () => {
    try {
      setAgents(await fetchAgentStatuses());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "agent panel unavailable");
    }
  }, []);

  const dispatchTask = useCallback(async (agentId: string, task: string): Promise<DispatchResponse> => {
    setLoading(true);
    try {
      return await dispatchAgentTask(agentId, task);
    } catch (err) {
      return { ok: false, summary: err instanceof Error ? err.message : "dispatch failed" };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refreshTasks();
    const interval = setInterval(refreshTasks, 15_000);
    return () => clearInterval(interval);
  }, [enabled, refreshTasks]);

  return { agents, loading, error, dispatchTask, refreshTasks };
}
