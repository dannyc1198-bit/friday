// Friday reads the request, runs one specialist or the team, and merges the notes.

import path from "path";
import { parametersToJsonSchema } from "../tool-schema.js";
import { toolRegistry } from "../../tools/registry.js";
import { redactSecrets } from "../redact.js";
import { markSpecialist } from "./activity.js";
import { mindspaceComplete, type MindspaceToolSchema, type MindspaceTurn } from "./llm.js";
import { defaultMindspaceRoot, readSpecialistMemory, writeSpecialistMemory } from "./memory.js";
import {
  clampToolCall,
  decisionFromRoute,
  frameSpecialist,
  guardSpecialistText,
  parseClassifierReply,
  routeMindspace,
  shouldClassify,
  type RouteDecision,
} from "./route.js";
import { elevenVoiceId, specialistById, SPECIALISTS, type Specialist, type SpecialistId } from "./specialists.js";

const CLASSIFIER = `You route Danny's request for Friday. Reply with JSON only: {"route":"friday"|"team"|"jarvis"|"edith"|"dume"|"u"|"vision"|"ultron"}.
jarvis: keys, bills, debt, EI, Kelowna budget. edith: youtube, tiktok, images, 3D, video.
dume: code, repairs, dashboards. u: sales drafts. vision: the daily plan. ultron: critique risk.
team: he asked several specialists. friday: ordinary chat.`;

const MERGE = `You are FRIDAY. Merge these specialist notes into one spoken reply for Danny. Call him boss.
Keep ULTRON's warning if he spoke, and label it adversarial. Do not send, spend, or trade. Do not add new facts.`;

export interface MindspaceDeps {
  complete: (input: {
    system: string;
    user: string;
    tools: MindspaceToolSchema[];
    tier: "lite" | "chain";
    signal?: AbortSignal;
  }) => Promise<MindspaceTurn>;
  executeTool: (
    name: string,
    parameters: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  memoryRoot?: string;
  now?: () => Date;
}

export interface MindspaceAnswer {
  text: string;
  specialists: SpecialistId[];
  voice: { specialist: SpecialistId | null; edge: string; elevenLabsVoiceId: string } | null;
}

function productionDeps(): MindspaceDeps {
  return {
    complete: mindspaceComplete,
    executeTool: async (name, parameters, signal) => {
      const result = await toolRegistry.execute(name, parameters, signal);
      return { success: result.success, data: result.data, error: result.error };
    },
  };
}

function toolsFor(spec: Specialist): MindspaceToolSchema[] {
  return toolRegistry.getAllTools()
    .filter((tool) => spec.tools.includes(tool.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: parametersToJsonSchema(tool.parameters),
      },
    }));
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function runOne(
  spec: Specialist,
  request: string,
  deps: MindspaceDeps,
  signal: AbortSignal | undefined,
  tier: "lite" | "chain"
): Promise<string> {
  const root = deps.memoryRoot || defaultMindspaceRoot();
  const dir = path.join(root, spec.folder);
  const memory = readSpecialistMemory(dir);
  const now = (deps.now || (() => new Date()))();
  markSpecialist(spec.id, { status: "working", lastTask: request.slice(0, 160) }, now);
  const user = [
    `REQUEST:\n${request}`,
    memory ? `YOUR NOTES:\n${memory}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const first = await deps.complete({
      system: spec.prompt,
      user,
      tools: toolsFor(spec),
      tier,
      signal,
    });
    const notes: string[] = [];
    for (const call of first.toolCalls) {
      const args = parseArgs(call.arguments);
      const gated = clampToolCall(spec, call.name, args);
      if (!gated.ok) {
        notes.push(`${call.name}: ${gated.error}`);
        continue;
      }
      const result = await deps.executeTool(call.name, gated.params, signal);
      const detail = redactSecrets(JSON.stringify(result.data ?? result.error ?? "")).slice(0, 500);
      notes.push(`${call.name}: ${result.success ? "ok" : "failed"} ${detail}`);
    }
    let text = first.text.trim();
    if (notes.length > 0 || !text) {
      const second = await deps.complete({
        system: spec.prompt,
        user: `${user}\n\nTOOL NOTES:\n${notes.join("\n") || "(none)"}\n\nReply to Danny now. Do not call tools.`,
        tools: [],
        tier,
        signal,
      });
      if (second.text.trim()) text = second.text.trim();
    }
    const safe = guardSpecialistText(spec.id, text);
    try {
      writeSpecialistMemory(dir, `\n## ${now.toISOString()}\nTask: ${request.slice(0, 240)}\n${safe.slice(0, 800)}\n`);
    } catch {
      // A missing vault must not drop the spoken answer.
    }
    markSpecialist(spec.id, { status: "done", lastTask: request.slice(0, 160), lastSummary: safe.slice(0, 180) }, now);
    return safe;
  } catch (err) {
    const message = (err as Error).message || "unavailable";
    markSpecialist(spec.id, { status: "blocked", lastTask: request.slice(0, 160), lastSummary: message.slice(0, 180) }, now);
    if (message === "aborted") throw err;
    return `${spec.name} is offline right now (${message.slice(0, 120)}).`;
  }
}

async function merge(parts: Array<{ id: SpecialistId; text: string }>, deps: MindspaceDeps, signal?: AbortSignal): Promise<string> {
  if (parts.length === 1) return frameSpecialist(parts[0].id, parts[0].text, true);
  try {
    const turn = await deps.complete({
      system: MERGE,
      user: parts.map((part) => frameSpecialist(part.id, part.text, false)).join("\n\n"),
      tools: [],
      tier: "lite",
      signal,
    });
    if (turn.text.trim()) return turn.text.trim();
  } catch {
    // The template still names every specialist.
  }
  return parts.map((part) => frameSpecialist(part.id, part.text, false)).join("\n\n");
}

export async function answerMindspace(
  message: string,
  options?: { force?: SpecialistId | "team"; signal?: AbortSignal; deps?: MindspaceDeps }
): Promise<MindspaceAnswer | null> {
  const deps = options?.deps || productionDeps();
  let decision: RouteDecision = options?.force
    ? decisionFromRoute(options.force, "name")
    : routeMindspace(message);
  if (!options?.force && shouldClassify(message, decision)) {
    try {
      const turn = await deps.complete({
        system: CLASSIFIER,
        user: message,
        tools: [],
        tier: "lite",
        signal: options?.signal,
      });
      const route = parseClassifierReply(turn.text);
      if (route && route !== "friday") decision = decisionFromRoute(route, "classifier");
    } catch (err) {
      if ((err as Error).message === "aborted") throw err;
      return null;
    }
  }
  if (decision.mode === "friday" || decision.specialists.length === 0) return null;

  const parts: Array<{ id: SpecialistId; text: string }> = [];
  const others: string[] = [];
  const tier = decision.mode === "team" ? "lite" : "chain";
  for (const id of decision.specialists) {
    const spec = specialistById(id);
    if (!spec) continue;
    const request = id === "ultron" && others.length > 0
      ? `${message}\n\nOTHER SPECIALISTS SAID:\n${others.join("\n\n")}\n\nCritique the risks. Do not carry any of it out.`
      : message;
    const text = await runOne(spec, request, deps, options?.signal, tier);
    parts.push({ id, text });
    if (id !== "ultron") others.push(frameSpecialist(id, text, false));
  }
  const text = await merge(parts, deps, options?.signal);
  const solo = parts.length === 1 ? specialistById(parts[0].id) : null;
  return {
    text,
    specialists: parts.map((part) => part.id),
    voice: solo
      ? { specialist: solo.id, edge: solo.voice.edge, elevenLabsVoiceId: elevenVoiceId(solo) }
      : null,
  };
}

export function mindspaceRoster(): typeof SPECIALISTS {
  return SPECIALISTS;
}
