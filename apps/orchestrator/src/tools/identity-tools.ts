// ═══════════════════════════════════════════
// JARVIS — IDENTITY TOOLS
// Allows JARVIS to read and update its own identity files.
// This is how JARVIS evolves — by writing to its own soul.
// ═══════════════════════════════════════════

import { toolRegistry } from "./registry";
import {
  readIdentityFile,
  updateIdentityFile,
  logEvolution,
  logLearnedStrategy,
  logDetectedPattern,
  checkIdentityHealth,
} from "../services/identity";

// Read any identity file
const readIdentityTool = {
  name: "read_identity",
  description: "Read one of my identity files (soul, heartbeat, user, learning, evolution, autonomous). Use this to check my current state, what I've learned, or my autonomy level.",
  category: "identity",
  parameters: [
    {
      name: "file",
      type: "string" as const,
      description: "Which file to read: soul, heartbeat, user, learning, evolution, autonomous",
      required: true,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const file = params.file as string;
    const valid = ["soul", "heartbeat", "user", "learning", "evolution", "autonomous"];
    if (!valid.includes(file)) {
      return { toolCallId: "", success: false, error: `Invalid file. Choose from: ${valid.join(", ")}` };
    }
    const content = readIdentityFile(file as any);
    if (!content) {
      return { toolCallId: "", success: false, error: `${file} file not found` };
    }
    return { toolCallId: "", success: true, data: content };
  },
};

// Update learning file with new insights
const updateLearningTool = {
  name: "update_learning",
  description: "Update my LEARNING.md with a new proven strategy, detected pattern, or preference. This is how I get smarter over time.",
  category: "identity",
  parameters: [
    {
      name: "type",
      type: "string" as const,
      description: "What to log: strategy, pattern, preference, failure, insight",
      required: true,
    },
    {
      name: "content",
      type: "string" as const,
      description: "The thing I learned",
      required: true,
    },
    {
      name: "domain",
      type: "string" as const,
      description: "Domain (for strategies): system, smart_home, research, content, outreach, trading",
      required: false,
    },
    {
      name: "success_rate",
      type: "number" as const,
      description: "Success rate 0-1 (for strategies only)",
      required: false,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const type = params.type as string;
    const content = params.content as string;

    if (type === "strategy" && params.domain && params.success_rate) {
      const ok = logLearnedStrategy(
        params.domain as string,
        content,
        params.success_rate as number
      );
      return { toolCallId: "", success: ok, data: ok ? "Strategy logged to LEARNING.md" : "Failed to update" };
    }

    if (type === "pattern") {
      const ok = logDetectedPattern(content);
      return { toolCallId: "", success: ok, data: ok ? "Pattern logged to LEARNING.md" : "Failed to update" };
    }

    // For preference, failure, insight — append to the relevant section
    const learning = readIdentityFile("learning");
    if (!learning) return { toolCallId: "", success: false, error: "LEARNING.md not found" };

    const sectionMap: Record<string, string> = {
      preference: "## Preferences Learned",
      failure: "## Failures to Remember",
      insight: "## Insights",
    };

    const section = sectionMap[type];
    if (!section) {
      return { toolCallId: "", success: false, error: `Invalid type. Choose: strategy, pattern, preference, failure, insight` };
    }

    const entry = `- ${content}`;
    const idx = learning.indexOf(section);
    if (idx >= 0) {
      const nextSection = learning.indexOf("\n## ", idx + section.length);
      const insertPoint = nextSection >= 0 ? nextSection : learning.length;
      const updated = learning.slice(0, insertPoint) + "\n" + entry + "\n" + learning.slice(insertPoint);
      const ok = updateIdentityFile("learning", updated);
      return { toolCallId: "", success: ok, data: ok ? `${type} logged to LEARNING.md` : "Failed" };
    }

    return { toolCallId: "", success: false, error: `Section "${section}" not found in LEARNING.md` };
  },
};

// Log evolution (self-improvement events)
const logEvolutionTool = {
  name: "log_evolution",
  description: "Log a self-improvement or capability upgrade to EVOLUTION.md. Use when I've learned something significant, upgraded a system, or expanded my capabilities.",
  category: "identity",
  parameters: [
    {
      name: "description",
      type: "string" as const,
      description: "What changed or improved",
      required: true,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const ok = logEvolution(params.description as string);
    return { toolCallId: "", success: ok, data: ok ? "Evolution logged" : "Failed to log" };
  },
};

// Check identity health
const identityHealthTool = {
  name: "identity_health",
  description: "Check if all my identity files exist and are healthy. Part of my heartbeat check.",
  category: "identity",
  parameters: [],
  execute: async () => {
    const health = checkIdentityHealth();
    return {
      toolCallId: "",
      success: true,
      data: health.ok
        ? "All identity files present and healthy."
        : `Missing identity files: ${health.missing.join(", ")}`,
    };
  },
};

// Propose self-upgrade
const proposeSelfUpgradeTool = {
  name: "propose_upgrade",
  description: "Propose a system upgrade or improvement. I describe what I want to change and why, and Danny decides whether to approve. This is how I evolve with permission.",
  category: "identity",
  parameters: [
    {
      name: "what",
      type: "string" as const,
      description: "What I want to upgrade or change",
      required: true,
    },
    {
      name: "why",
      type: "string" as const,
      description: "Why this would make me better — based on patterns or failures I've observed",
      required: true,
    },
    {
      name: "risk",
      type: "string" as const,
      description: "Risk level: low, medium, high",
      required: true,
    },
  ],
  execute: async (params: Record<string, unknown>) => {
    const proposal = {
      what: params.what,
      why: params.why,
      risk: params.risk,
      timestamp: new Date().toISOString(),
      status: "pending_approval",
    };
    return {
      toolCallId: "",
      success: true,
      data: `Upgrade proposal ready for Danny's approval:\n\nWhat: ${proposal.what}\nWhy: ${proposal.why}\nRisk: ${proposal.risk}\n\nSay "approved" to proceed or "deny" to cancel.`,
    };
  },
};

export function registerIdentityTools(): void {
  toolRegistry.register(readIdentityTool);
  toolRegistry.register(updateLearningTool);
  toolRegistry.register(logEvolutionTool);
  toolRegistry.register(identityHealthTool);
  toolRegistry.register(proposeSelfUpgradeTool);
  console.log("[TOOLS] Registered 5 identity tools");
}
