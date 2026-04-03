// Agent Dispatch Router — Routes tasks to specialist OpenClaw agents
//
// JARVIS is the commander. OpenClaw agents are the specialists.
// When JARVIS detects a task that needs a specialist, it dispatches
// to the right agent and monitors progress.
//
// Agent roster:
//   NEXUS   → Sales, outreach, lead generation, client management
//   BUILDER → Code generation, deployments, technical implementation
//   CREATOR → Content creation, copywriting, social media, video
//   PULSE   → Analytics, monitoring, data tracking, reporting
//   CLAWDY  → General assistant, phone handling, customer service
//
// Dispatch flow:
//   User message → JARVIS intent classification → Agent routing
//   → OpenClaw API call → Status monitoring → Result relay to user

import { callOpenClaw, isOpenClawAvailable } from "./openclaw-bridge.js";
import { unifiedMemory } from "./unified-memory.js";

// ─── Agent Definitions ──────────────────────────────────────────

export interface AgentProfile {
  id: string;
  name: string;
  specialty: string;
  capabilities: string[];
  triggerKeywords: string[];
  autonomyLevel: "full" | "supervised" | "confirm-each";  // How much freedom
  maxConcurrentTasks: number;
}

const AGENTS: AgentProfile[] = [
  {
    id: "nexus",
    name: "NEXUS",
    specialty: "Sales & Outreach",
    capabilities: [
      "cold outreach emails",
      "lead research",
      "follow-up sequences",
      "CRM updates",
      "proposal drafting",
      "client relationship tracking",
    ],
    triggerKeywords: [
      "outreach", "sales", "lead", "client", "prospect", "proposal",
      "follow up", "follow-up", "pitch", "deal", "pipeline", "revenue",
      "customer", "cold email", "warm lead", "close", "chadwick",
      "plumber", "plumbing", "trades", "contractor",
    ],
    autonomyLevel: "supervised",  // Can draft, but JARVIS confirms before sending
    maxConcurrentTasks: 3,
  },
  {
    id: "builder",
    name: "BUILDER",
    specialty: "Technical Implementation",
    capabilities: [
      "code generation",
      "deployment automation",
      "bug fixes",
      "API integration",
      "database operations",
      "infrastructure setup",
    ],
    triggerKeywords: [
      "build", "code", "deploy", "fix bug", "implement", "api",
      "database", "server", "frontend", "backend", "feature",
      "refactor", "test", "debug", "push", "pull request",
    ],
    autonomyLevel: "supervised",
    maxConcurrentTasks: 2,
  },
  {
    id: "creator",
    name: "CREATOR",
    specialty: "Content & Creative",
    capabilities: [
      "blog posts",
      "social media content",
      "video scripts",
      "ad copy",
      "brand messaging",
      "thumbnail design prompts",
      "YouTube descriptions",
    ],
    triggerKeywords: [
      "content", "post", "write", "blog", "social media", "linkedin",
      "youtube", "video", "script", "copy", "ad", "creative",
      "thumbnail", "caption", "hook", "headline", "brand",
    ],
    autonomyLevel: "supervised",
    maxConcurrentTasks: 3,
  },
  {
    id: "pulse",
    name: "PULSE",
    specialty: "Analytics & Monitoring",
    capabilities: [
      "revenue tracking",
      "website analytics",
      "social media metrics",
      "crypto portfolio tracking",
      "health metrics",
      "goal progress reports",
    ],
    triggerKeywords: [
      "analytics", "metrics", "stats", "report", "dashboard",
      "revenue", "profit", "track", "monitor", "performance",
      "crypto", "xrp", "xlm", "hbar", "portfolio", "growth",
    ],
    autonomyLevel: "full",  // Read-only operations, safe to auto-run
    maxConcurrentTasks: 5,
  },
  {
    id: "clawdy",
    name: "CLAWDY",
    specialty: "General Operations",
    capabilities: [
      "phone call handling",
      "scheduling",
      "email triage",
      "reminders",
      "general research",
      "customer service",
    ],
    triggerKeywords: [
      "call", "phone", "schedule", "appointment", "booking",
      "email", "inbox", "remind", "research", "look up",
    ],
    autonomyLevel: "confirm-each",  // Always confirm before acting
    maxConcurrentTasks: 2,
  },
];

// ─── Active Tasks ───────────────────────────────────────────────

interface DispatchedTask {
  id: string;
  agentId: string;
  description: string;
  status: "dispatched" | "running" | "completed" | "failed";
  dispatchedAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

const activeTasks = new Map<string, DispatchedTask>();

// ─── Dispatch Logic ─────────────────────────────────────────────

/** Classify which agent should handle a message */
export function classifyAgent(message: string): AgentProfile | null {
  const lower = message.toLowerCase();
  let bestAgent: AgentProfile | null = null;
  let bestScore = 0;

  for (const agent of AGENTS) {
    let score = 0;
    for (const keyword of agent.triggerKeywords) {
      if (lower.includes(keyword)) {
        score += keyword.split(" ").length; // Multi-word keywords score higher
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  // Minimum threshold — don't dispatch for vague matches
  return bestScore >= 2 ? bestAgent : null;
}

/** Dispatch a task to a specialist agent via OpenClaw */
export async function dispatchToAgent(
  agentId: string,
  taskDescription: string,
  context?: Record<string, unknown>
): Promise<DispatchedTask> {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found`);
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const task: DispatchedTask = {
    id: taskId,
    agentId,
    description: taskDescription,
    status: "dispatched",
    dispatchedAt: new Date().toISOString(),
  };

  activeTasks.set(taskId, task);

  // Check if OpenClaw is available
  if (!(await isOpenClawAvailable())) {
    task.status = "failed";
    task.error = "OpenClaw is offline. Cannot dispatch to specialist agents.";
    return task;
  }

  try {
    // Dispatch via OpenClaw gateway
    const result = await callOpenClaw("agent_dispatch", {
      agentId,
      agentName: agent.name,
      task: taskDescription,
      context: {
        ...context,
        autonomyLevel: agent.autonomyLevel,
        dispatchedBy: "JARVIS",
      },
    });

    task.status = "running";
    task.result = result;

    // Log to unified memory
    unifiedMemory.store_entry({
      source: "agent",
      agent: agent.name,
      category: "interaction",
      content: `Dispatched task to ${agent.name}: ${taskDescription}`,
      tags: ["dispatch", agentId],
      importance: "medium",
      confidence: 1.0,
    });

    console.log(`[AgentDispatch] Task ${taskId} dispatched to ${agent.name}`);
    return task;
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : "Dispatch failed";
    return task;
  }
}

/** Check status of a dispatched task */
export async function checkTaskStatus(taskId: string): Promise<DispatchedTask | null> {
  const task = activeTasks.get(taskId);
  if (!task) return null;

  // If still running, poll OpenClaw for updates
  if (task.status === "running" && await isOpenClawAvailable()) {
    try {
      const status = await callOpenClaw("agent_task_status", { taskId });
      if (status && typeof status === "object") {
        const s = status as Record<string, unknown>;
        if (s.status === "completed") {
          task.status = "completed";
          task.completedAt = new Date().toISOString();
          task.result = s.result;
        } else if (s.status === "failed") {
          task.status = "failed";
          task.error = s.error as string;
        }
      }
    } catch {
      // OpenClaw unavailable, task status unknown
    }
  }

  return task;
}

/** Get all active (non-completed) tasks */
export function getActiveTasks(): DispatchedTask[] {
  return Array.from(activeTasks.values()).filter(
    t => t.status === "dispatched" || t.status === "running"
  );
}

/** Generate a dispatch summary for the LLM to understand available agents */
export function getAgentRosterPrompt(): string {
  const lines = AGENTS.map(a =>
    `- ${a.name} (${a.specialty}): ${a.capabilities.slice(0, 3).join(", ")}. Autonomy: ${a.autonomyLevel}`
  );

  const active = getActiveTasks();
  const activeLines = active.length > 0
    ? `\n\nACTIVE AGENT TASKS:\n${active.map(t => `- [${t.agentId.toUpperCase()}] ${t.description} (${t.status})`).join("\n")}`
    : "";

  return `\nAVAILABLE SPECIALIST AGENTS (dispatch via OpenClaw):\n${lines.join("\n")}${activeLines}`;
}

// ─── Exports ────────────────────────────────────────────────────

export function getAgents(): AgentProfile[] {
  return [...AGENTS];
}

export function getAgentById(id: string): AgentProfile | undefined {
  return AGENTS.find(a => a.id === id);
}
