// Local intent router. It runs before a model tool name is trusted.
// A missing or invented name never becomes the tool "unknown".

export type IntentKind =
  | "profile"
  | "recall"
  | "remember"
  | "reflect"
  | "status"
  | "creative"
  | "general";

export interface IntentDecision {
  kind: IntentKind;
  tool: string | null;
  args: Record<string, unknown>;
  confidence: number;
  /** Creative jobs start immediately so the model cannot invent a second tool. */
  autoRun: boolean;
  reason: string;
}

const ALIASES: Record<string, string> = {
  memory_search: "brain_recall",
  memory_recall: "brain_recall",
  recall: "brain_recall",
  search_memory: "brain_recall",
  search_brain: "brain_recall",
  remember: "brain_remember",
  memory_save: "brain_remember",
  save_memory: "brain_remember",
  text_to_3d: "meshy_text_to_3d",
  make_3d: "meshy_text_to_3d",
  meshy: "meshy_text_to_3d",
  image_to_3d: "meshy_image_to_3d",
  make_image: "higgsfield_image",
  generate_image: "higgsfield_image",
  make_video: "higgsfield_video",
  generate_video: "higgsfield_video",
  blender: "blender_render",
};

// Tool names that send, spend, or trade. The model cannot self-approve these
// by passing confirmed=true. There is no live approval path for them.
const OUTBOUND_TOOL = /(^|_)(send|sms|trade|buy|sell|spend|wire)(_|$)|(^|_)(place_order|email_send|gmail_send|send_message|send_email)$/;

const OUTBOUND_TASK = /\b(send (an |the |a )?(email|e-mail|sms|text message|invoice)|wire (the )?money|spend (the )?money|place (an |the )?order|trade live|transfer (the )?money)\b/i;

export function classifyIntent(message: string): IntentDecision {
  const text = (message || "").trim();
  if (text.length < 2) {
    return { kind: "general", tool: null, args: {}, confidence: 0, autoRun: false, reason: "empty" };
  }

  if (/\bimage[\s-]to[\s-]3d\b/i.test(text)) {
    return creative("meshy_image_to_3d", { image_url: firstUrl(text) }, "image-to-3d");
  }
  if (/\b(3d model|text[\s-]to[\s-]3d)\b/i.test(text) || /\b(make|create|generate)\b[\s\S]{0,40}\b3d\b/i.test(text)) {
    return creative("meshy_text_to_3d", { prompt: subjectOf(text) }, "text-to-3d");
  }
  if (/\bblender\b/i.test(text) && /\bopen\b/i.test(text)) {
    return creative("blender_open", {}, "open the latest model in Blender");
  }
  if (/\b(render|preview)\b[\s\S]{0,40}\bblender\b/i.test(text) || /\bin blender\b/i.test(text)) {
    return creative("blender_render", {}, "render a Blender preview");
  }
  if (/\b(make|create|generate)\b[\s\S]{0,40}\b(video|clip|tiktok|reel)\b/i.test(text) || /\bvideo of\b/i.test(text)) {
    return creative("higgsfield_video", { prompt: subjectOf(text) }, "video");
  }
  if (/\b(make|create|generate)\b[\s\S]{0,40}\b(image|picture|photo|poster)\b/i.test(text) || /\b(image|picture|photo) of\b/i.test(text)) {
    return creative("higgsfield_image", { prompt: subjectOf(text) }, "image");
  }
  if (/\b(reflect on|run reflection|nightly reflection)\b/i.test(text)) {
    return decision("reflect", "brain_reflect", {}, 0.9, false, "reflection");
  }
  if (/\b(brain status|what do you know about me|how is your memory)\b/i.test(text)) {
    return decision("status", "brain_status", {}, 0.86, false, "brain status");
  }
  if (/\b(remember that|note that|i decided|we decided)\b/i.test(text) || /\bmy [a-z].{0,40} goal is\b/i.test(text)) {
    return decision("remember", "brain_remember", {}, 0.8, false, "durable fact");
  }
  if (/\b(who am i|my businesses|my products|who is|enagic|wavelength|russell|ally wellness|what do i (do|sell|run)|my goal)\b/i.test(text)) {
    return decision("profile", "brain_recall", { query: text }, 0.9, false, "identity or business");
  }
  if (/\b(do you remember|what did we|recall|look up)\b/i.test(text)) {
    return decision("recall", "brain_recall", { query: text }, 0.84, false, "recall");
  }
  return decision("general", null, {}, 0.2, false, "no strong intent");
}

export function resolveToolCall(
  rawName: string | undefined,
  known: readonly string[],
  intent: IntentDecision
): { name: string | null; reason: string } {
  const cleaned = (rawName || "").trim().replace(/^default_api\./i, "");
  const normalized = (cleaned.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!normalized) {
    if (intent.tool && intent.confidence >= 0.7 && known.includes(intent.tool)) {
      return { name: intent.tool, reason: `The model omitted the tool name. Using ${intent.tool} for this ${intent.kind} request.` };
    }
    return { name: null, reason: "The model returned a tool call with no name. Nothing ran." };
  }
  if (isOutboundTool(normalized)) {
    return {
      name: null,
      reason: `Refused "${normalized}". Messages, spending, and live trades stay drafts until Danny explicitly approves one.`,
    };
  }
  if (known.includes(normalized)) return { name: normalized, reason: "registered tool" };
  const alias = ALIASES[normalized];
  if (alias && known.includes(alias)) {
    return { name: alias, reason: `No tool named "${normalized}". Using ${alias}.` };
  }
  if (
    intent.tool &&
    known.includes(intent.tool) &&
    intent.confidence >= 0.7 &&
    intent.kind !== "general"
  ) {
    return { name: intent.tool, reason: `No tool named "${normalized}". Routed this ${intent.kind} request to ${intent.tool}.` };
  }
  return { name: null, reason: `No registered tool named "${normalized}". Nothing ran.` };
}

export function isOutboundTool(name: string): boolean {
  const normalized = (name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return OUTBOUND_TOOL.test(normalized);
}

/** Dispatch tasks that would send, spend, or trade. Drafts only. */
export function isUnapprovedExternalAction(text: string): boolean {
  return OUTBOUND_TASK.test(text || "");
}

export interface PartialToolCall {
  id?: string;
  name?: string;
  argumentsJson: string;
  /** Gemini thought signature, returned on the tool call as extra_content. */
  extra?: unknown;
}

export interface ToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: unknown };
  extra_content?: unknown;
}

/**
 * Gemini's OpenAI-compatible stream often omits `index` and sends argument
 * chunks that are not pure deltas: an empty `{}` followed by the real object,
 * or a cumulative copy of the JSON so far. Concatenating those is invalid JSON
 * and the next request 400s when that string is replayed.
 */
export function applyToolCallDelta(partials: Record<number, PartialToolCall>, delta: ToolCallDelta): void {
  const idx = toolCallIndex(delta.index, partials);
  if (!partials[idx]) partials[idx] = { argumentsJson: "" };
  const slot = partials[idx];
  if (delta.id) slot.id = delta.id;
  if (delta.function?.name) {
    const next = delta.function.name;
    if (!slot.name || next.startsWith(slot.name)) slot.name = next;
    else if (!slot.name.startsWith(next)) slot.name += next;
  }
  if (delta.function && "arguments" in delta.function && delta.function.arguments != null && delta.function.arguments !== "") {
    slot.argumentsJson = appendArgumentDelta(slot.argumentsJson, delta.function.arguments);
  }
  if (delta.extra_content && slot.extra == null) slot.extra = delta.extra_content;
}

export function toolCallIndex(index: number | undefined, partials: Record<number, PartialToolCall>): number {
  if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < 32) return index;
  const keys = Object.keys(partials).map(Number).filter((n) => Number.isInteger(n) && n >= 0);
  if (keys.length === 0) return 0;
  return Math.max(...keys);
}

export function appendArgumentDelta(current: string, delta: unknown): string {
  if (delta == null || delta === "") return current;
  const piece = typeof delta === "string" ? delta : JSON.stringify(delta);
  if (!piece) return current;
  if (!current) return piece;
  if (current === "{}" || current === "[]") return piece.startsWith("{") || piece.startsWith("[") ? piece : current + piece;
  if ((piece.startsWith("{") || piece.startsWith("[")) && (piece.startsWith(current) || current.startsWith(piece))) {
    return piece.length >= current.length ? piece : current;
  }
  return current + piece;
}

export function parseToolArguments(
  raw: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const text = stripFence(raw);
  if (!text) return { ok: true, value: {} };
  const direct = asObject(parseJsonish(text));
  if (direct) return { ok: true, value: direct };
  const repaired = asObject(parseJsonish(text.replace(/,\s*([}\]])/g, "$1")));
  if (repaired) return { ok: true, value: repaired };
  const merged = mergeConcatenated(text) || (text.includes(":") ? mergeConcatenated(closeTruncated(text)) : null);
  if (merged) return { ok: true, value: merged };
  return { ok: false, error: "Tool arguments were not valid JSON." };
}

/** Always a JSON object string, so a follow-up request cannot 400 on replay. */
export function canonicalToolArguments(raw: string): string {
  const parsed = parseToolArguments(raw);
  return JSON.stringify(parsed.ok ? parsed.value : {});
}

export function argumentsForTool(
  raw: string,
  toolName: string | null,
  intent: IntentDecision
): { ok: true; value: Record<string, unknown>; recovered: boolean } | { ok: false; error: string } {
  const parsed = parseToolArguments(raw);
  if (parsed.ok && Object.keys(parsed.value).length > 0) {
    return { ok: true, value: parsed.value, recovered: false };
  }
  if (
    toolName &&
    intent.tool === toolName &&
    intent.confidence >= 0.7 &&
    Object.keys(intent.args).length > 0
  ) {
    return { ok: true, value: intent.args, recovered: true };
  }
  if (parsed.ok) return { ok: true, value: parsed.value, recovered: false };
  return parsed;
}

function stripFence(raw: string): string {
  return (raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseJsonish(text: string): unknown {
  const parsed = tryParse(text);
  if (typeof parsed === "string") {
    const again = tryParse(parsed.trim());
    return again ?? parsed;
  }
  return parsed;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function mergeConcatenated(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const values: unknown[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    const end = jsonValueEnd(text, i);
    if (end < 0) return null;
    const parsed = tryParse(text.slice(i, end));
    if (parsed === null && text.slice(i, end) !== "null") return null;
    values.push(parsed);
    i = end;
  }
  if (values.length === 0) return null;
  if (values.some((value) => !value || typeof value !== "object" || Array.isArray(value))) return null;
  return Object.assign({}, ...(values as Record<string, unknown>[]));
}

function jsonValueEnd(text: string, start: number): number {
  const open = text[start];
  if (open !== "{" && open !== "[") {
    if (open === '"') {
      for (let i = start + 1; i < text.length; i++) {
        if (text[i] === "\\") {
          i++;
          continue;
        }
        if (text[i] === '"') return i + 1;
      }
      return -1;
    }
    const match = text.slice(start).match(/^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    return match ? start + match[0].length : -1;
  }
  const stack = [open];
  let inString = false;
  let escape = false;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      const want = stack[stack.length - 1];
      if ((ch === "}" && want !== "{") || (ch === "]" && want !== "[")) return -1;
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

function closeTruncated(text: string): string {
  if (!text.startsWith("{") && !text.startsWith("[")) return text;
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if ((ch === "}" || ch === "]") && stack.length) stack.pop();
  }
  let suffix = "";
  if (inString) suffix += '"';
  while (stack.length) {
    const open = stack.pop();
    suffix += open === "[" ? "]" : "}";
  }
  return text + suffix;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decision(
  kind: IntentKind,
  tool: string | null,
  args: Record<string, unknown>,
  confidence: number,
  autoRun: boolean,
  reason: string
): IntentDecision {
  return { kind, tool, args, confidence, autoRun, reason };
}

function creative(tool: string, args: Record<string, unknown>, reason: string): IntentDecision {
  return decision("creative", tool, args, 0.92, true, reason);
}

function firstUrl(text: string): string {
  return text.match(/https?:\/\/\S+/)?.[0] ?? "";
}

function subjectOf(text: string): string {
  return text
    .replace(/^.*?\b(?:of|model of|image of|picture of|video of|3d model of)\s+/i, "")
    .replace(/[.?!]\s*$/, "")
    .trim()
    .slice(0, 800);
}
