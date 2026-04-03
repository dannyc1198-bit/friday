// Agent Dispatch Tools — Lets JARVIS delegate tasks to specialist agents
// These tools are callable by the LLM during conversation, enabling
// JARVIS to route work to NEXUS, BUILDER, CREATOR, PULSE, or CLAWDY.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import {
  dispatchToAgent,
  getActiveTasks,
  checkTaskStatus,
  getAgents,
  classifyAgent,
} from "../services/agent-dispatch.js";
import { unifiedMemory } from "../services/unified-memory.js";
import { learningEngine } from "../services/learning-engine.js";

function makeResult(success: boolean, data?: unknown, error?: string): ToolResult {
  return { toolCallId: "", success, data, error };
}

// ─── Dispatch to Agent ──────────────────────────────────────────

const dispatchTool: Tool = {
  name: "dispatch_to_agent",
  description:
    "Dispatches a task to a specialist OpenClaw agent. Use this when a task matches an agent's specialty. Available agents: NEXUS (sales/outreach), BUILDER (code/deploy), CREATOR (content/social), PULSE (analytics/monitoring), CLAWDY (general ops).",
  category: "agents",
  parameters: [
    {
      name: "agent_id",
      type: "string",
      description: "Agent ID: nexus, builder, creator, pulse, or clawdy",
      required: true,
      enum: ["nexus", "builder", "creator", "pulse", "clawdy"],
    },
    {
      name: "task",
      type: "string",
      description: "Description of the task to dispatch",
      required: true,
    },
    {
      name: "context",
      type: "string",
      description: "Additional context for the agent (optional)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const agentId = params.agent_id as string;
    const task = params.task as string;
    const context = params.context as string | undefined;

    try {
      const result = await dispatchToAgent(agentId, task, context ? { notes: context } : undefined);

      if (result.status === "failed") {
        return makeResult(false, undefined, result.error || "Dispatch failed");
      }

      return makeResult(true, {
        taskId: result.id,
        agent: agentId.toUpperCase(),
        status: result.status,
        message: `Task dispatched to ${agentId.toUpperCase()}: ${task}`,
      });
    } catch (error) {
      return makeResult(false, undefined, `Dispatch failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

// ─── Check Agent Task Status ────────────────────────────────────

const checkAgentTaskTool: Tool = {
  name: "check_agent_task",
  description: "Checks the status of a previously dispatched agent task.",
  category: "agents",
  parameters: [
    {
      name: "task_id",
      type: "string",
      description: "The task ID returned from dispatch_to_agent",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const taskId = params.task_id as string;
    const task = await checkTaskStatus(taskId);

    if (!task) {
      return makeResult(false, undefined, `Task ${taskId} not found`);
    }

    return makeResult(true, {
      taskId: task.id,
      agent: task.agentId.toUpperCase(),
      status: task.status,
      description: task.description,
      result: task.result,
      error: task.error,
    });
  },
};

// ─── List Active Agent Tasks ────────────────────────────────────

const listAgentTasksTool: Tool = {
  name: "list_agent_tasks",
  description: "Lists all currently active agent tasks across all specialist agents.",
  category: "agents",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const tasks = getActiveTasks();

    return makeResult(true, {
      count: tasks.length,
      tasks: tasks.map(t => ({
        taskId: t.id,
        agent: t.agentId.toUpperCase(),
        description: t.description,
        status: t.status,
        dispatchedAt: t.dispatchedAt,
      })),
    });
  },
};

// ─── Search Unified Memory ──────────────────────────────────────

const searchMemoryTool: Tool = {
  name: "search_unified_memory",
  description:
    "Searches the unified memory across all systems (JARVIS, OpenClaw agents, learning engine). Use to recall past interactions, learned patterns, or stored facts.",
  category: "memory",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query",
      required: true,
    },
    {
      name: "limit",
      type: "number",
      description: "Max results (default 5)",
      required: false,
      default: 5,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const query = params.query as string;
    const limit = (params.limit as number) || 5;

    const results = unifiedMemory.search(query, limit);

    return makeResult(true, {
      count: results.length,
      memories: results.map(r => ({
        content: r.content,
        source: r.source,
        agent: r.agent,
        category: r.category,
        importance: r.importance,
        confidence: r.confidence,
        updatedAt: r.updatedAt,
      })),
    });
  },
};

// ─── Store to Unified Memory ────────────────────────────────────

const storeMemoryTool: Tool = {
  name: "store_unified_memory",
  description:
    "Stores a fact, insight, or observation in the unified memory. All agents can access this later.",
  category: "memory",
  parameters: [
    {
      name: "content",
      type: "string",
      description: "What to remember",
      required: true,
    },
    {
      name: "category",
      type: "string",
      description: "Memory category: fact, preference, outcome, pattern, insight, interaction",
      required: false,
      enum: ["fact", "preference", "outcome", "pattern", "insight", "interaction"],
      default: "fact",
    },
    {
      name: "importance",
      type: "string",
      description: "Importance level: low, medium, high, critical",
      required: false,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    {
      name: "tags",
      type: "string",
      description: "Comma-separated tags for categorization",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const content = params.content as string;
    const category = (params.category as string) || "fact";
    const importance = (params.importance as string) || "medium";
    const tags = params.tags ? (params.tags as string).split(",").map(t => t.trim()) : [];

    const id = unifiedMemory.store_entry({
      source: "jarvis",
      agent: "JARVIS",
      category: category as any,
      content,
      tags,
      importance: importance as any,
      confidence: 1.0,
    });

    return makeResult(true, {
      id,
      message: `Stored in unified memory: ${content.slice(0, 100)}`,
    });
  },
};

// ─── Get Learning Insights ──────────────────────────────────────

const getLearningInsightsTool: Tool = {
  name: "get_learning_insights",
  description:
    "Gets insights from the learning engine — patterns detected, proven strategies, success rates, and peak usage times.",
  category: "system",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const stats = learningEngine.getStats();
    const patterns = learningEngine.getPatterns().slice(0, 10);
    const strategies = learningEngine.getStrategies().slice(0, 5);

    return makeResult(true, {
      sessionStats: stats,
      topPatterns: patterns.map(p => ({
        pattern: p.pattern,
        category: p.category,
        frequency: p.frequency,
        confidence: p.confidence,
      })),
      topStrategies: strategies.map(s => ({
        domain: s.domain,
        strategy: s.strategy,
        successRate: s.successRate,
        timesUsed: s.timesUsed,
      })),
    });
  },
};

// ─── Scan Unfinished Projects ───────────────────────────────────

const scanProjectsTool: Tool = {
  name: "scan_unfinished_projects",
  description:
    "Scans for unfinished projects, stalled tasks, and incomplete work across the system. Use proactively to surface things Danny should finish.",
  category: "system",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    // Check task manager for incomplete tasks
    const tasksTool = toolRegistry.get("list_tasks");
    let pendingTasks: unknown[] = [];
    if (tasksTool) {
      const result = await tasksTool.execute({});
      if (result.success && result.data) {
        const data = result.data as { tasks?: Array<{ completed: boolean; text: string }> };
        pendingTasks = (data.tasks || []).filter(t => !t.completed);
      }
    }

    // Check unified memory for project-related entries
    const projectMemories = unifiedMemory.search("project incomplete unfinished stalled", 10);

    // Check learning engine for patterns about abandoned work
    const patterns = learningEngine.getPatterns()
      .filter(p => p.pattern.toLowerCase().includes("fail") || p.pattern.toLowerCase().includes("stall"));

    return makeResult(true, {
      pendingTasks: pendingTasks.length,
      tasks: pendingTasks,
      relatedMemories: projectMemories.map(m => ({
        content: m.content,
        source: m.source,
        importance: m.importance,
      })),
      warningPatterns: patterns.map(p => p.pattern),
      suggestion: pendingTasks.length > 0
        ? `Found ${pendingTasks.length} incomplete tasks. Want me to prioritize them?`
        : "No outstanding tasks found in the task manager.",
    });
  },
};

// ─── Registration ───────────────────────────────────────────────

export function registerAgentTools(): void {
  toolRegistry.register(dispatchTool);
  toolRegistry.register(checkAgentTaskTool);
  toolRegistry.register(listAgentTasksTool);
  toolRegistry.register(searchMemoryTool);
  toolRegistry.register(storeMemoryTool);
  toolRegistry.register(getLearningInsightsTool);
  toolRegistry.register(scanProjectsTool);
}
