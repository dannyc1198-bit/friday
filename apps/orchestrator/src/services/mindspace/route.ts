// How Friday chooses a specialist. Names and "ask the team" are exact.
// Strong phrases route without a model. Everything else can ask the cheap model.

import { isOutboundTool, isUnapprovedExternalAction } from "../intent-router.js";
import { isUnsafeToAct } from "../learning-writeback.js";
import {
  SPECIALISTS,
  SPECIALIST_ORDER,
  type Specialist,
  type SpecialistId,
} from "./specialists.js";

export interface RouteDecision {
  mode: "friday" | "one" | "team";
  specialists: SpecialistId[];
  reason: "name" | "team" | "keyword" | "classifier" | "none";
}

const TEAM = /\b(ask|consult|check with) (the |my )?(whole )?(team|everyone|mindspace)\b|\ball six\b/i;

export function orderSpecialists(ids: SpecialistId[]): SpecialistId[] {
  const wanted = new Set(ids);
  return SPECIALIST_ORDER.filter((id) => wanted.has(id));
}

function aliasPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b(?:hey|ok|okay|ask|yo|please)\\s+)${escaped}\\b`, "i");
}

export function addressed(text: string, spec: Specialist): boolean {
  const raw = text || "";
  if (spec.id === "u") {
    return /(?:^|\n|(?:^|\s)(?:hey|ok|okay|ask|yo|please)\s+)U(?=$|[\s,:!.])/m.test(raw);
  }
  return spec.aliases.some((alias) => aliasPattern(alias).test(raw.trim()));
}

export function routeMindspace(text: string): RouteDecision {
  const raw = (text || "").trim();
  if (!raw) return { mode: "friday", specialists: [], reason: "none" };
  if (TEAM.test(raw)) {
    return { mode: "team", specialists: [...SPECIALIST_ORDER], reason: "team" };
  }
  const named = SPECIALISTS.filter((spec) => addressed(raw, spec)).map((spec) => spec.id);
  if (named.length === 1) return { mode: "one", specialists: named, reason: "name" };
  if (named.length > 1) return { mode: "team", specialists: orderSpecialists(named), reason: "name" };
  const keyed = SPECIALISTS.filter((spec) => spec.keywords.test(raw)).map((spec) => spec.id);
  if (keyed.length === 1) return { mode: "one", specialists: keyed, reason: "keyword" };
  if (keyed.length > 1) return { mode: "team", specialists: orderSpecialists(keyed), reason: "keyword" };
  return { mode: "friday", specialists: [], reason: "none" };
}

export function shouldClassify(text: string, decision: RouteDecision = routeMindspace(text)): boolean {
  if (decision.mode !== "friday") return false;
  const raw = text.trim();
  if (raw.length < 24) return false;
  if (/^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|stop)\b/i.test(raw)) return false;
  return true;
}

export function parseClassifierReply(text: string): SpecialistId | "friday" | "team" | null {
  const match = /\{[\s\S]*\}/.exec(text || "");
  const source = match ? match[0] : text || "";
  try {
    const parsed = JSON.parse(source) as { route?: string };
    return normalizeRoute(parsed.route || "");
  } catch {
    return normalizeRoute(source);
  }
}

function normalizeRoute(value: string): SpecialistId | "friday" | "team" | null {
  const token = value.trim().toLowerCase().replace(/[^a-z-]/g, "");
  if (token === "friday" || token === "team") return token;
  if (token === "dum-e" || token === "dume") return "dume";
  if ((SPECIALIST_ORDER as string[]).includes(token)) return token as SpecialistId;
  return null;
}

export function decisionFromRoute(route: SpecialistId | "team", reason: RouteDecision["reason"]): RouteDecision {
  if (route === "team") return { mode: "team", specialists: [...SPECIALIST_ORDER], reason };
  return { mode: "one", specialists: [route], reason };
}

const READ_ONLY_BLOCK = new Set([
  "obsidian_create", "obsidian_edit", "obsidian_delete", "obsidian_daily",
  "task_add", "task_update", "task_complete", "task_delete",
  "route_agent_task", "fleet_launch", "fleet_stop", "brain_remember", "brain_reflect",
  "meshy_text_to_3d", "meshy_image_to_3d", "higgsfield_image", "higgsfield_video",
  "blender_render", "blender_open", "open_app", "close_app", "lock_screen",
  "vault_add", "vault_get", "vault_delete", "vault_unlock",
]);

export function toolAllowed(spec: Specialist, name: string): boolean {
  const tool = (name || "").trim();
  if (!spec.tools.includes(tool)) return false;
  if (isOutboundTool(tool)) return false;
  if (spec.readOnly && READ_ONLY_BLOCK.has(tool)) return false;
  return true;
}

export function clampToolCall(
  spec: Specialist,
  name: string,
  params: Record<string, unknown>
): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
  if (!toolAllowed(spec, name)) {
    return { ok: false, error: spec.readOnly
      ? `${spec.name} is read-only and cannot call ${name}.`
      : `${name} is outside ${spec.name}'s tools.` };
  }
  const blob = JSON.stringify(params || {});
  if (isUnapprovedExternalAction(blob) || isUnsafeToAct(blob)) {
    return { ok: false, error: "Refused. Messages, spending, and trades stay drafts." };
  }
  if (spec.id === "jarvis" && /\b(pay|payment|transfer|wire)\b/i.test(blob)) {
    return { ok: false, error: "J.A.R.V.I.S. does not pay anything." };
  }
  if (name === "obsidian_create") {
    return { ok: true, params: { ...params, folder: `FRIDAY_BRAIN/mindspace/${spec.folder}` } };
  }
  if (name === "obsidian_edit" || name === "obsidian_delete") {
    const note = String(params.note || "");
    if (!note.includes(`mindspace/${spec.folder}`)) {
      return { ok: false, error: "That note is outside this specialist's folder." };
    }
  }
  return { ok: true, params };
}

export function guardSpecialistText(id: SpecialistId, text: string): string {
  const body = (text || "").trim();
  if (!body) return `${labelFor(id)} had nothing to add.`;
  if (id === "u" && /\b(cures?|guarantees income|guaranteed income|financial freedom|cancer|lose \d+ pounds|passive income)\b/i.test(body)) {
    return "U drafted a follow-up, then Friday removed health and income claims. Ask for a compliant rewrite.";
  }
  if (id === "jarvis" && /\b(i paid|payment sent|transferred \$|wired the)\b/i.test(body)) {
    return "J.A.R.V.I.S. does not pay anything. The deadline can be noted. Nothing moved.";
  }
  if (isUnsafeToAct(body) || isUnapprovedExternalAction(body)) {
    return `${body}\n\nFriday held this as a draft. Nothing was sent, spent, or traded.`;
  }
  if (id === "ultron" && !/adversarial/i.test(body)) {
    return `ULTRON (adversarial, read-only):\n${body}`;
  }
  return body;
}

function labelFor(id: SpecialistId): string {
  return SPECIALISTS.find((spec) => spec.id === id)?.name || id;
}

export function frameSpecialist(id: SpecialistId, text: string, solo: boolean): string {
  const body = guardSpecialistText(id, text);
  const name = labelFor(id);
  if (solo) return `${name}:\n${body}\n\nFriday: that's the read, boss. Nothing was sent, spent, or traded.`;
  return `${name}:\n${body}`;
}
