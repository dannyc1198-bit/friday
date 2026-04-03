"use client";

import { useState, useEffect, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  specialty: string;
  autonomyLevel: string;
  capabilities: string[];
}

interface AgentTask {
  id: string;
  agentId: string;
  task: string;
  status: string;
  createdAt: string;
  completedAt?: string;
}

const ORCHESTRATOR_URL = "http://localhost:3001";

export function useAgents() {
  const [agents] = useState<Agent[]>([
    { id: "nexus", name: "NEXUS", specialty: "Sales & Outreach", autonomyLevel: "supervised", capabilities: ["cold outreach", "lead research", "follow-ups"] },
    { id: "builder", name: "BUILDER", specialty: "Technical Implementation", autonomyLevel: "supervised", capabilities: ["code generation", "deployment", "bug fixes"] },
    { id: "creator", name: "CREATOR", specialty: "Content & Creative", autonomyLevel: "supervised", capabilities: ["blog posts", "social media", "video scripts"] },
    { id: "pulse", name: "PULSE", specialty: "Analytics & Monitoring", autonomyLevel: "full", capabilities: ["revenue tracking", "analytics", "crypto portfolio"] },
    { id: "clawdy", name: "CLAWDY", specialty: "General Operations", autonomyLevel: "confirm-each", capabilities: ["phone calls", "scheduling", "email triage"] },
  ]);

  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const resp = await fetch(`${ORCHESTRATOR_URL}/api/agents/tasks`);
      if (resp.ok) {
        const data = await resp.json();
        setTasks(data.tasks || []);
      }
    } catch {
      // Orchestrator offline
    }
  }, []);

  const dispatchTask = useCallback(async (agentId: string, task: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`${ORCHESTRATOR_URL}/api/agents/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, task }),
      });
      if (resp.ok) {
        await fetchTasks();
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, [fetchTasks]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  return { agents, tasks, loading, dispatchTask, refreshTasks: fetchTasks };
}
