// FRIDAY Brain tools — the model-facing surface of the Obsidian brain.
//
// brain_recall   — ranked BM25 search over the whole vault (local, instant)
// brain_remember — write a durable fact into FRIDAY_BRAIN/entities/ (markdown,
//                  observation/relation format, dedupe + update-in-place)
// brain_status   — what the brain currently holds
// brain_reflect  — run the nightly distillation on demand
//
// Distinct from memory-tools (quick 30-day JSON facts) and obsidian tools
// (raw file ops): these are KNOWLEDGE operations. The system prompt routes
// durable facts here and ephemera to memory_save.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { searchBrain, rememberFact, getBrainStats, getRecentLearnings } from "../services/brain.js";
import { runReflection, loadReflectionState } from "../services/reflection.js";
import { publishThought } from "../services/thought-bus.js";

const brainRecallTool: Tool = {
  name: "brain_recall",
  description:
    "Search FRIDAY's long-term brain (Danny's entire Obsidian vault, ranked by relevance). Use BEFORE answering anything about Danny's life, business, clients, projects, people, or past decisions. Returns the most relevant note sections with sources.",
  category: "brain",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "What to recall — natural language or keywords (e.g. 'Abe commission deal', 'Dan Martell plan', 'pricing tiers')",
      required: true,
    },
    {
      name: "limit",
      type: "number",
      description: "Max results (default 5, max 10)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const query = ((params.query as string) || "").trim();
    if (query.length < 2) {
      return { toolCallId: "", success: false, error: "Query too short." };
    }
    const limit = Math.min(Math.max(1, (params.limit as number) || 5), 10);
    try {
      const hits = searchBrain(query, limit);
      for (const hit of hits) {
        publishThought({ kind: "recall", label: hit.noteName, detail: hit.notePath, source: "brain_recall" });
      }
      return {
        toolCallId: "",
        success: true,
        data: {
          message: hits.length > 0 ? `Recalled ${hits.length} relevant section(s).` : "Nothing in the brain matches that.",
          results: hits.map((h) => ({
            note: h.noteName,
            path: h.notePath,
            section: h.heading || "(top)",
            text: h.snippet.slice(0, 300),
          })),
        },
      };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Recall failed: ${error instanceof Error ? error.message : "Unknown"}` };
    }
  },
};

const brainRememberTool: Tool = {
  name: "brain_remember",
  description:
    "Save a DURABLE fact into FRIDAY's long-term brain (writes a markdown entity note in Danny's Obsidian vault). Use immediately when Danny states a lasting fact, decision, or preference, or describes a person/client/project. NOT for quick reminders (use memory_save for those).",
  category: "brain",
  parameters: [
    {
      name: "entity",
      type: "string",
      description: "Short reusable name of who/what this is about (e.g. 'Abe', 'Wavelength Solutions', 'Mamba Gym')",
      required: true,
    },
    {
      name: "observation",
      type: "string",
      description: "One self-contained fact, readable a year from now (e.g. 'Sales partner — gets 20% of setup fees plus 10% of MRR')",
      required: true,
    },
    {
      name: "type",
      type: "string",
      description: "What the entity is",
      required: false,
      enum: ["person", "client", "project", "preference", "place", "tool", "fact"],
    },
    {
      name: "category",
      type: "string",
      description: "What kind of observation",
      required: false,
      enum: ["fact", "decision", "preference", "insight", "question", "event"],
    },
    {
      name: "relations",
      type: "array",
      description: "Optional typed links to other entities, format 'relation_type Target' (e.g. ['partner_of Wavelength Solutions'])",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const relations = Array.isArray(params.relations)
        ? (params.relations as unknown[]).map(String).filter(Boolean)
        : undefined;
      const result = await rememberFact({
        entity: (params.entity as string) || "",
        observation: (params.observation as string) || "",
        type: params.type as string | undefined,
        category: params.category as string | undefined,
        relations,
        source: "chat",
      });
      if (!result.duplicate) {
        publishThought({
          kind: "learning",
          label: result.entity,
          detail: (params.observation as string) || result.entity,
          source: "brain_remember",
        });
      }
      return {
        toolCallId: "",
        success: true,
        data: {
          message: result.duplicate
            ? `Already knew that about ${result.entity} — no duplicate written.`
            : result.created
              ? `New entity "${result.entity}" created in the brain.`
              : `Added to what I know about ${result.entity}.`,
          notePath: result.notePath,
          created: result.created,
          duplicate: result.duplicate,
        },
      };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Remember failed: ${error instanceof Error ? error.message : "Unknown"}` };
    }
  },
};

const brainStatusTool: Tool = {
  name: "brain_status",
  description:
    "Report what FRIDAY's long-term brain currently holds: indexed notes, known entities, recent learnings, last reflection. Use when Danny asks what you know or how your memory is doing.",
  category: "brain",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const stats = getBrainStats();
      const reflection = loadReflectionState();
      const recent = getRecentLearnings(5);
      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Brain holds ${stats.notes} vault notes (${stats.chunks} searchable sections) and ${stats.entities} entities. Last reflection: ${reflection.lastRunAt ? reflection.lastRunAt.slice(0, 16).replace("T", " ") : "never"}.`,
          ...stats,
          lastReflection: reflection.lastRunAt,
          lastReflectionSummary: reflection.lastSummary,
          recentLearnings: recent.map((r) => `${r.at.slice(0, 10)} ${r.entity}: ${r.observation.slice(0, 100)}`),
        },
      };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Status failed: ${error instanceof Error ? error.message : "Unknown"}` };
    }
  },
};

const brainReflectTool: Tool = {
  name: "brain_reflect",
  description:
    "Run FRIDAY's reflection now: distill today's conversations into durable vault knowledge, update the daily note and brain index. Normally runs automatically at night — use when Danny says 'reflect on today' or after an important session.",
  category: "brain",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const result = await runReflection();
      if (!result.ran) {
        return {
          toolCallId: "",
          success: true,
          data: { message: result.skippedReason || result.error || "Reflection skipped.", ...result },
        };
      }
      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Reflected on ${result.date}: ${result.factsAdded} new fact(s) learned. Summary: ${result.summary}`,
          ...result,
        },
      };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Reflection failed: ${error instanceof Error ? error.message : "Unknown"}` };
    }
  },
};

export function registerBrainTools(): void {
  toolRegistry.register(brainRecallTool);
  toolRegistry.register(brainRememberTool);
  toolRegistry.register(brainStatusTool);
  toolRegistry.register(brainReflectTool);
}
