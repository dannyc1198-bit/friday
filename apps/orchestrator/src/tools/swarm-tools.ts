// ═══════════════════════════════════════════
// JARVIS — SWARM TOOLS
// Gives JARVIS the ability to spin up agent swarms.
// This is the Perplexity Computer killer feature —
// decompose any task and throw agents at it.
// ═══════════════════════════════════════════

import { toolRegistry } from "./registry.js";
import {
  spawnSwarm,
  autoDecompose,
  parallelResearch,
  codeReviewPipeline,
  type AgentType,
} from "../services/agent-swarm.js";

// ─── Auto-decompose and swarm ─────────────────────────────────

const autoSwarmTool = {
  name: "swarm_auto",
  description: "Automatically decompose a complex task into subtasks and spawn parallel agents to handle them. JARVIS figures out how to split the work. Use for any task that benefits from parallel execution: research, analysis, code generation, content creation.",
  category: "swarm",
  parameters: [
    {
      name: "objective",
      type: "string" as const,
      description: "The high-level objective to decompose and execute. Be specific about what you want.",
      required: true,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const objective = params.objective as string;
    try {
      const result = await autoDecompose(objective);
      return {
        toolCallId: "",
        success: true,
        data: {
          summary: result.summary,
          totalAgents: result.totalAgents,
          completed: result.completed,
          failed: result.failed,
          durationSeconds: (result.durationMs / 1000).toFixed(1),
          results: result.results.map(r => ({
            objective: r.objective,
            result: r.result?.slice(0, 300),
            error: r.error,
          })),
        },
      };
    } catch (err) {
      return {
        toolCallId: "",
        success: false,
        error: err instanceof Error ? err.message : "Swarm failed",
      };
    }
  },
};

// ─── Manual swarm with explicit agents ────────────────────────

const spawnSwarmTool = {
  name: "swarm_spawn",
  description: "Spawn a custom swarm of agents with explicit subtasks. Use when you know exactly how to split the work. Each agent gets a type (worker/scout/reviewer/builder), an objective, and optional dependencies on other agents.",
  category: "swarm",
  parameters: [
    {
      name: "objective",
      type: "string" as const,
      description: "Overall swarm objective",
      required: true,
    },
    {
      name: "agents",
      type: "string" as const,
      description: 'JSON array of agent specs. Each object: { "type": "worker"|"scout"|"reviewer"|"builder", "objective": "task description", "id": "optional-id", "dependsOn": ["other-id"] }',
      required: true,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const objective = params.objective as string;
    let agents: { type: AgentType; objective: string; id?: string; dependsOn?: string[] }[];
    try {
      const raw = params.agents;
      agents = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    } catch {
      return { toolCallId: "", success: false, error: "Invalid agents JSON. Provide a JSON array of { type, objective, id?, dependsOn? }" };
    }

    try {
      const result = await spawnSwarm(objective, agents);
      return {
        toolCallId: "",
        success: true,
        data: {
          summary: result.summary,
          totalAgents: result.totalAgents,
          completed: result.completed,
          failed: result.failed,
          durationSeconds: (result.durationMs / 1000).toFixed(1),
          results: result.results.map(r => ({
            objective: r.objective,
            result: r.result?.slice(0, 300),
            error: r.error,
          })),
        },
      };
    } catch (err) {
      return {
        toolCallId: "",
        success: false,
        error: err instanceof Error ? err.message : "Swarm failed",
      };
    }
  },
};

// ─── Parallel research shortcut ───────────────────────────────

const parallelResearchTool = {
  name: "swarm_research",
  description: "Spawn multiple scout agents to research different angles of a topic in parallel. Great for competitive analysis, market research, or gathering information from multiple perspectives.",
  category: "swarm",
  parameters: [
    {
      name: "topic",
      type: "string" as const,
      description: "The main topic to research",
      required: true,
    },
    {
      name: "angles",
      type: "string" as const,
      description: "Comma-separated list of specific angles/aspects to research",
      required: true,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const topic = params.topic as string;
    const angles = (params.angles as string).split(",").map(a => a.trim()).filter(Boolean);

    if (angles.length === 0) {
      return { toolCallId: "", success: false, error: "Provide at least one research angle" };
    }

    try {
      const result = await parallelResearch(topic, angles);
      return {
        toolCallId: "",
        success: true,
        data: {
          summary: result.summary,
          agentsUsed: result.totalAgents,
          completed: result.completed,
          durationSeconds: (result.durationMs / 1000).toFixed(1),
        },
      };
    } catch (err) {
      return { toolCallId: "", success: false, error: err instanceof Error ? err.message : "Research failed" };
    }
  },
};

// ─── Code review pipeline shortcut ────────────────────────────

const codeReviewTool = {
  name: "swarm_code_review",
  description: "Write code with a builder agent, then automatically review it with a reviewer agent. The reviewer sees the original task and the generated code, checking for bugs, security issues, and quality.",
  category: "swarm",
  parameters: [
    {
      name: "task",
      type: "string" as const,
      description: "What code to write (e.g., 'Create a React login form with email validation')",
      required: true,
    },
    {
      name: "context",
      type: "string" as const,
      description: "Additional context like existing code, tech stack, or constraints",
      required: false,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const task = params.task as string;
    const context = params.context as string | undefined;

    try {
      const result = await codeReviewPipeline(task, context);
      const buildResult = result.results.find(r => r.agentId === "build");
      const reviewResult = result.results.find(r => r.agentId === "review");

      return {
        toolCallId: "",
        success: true,
        data: {
          code: buildResult?.result || "No code generated",
          review: reviewResult?.result || "No review available",
          summary: result.summary,
          durationSeconds: (result.durationMs / 1000).toFixed(1),
        },
      };
    } catch (err) {
      return { toolCallId: "", success: false, error: err instanceof Error ? err.message : "Pipeline failed" };
    }
  },
};

// ─── Register ─────────────────────────────────────────────────

export function registerSwarmTools(): void {
  toolRegistry.register(autoSwarmTool);
  toolRegistry.register(spawnSwarmTool);
  toolRegistry.register(parallelResearchTool);
  toolRegistry.register(codeReviewTool);
  console.log("[TOOLS] Registered 4 swarm tools (multi-agent orchestration)");
}
