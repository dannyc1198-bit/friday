// ═══════════════════════════════════════════
// JARVIS — DYNAMIC AGENT SWARM
//
// Spin up N ephemeral agents in parallel for complex tasks.
// Modeled after Perplexity Computer's multi-agent orchestration:
//   1. JARVIS decomposes a task into subtasks
//   2. Each subtask is assigned to a worker agent
//   3. Workers run in parallel with dependency management
//   4. Results are collected and unified
//   5. Failed agents get retried or reassigned
//
// Agent types:
//   - Worker:   General task execution (research, analysis, writing)
//   - Reviewer: Code review (Claude Code ↔ Codex cross-check)
//   - Scout:    Web research agents that search in parallel
//   - Builder:  Code generation for different modules simultaneously
//
// This replaces the need for Perplexity Computer's $200/mo plan.
// ═══════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import { unifiedMemory } from "./unified-memory.js";

// ─── Types ────────────────────────────────────────────────────

export type AgentType = "worker" | "reviewer" | "scout" | "builder";
export type AgentStatus = "pending" | "running" | "completed" | "failed" | "retrying";

export interface SwarmAgent {
  id: string;
  type: AgentType;
  objective: string;
  systemPrompt: string;
  status: AgentStatus;
  result: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  retries: number;
  dependsOn: string[];  // IDs of agents that must complete first
  model: string;
  maxTokens: number;
}

export interface SwarmPlan {
  id: string;
  objective: string;
  agents: SwarmAgent[];
  status: "planning" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
  summary: string | null;
}

export interface SwarmResult {
  planId: string;
  objective: string;
  totalAgents: number;
  completed: number;
  failed: number;
  results: { agentId: string; objective: string; result: string | null; error: string | null }[];
  summary: string;
  durationMs: number;
}

// ─── Config ───────────────────────────────────────────────────

const FAST_MODEL = "claude-haiku-4-5-20251001";    // Workers, scouts — fast + cheap
const SMART_MODEL = "claude-sonnet-4-20250514";     // Reviewers, builders — quality
const MAX_RETRIES = 2;
const MAX_CONCURRENT = 20;  // Max parallel API calls
const MAX_AGENTS_PER_SWARM = 100;

// System prompts for each agent type
const AGENT_PROMPTS: Record<AgentType, string> = {
  worker: `You are a focused worker agent in the JARVIS system. You receive a single, specific task. Execute it thoroughly and return your findings concisely. Do not ask questions — use your best judgment. Be precise and factual.`,

  reviewer: `You are a code reviewer agent in the JARVIS system. You review code for bugs, logic errors, security vulnerabilities, performance issues, and style consistency. Be direct about issues found. Rate the code quality 1-10. Suggest specific fixes for any issues.`,

  scout: `You are a research scout agent in the JARVIS system. You search for specific information and return concise, factual findings. Include sources when possible. If you cannot find the information, say so clearly rather than guessing.`,

  builder: `You are a builder agent in the JARVIS system. You write clean, production-quality code. Follow the project's existing patterns and conventions. Include brief comments only where logic isn't self-evident. Ship working code, not pseudocode.`,
};

// ─── Anthropic Client ─────────────────────────────────────────

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

// ─── Core: Run a single agent ─────────────────────────────────

async function runAgent(agent: SwarmAgent): Promise<void> {
  agent.status = "running";
  agent.startedAt = new Date().toISOString();

  try {
    const response = await getClient().messages.create({
      model: agent.model,
      max_tokens: agent.maxTokens,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: agent.objective }],
    });

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    agent.result = text;
    agent.status = "completed";
    agent.completedAt = new Date().toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (agent.retries < MAX_RETRIES) {
      agent.retries++;
      agent.status = "retrying";
      console.log(`[SWARM] Agent ${agent.id} failed, retry ${agent.retries}/${MAX_RETRIES}: ${message}`);
      await runAgent(agent); // Retry
    } else {
      agent.error = message;
      agent.status = "failed";
      agent.completedAt = new Date().toISOString();
      console.log(`[SWARM] Agent ${agent.id} failed permanently: ${message}`);
    }
  }
}

// ─── Core: Execute a swarm plan ───────────────────────────────

async function executeSwarm(plan: SwarmPlan): Promise<SwarmResult> {
  const startTime = Date.now();
  plan.status = "running";

  console.log(`[SWARM] Starting swarm "${plan.objective}" with ${plan.agents.length} agents`);

  // Build dependency graph
  const completed = new Set<string>();
  const running = new Set<string>();

  // Process agents in waves based on dependencies
  while (completed.size < plan.agents.length) {
    // Find agents ready to run (dependencies met, not started)
    const ready = plan.agents.filter(a =>
      a.status === "pending" &&
      !running.has(a.id) &&
      a.dependsOn.every(dep => completed.has(dep))
    );

    if (ready.length === 0 && running.size === 0) {
      // Deadlock or all done
      break;
    }

    if (ready.length === 0) {
      // Wait for running agents to complete
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    // Launch ready agents (up to MAX_CONCURRENT)
    const batch = ready.slice(0, MAX_CONCURRENT - running.size);
    const promises = batch.map(async (agent) => {
      running.add(agent.id);
      console.log(`[SWARM] Launching ${agent.type} agent: ${agent.objective.slice(0, 60)}`);

      // Inject dependency results into the agent's objective if it has dependencies
      if (agent.dependsOn.length > 0) {
        const depResults = agent.dependsOn
          .map(depId => {
            const dep = plan.agents.find(a => a.id === depId);
            return dep?.result ? `\n\n[Context from previous agent "${dep.objective.slice(0, 40)}"]\n${dep.result}` : "";
          })
          .filter(Boolean)
          .join("\n");

        if (depResults) {
          agent.objective = agent.objective + "\n\n--- CONTEXT FROM PRIOR AGENTS ---" + depResults;
        }
      }

      await runAgent(agent);
      running.delete(agent.id);
      completed.add(agent.id);
    });

    await Promise.all(promises);
  }

  // Collect results
  const completedAgents = plan.agents.filter(a => a.status === "completed");
  const failedAgents = plan.agents.filter(a => a.status === "failed");

  const durationMs = Date.now() - startTime;

  plan.status = failedAgents.length === plan.agents.length ? "failed" : "completed";
  plan.completedAt = new Date().toISOString();

  console.log(`[SWARM] Complete: ${completedAgents.length}/${plan.agents.length} succeeded in ${(durationMs / 1000).toFixed(1)}s`);

  // Generate summary from results
  const summary = completedAgents.length > 0
    ? await synthesizeResults(plan.objective, completedAgents)
    : "All agents failed. No results to synthesize.";

  plan.summary = summary;

  // Log to unified memory
  try {
    unifiedMemory.store_entry({
      source: "jarvis",
      category: "outcome",
      content: `Swarm "${plan.objective}": ${completedAgents.length}/${plan.agents.length} agents succeeded in ${(durationMs / 1000).toFixed(1)}s`,
      tags: ["swarm", "multi-agent"],
      importance: "high",
      confidence: 1.0,
    });
  } catch {
    // Memory not critical
  }

  return {
    planId: plan.id,
    objective: plan.objective,
    totalAgents: plan.agents.length,
    completed: completedAgents.length,
    failed: failedAgents.length,
    results: plan.agents.map(a => ({
      agentId: a.id,
      objective: a.objective.slice(0, 100),
      result: a.result?.slice(0, 500) || null,
      error: a.error,
    })),
    summary,
    durationMs,
  };
}

// ─── Synthesize results from multiple agents ──────────────────

async function synthesizeResults(objective: string, agents: SwarmAgent[]): Promise<string> {
  const agentResults = agents
    .map((a, i) => `[Agent ${i + 1}: ${a.objective.slice(0, 60)}]\n${a.result?.slice(0, 800) || "No output"}`)
    .join("\n\n---\n\n");

  try {
    const response = await getClient().messages.create({
      model: FAST_MODEL,
      max_tokens: 1000,
      system: "You are a synthesis agent. Combine the results from multiple worker agents into a single, coherent summary. Be concise. Highlight key findings. Note any disagreements between agents.",
      messages: [{
        role: "user",
        content: `Original objective: ${objective}\n\nAgent results:\n\n${agentResults}\n\nSynthesize these into a unified response.`,
      }],
    });

    for (const block of response.content) {
      if (block.type === "text") return block.text;
    }
  } catch {
    // Fallback: just concatenate
  }

  return agents.map(a => `• ${a.objective.slice(0, 60)}: ${a.result?.slice(0, 200) || "Failed"}`).join("\n");
}

// ─── Public API ───────────────────────────────────────────────

/** Create a worker agent */
function createAgent(
  type: AgentType,
  objective: string,
  options?: { dependsOn?: string[]; model?: string; maxTokens?: number }
): SwarmAgent {
  return {
    id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    objective,
    systemPrompt: AGENT_PROMPTS[type],
    status: "pending",
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
    retries: 0,
    dependsOn: options?.dependsOn || [],
    model: options?.model || (type === "reviewer" || type === "builder" ? SMART_MODEL : FAST_MODEL),
    maxTokens: options?.maxTokens || (type === "builder" ? 4000 : 2000),
  };
}

/**
 * Spawn a swarm of agents to handle a complex task.
 *
 * Usage:
 *   // Simple parallel research
 *   const result = await spawnSwarm("Research competitors", [
 *     { type: "scout", objective: "Research competitor A pricing" },
 *     { type: "scout", objective: "Research competitor B features" },
 *     { type: "scout", objective: "Research competitor C reviews" },
 *   ]);
 *
 *   // Pipeline with dependencies
 *   const result = await spawnSwarm("Build feature", [
 *     { type: "scout", objective: "Research best approach", id: "research" },
 *     { type: "builder", objective: "Implement the feature", dependsOn: ["research"] },
 *     { type: "reviewer", objective: "Review the implementation", dependsOn: ["build"] },
 *   ]);
 */
export async function spawnSwarm(
  objective: string,
  agentSpecs: {
    type: AgentType;
    objective: string;
    id?: string;
    dependsOn?: string[];
    model?: string;
    maxTokens?: number;
  }[]
): Promise<SwarmResult> {
  if (agentSpecs.length > MAX_AGENTS_PER_SWARM) {
    throw new Error(`Max ${MAX_AGENTS_PER_SWARM} agents per swarm. Requested: ${agentSpecs.length}`);
  }

  if (agentSpecs.length === 0) {
    throw new Error("Swarm must have at least one agent");
  }

  // Create agents
  const agents = agentSpecs.map(spec => {
    const agent = createAgent(spec.type, spec.objective, {
      dependsOn: spec.dependsOn,
      model: spec.model,
      maxTokens: spec.maxTokens,
    });
    if (spec.id) agent.id = spec.id; // Allow custom IDs for dependency references
    return agent;
  });

  const plan: SwarmPlan = {
    id: `swarm_${Date.now()}`,
    objective,
    agents,
    status: "planning",
    createdAt: new Date().toISOString(),
    completedAt: null,
    summary: null,
  };

  return executeSwarm(plan);
}

/**
 * Auto-decompose: Give JARVIS a high-level objective and let it
 * figure out how to break it into subtasks and spawn agents.
 */
export async function autoDecompose(objective: string): Promise<SwarmResult> {
  console.log(`[SWARM] Auto-decomposing: "${objective.slice(0, 80)}"`);

  // Ask Claude to decompose the task
  const response = await getClient().messages.create({
    model: SMART_MODEL,
    max_tokens: 1500,
    system: `You are a task decomposition engine. Given a complex objective, break it into 2-10 independent subtasks that can run in parallel. Each subtask should be self-contained.

Output ONLY a JSON array of objects with these fields:
- "type": one of "worker", "scout", "reviewer", "builder"
- "objective": a clear, specific instruction for the agent
- "id": short unique identifier (e.g., "research-1", "build-auth")
- "dependsOn": array of IDs this task depends on (empty array if independent)

Choose agent types wisely:
- "scout" for research, web searches, information gathering
- "worker" for analysis, writing, general tasks
- "builder" for code generation, technical implementation
- "reviewer" for code review, quality checks, validation

Keep it practical. Don't over-decompose simple tasks.`,
    messages: [{ role: "user", content: objective }],
  });

  let json = "";
  for (const block of response.content) {
    if (block.type === "text") json += block.text;
  }

  // Parse the decomposition
  const start = json.indexOf("[");
  const end = json.lastIndexOf("]") + 1;
  if (start < 0 || end <= start) {
    // Fallback: single worker agent
    console.log("[SWARM] Could not decompose — running as single agent");
    return spawnSwarm(objective, [{ type: "worker", objective }]);
  }

  try {
    const specs = JSON.parse(json.slice(start, end)) as {
      type: AgentType;
      objective: string;
      id?: string;
      dependsOn?: string[];
    }[];

    console.log(`[SWARM] Decomposed into ${specs.length} subtasks`);
    return spawnSwarm(objective, specs);
  } catch (err) {
    console.log(`[SWARM] Parse error — running as single agent: ${err}`);
    return spawnSwarm(objective, [{ type: "worker", objective }]);
  }
}

/**
 * Quick parallel research: spawn N scout agents to research different aspects
 */
export async function parallelResearch(
  topic: string,
  angles: string[]
): Promise<SwarmResult> {
  const agents = angles.map((angle, i) => ({
    type: "scout" as AgentType,
    objective: `Research: ${angle}. Context: This is part of a larger research effort on "${topic}". Be thorough and factual.`,
    id: `scout-${i}`,
  }));

  return spawnSwarm(`Research: ${topic}`, agents);
}

/**
 * Code review pipeline: write with one model, review with another
 */
export async function codeReviewPipeline(
  task: string,
  context?: string
): Promise<SwarmResult> {
  const buildObjective = context
    ? `${task}\n\nContext:\n${context}`
    : task;

  return spawnSwarm(`Build + Review: ${task}`, [
    {
      type: "builder",
      objective: buildObjective,
      id: "build",
    },
    {
      type: "reviewer",
      objective: `Review the following code for bugs, security issues, and quality. Suggest improvements.\n\nOriginal task: ${task}`,
      id: "review",
      dependsOn: ["build"],
    },
  ]);
}

// ─── Active swarm tracking ────────────────────────────────────

const activeSwarms = new Map<string, SwarmPlan>();

export function getActiveSwarms(): SwarmPlan[] {
  return Array.from(activeSwarms.values()).filter(s => s.status === "running");
}

export function getSwarmHistory(limit = 10): SwarmPlan[] {
  return Array.from(activeSwarms.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
