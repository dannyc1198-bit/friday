// Friday can consult one Mindspace specialist, or the whole team, and merge the notes.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { answerMindspace } from "../services/mindspace/run.js";
import { specialistById, type SpecialistId } from "../services/mindspace/specialists.js";

const CHOICES = ["jarvis", "edith", "dume", "u", "vision", "ultron", "team"] as const;

const consultMindspace: Tool = {
  name: "consult_mindspace",
  description:
    "Ask one Mindspace specialist, or the team, and let Friday merge the notes. " +
    "specialist is jarvis, edith, dume, u, vision, ultron, or team. " +
    "Ultron is adversarial and read-only. Nobody sends, spends, or trades.",
  category: "mindspace",
  parameters: [
    {
      name: "specialist",
      type: "string",
      description: "jarvis, edith, dume, u, vision, ultron, or team.",
      required: true,
      enum: [...CHOICES],
    },
    {
      name: "request",
      type: "string",
      description: "What Danny asked, in his words.",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const specialist = String(params.specialist || "").trim().toLowerCase();
    const request = String(params.request || "").trim();
    if (!CHOICES.includes(specialist as typeof CHOICES[number])) {
      return { toolCallId: "", success: false, error: "specialist must be jarvis, edith, dume, u, vision, ultron, or team." };
    }
    if (!request) return { toolCallId: "", success: false, error: "request is required." };
    const force = specialist === "team" ? "team" : specialist as SpecialistId;
    if (force !== "team" && !specialistById(force)) {
      return { toolCallId: "", success: false, error: "Unknown specialist." };
    }
    const answer = await answerMindspace(request, { force });
    if (!answer) return { toolCallId: "", success: false, error: "Mindspace did not take that request." };
    return { toolCallId: "", success: true, data: { message: answer.text, specialists: answer.specialists } };
  },
};

export function registerMindspaceTools(): void {
  toolRegistry.register(consultMindspace);
}
