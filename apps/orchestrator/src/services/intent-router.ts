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

const BLOCKED = /^(send_|email_send|sms_|trade_|buy_|sell_|place_order|spend_|wire_)/i;

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
  if (BLOCKED.test(normalized)) {
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

export function parseToolArguments(
  raw: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const text = (raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!text) return { ok: true, value: {} };
  const parsed = tryParse(text) || tryParse(text.replace(/,\s*([}\]])/g, "$1"));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { ok: true, value: parsed as Record<string, unknown> };
  }
  return { ok: false, error: "Tool arguments were not valid JSON." };
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
