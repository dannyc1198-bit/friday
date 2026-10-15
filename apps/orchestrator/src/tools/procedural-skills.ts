import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import {
  createSkillProposal,
  getSkillProposal,
  listActiveSkills,
  listSkillProposals,
} from "../services/procedural-skills.js";

const proposeSkillTool: Tool = {
  name: "skill_propose",
  description:
    "Draft a governed procedural skill from a reusable workflow, correction, successful technique, or template. This creates a PENDING proposal only; it never changes active behavior until Danny reviews and applies it.",
  category: "learning",
  parameters: [
    { name: "name", type: "string", description: "Reusable class-level kebab-case skill name", required: true },
    { name: "description", type: "string", description: "When and why this skill should be used", required: true },
    { name: "body", type: "string", description: "Complete procedural instructions with completion criteria", required: true },
    { name: "evidence", type: "string", description: "What happened that justifies learning this skill", required: true },
    { name: "template_name", type: "string", description: "Optional reusable template filename", required: false },
    { name: "template_content", type: "string", description: "Optional reusable template body", required: false },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const proposal = createSkillProposal({
        name: String(params.name || ""),
        description: String(params.description || ""),
        body: String(params.body || ""),
        evidence: String(params.evidence || ""),
        templateName: params.template_name ? String(params.template_name) : undefined,
        templateContent: params.template_content != null ? String(params.template_content) : undefined,
      });
      return {
        toolCallId: "",
        success: true,
        data: {
          message: proposal.status === "quarantined"
            ? `Drafted ${proposal.name}, but its security scan needs review.`
            : `Drafted ${proposal.name} for review. It is not active yet.`,
          proposal,
        },
      };
    } catch (err) {
      return { toolCallId: "", success: false, error: (err as Error).message };
    }
  },
};

const listSkillsTool: Tool = {
  name: "skill_status",
  description: "List active procedural skills and pending learning proposals.",
  category: "learning",
  parameters: [],
  execute: async (): Promise<ToolResult> => ({
    toolCallId: "",
    success: true,
    data: {
      active: listActiveSkills().map(({ name, description, useCount, lastUsedAt }) => ({ name, description, useCount, lastUsedAt })),
      pending: listSkillProposals("pending").map(({ id, name, description, kind, createdAt }) => ({ id, name, description, kind, createdAt })),
      quarantined: listSkillProposals("quarantined").map(({ id, name, scannerFindings }) => ({ id, name, scannerFindings })),
    },
  }),
};

const inspectSkillTool: Tool = {
  name: "skill_inspect_proposal",
  description: "Inspect one pending procedural-skill proposal before Danny decides whether to apply it.",
  category: "learning",
  parameters: [
    { name: "proposal_id", type: "string", description: "Proposal id from skill_status", required: true },
  ],
  execute: async (params): Promise<ToolResult> => {
    const proposal = getSkillProposal(String(params.proposal_id || ""));
    return proposal
      ? { toolCallId: "", success: true, data: proposal }
      : { toolCallId: "", success: false, error: "Proposal not found." };
  },
};

export function registerProceduralSkillTools(): void {
  toolRegistry.register(proposeSkillTool);
  toolRegistry.register(listSkillsTool);
  toolRegistry.register(inspectSkillTool);
}
