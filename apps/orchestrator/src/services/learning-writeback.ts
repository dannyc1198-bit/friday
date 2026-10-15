// After a turn, keep durable facts Danny actually stated.
// Messages, money, and live trades are written as drafts and never executed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { rememberFact } from "./brain.js";
import { publishThought } from "./thought-bus.js";
import { getBrainDir } from "./vault-config.js";

export interface LearningCandidate {
  entity: string;
  observation: string;
  category: "fact" | "decision" | "preference";
  draft: boolean;
  /** Identity changes are proposed. They are not written into DANNY-PROFILE.md. */
  profile: boolean;
}

const UNSAFE = /\b(send\b.{0,40}\b(email|message|text|sms|dm)|wire money|spend money|place (an |the )?order|trade live|transfer money)\b/i;

export function isUnsafeToAct(text: string): boolean {
  return UNSAFE.test(text);
}

export function extractLearnings(userText: string): LearningCandidate[] {
  const text = (userText || "").trim();
  if (text.length < 12 || text.endsWith("?")) return [];
  const found: LearningCandidate[] = [];

  const remembered = text.match(/\b(?:remember that|note that)\s+(.{8,280})/i);
  if (remembered) found.push(candidate("Danny", clean(remembered[1]), "fact"));

  const goal = text.match(/\bmy ([a-z][a-z0-9 &'/-]{1,40}?)\s+(?:goal|target)\s+is\s+(.{8,280})/i);
  if (goal) found.push(candidate(titleCase(goal[1]), `Goal: ${clean(goal[2])}`, "decision"));

  const decided = text.match(/\b(?:i|we) decided\s+(?:that\s+)?(.{8,280})/i);
  if (decided) found.push(candidate("Danny", clean(decided[1]), "decision"));

  const preference = text.match(/\bi prefer\s+(.{8,200})/i);
  if (preference) found.push(candidate("Danny", `Prefers ${clean(preference[1])}`, "preference"));

  const business = text.match(/\bmy business is\s+(.{4,160})/i);
  if (business) found.push(candidate("Danny", `Business: ${clean(business[1])}`, "fact", true));

  const name = text.match(/\bmy name is\s+(.{2,80})/i);
  if (name) found.push(candidate("Danny", `Name: ${clean(name[1])}`, "fact", true));

  const seen = new Set<string>();
  return found.filter((item) => {
    const key = `${item.entity}|${item.observation.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function writeLearningsFromTurn(userText: string): Promise<{ saved: number; drafted: number }> {
  const items = extractLearnings(userText);
  let saved = 0;
  let drafted = 0;
  for (const item of items) {
    if (item.profile) {
      proposeProfileChange(item.observation);
      publishThought({ kind: "learning", label: "Profile proposal", detail: item.observation, source: "proposal" });
    }
    if (item.draft) {
      appendDraft(item);
      drafted++;
      publishThought({ kind: "learning", label: "Draft", detail: item.observation, source: "draft" });
      continue;
    }
    const result = await rememberFact({
      entity: item.entity,
      observation: item.observation,
      type: item.entity === "Danny" ? "preference" : "fact",
      category: item.category,
      source: "chat",
    });
    if (!result.duplicate) {
      saved++;
      appendLearningFeed(item);
      publishThought({ kind: "learning", label: item.entity, detail: item.observation, source: "vault" });
    }
  }
  return { saved, drafted };
}

export function proposeProfileChange(observation: string, brainDir = getBrainDir()): string {
  const dir = path.join(brainDir, "proposals");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "DANNY-PROFILE.md");
  const today = new Date().toISOString().slice(0, 10);
  const line = `- [${today}] ${observation}`;
  let body = "";
  if (existsSync(file)) body = readFileSync(file, "utf8");
  if (body.toLowerCase().includes(observation.toLowerCase())) return file;
  if (!body.trim()) {
    body = [
      "---",
      "tags: [friday-brain, proposal]",
      "---",
      "",
      "# Proposed profile changes",
      "",
      "Nothing here has been copied into DANNY-PROFILE.md. Approve a line by editing that profile yourself.",
      "",
    ].join("\n");
  }
  writeFileSync(file, body.trimEnd() + "\n" + line + "\n", "utf8");
  return file;
}

function candidate(
  entity: string,
  observation: string,
  category: LearningCandidate["category"],
  profile = false
): LearningCandidate {
  return { entity, observation, category, draft: isUnsafeToAct(observation), profile };
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[. ]+$/, "").trim();
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function appendDraft(item: LearningCandidate): void {
  const dir = path.join(getBrainDir(), "drafts");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "pending-approval.md");
  const today = new Date().toISOString().slice(0, 10);
  const line = `- [${today}] DRAFT — ${item.entity}: ${item.observation} *(not sent, not spent, not traded)*`;
  let body = "";
  if (existsSync(file)) body = readFileSync(file, "utf8");
  if (body.toLowerCase().includes(item.observation.toLowerCase())) return;
  if (!body.trim()) {
    body = "---\ntags: [friday-brain, draft]\n---\n\n# Pending approval\n\nDrafts only. Nothing here has been sent, spent, or traded.\n";
  }
  writeFileSync(file, body.trimEnd() + "\n" + line + "\n", "utf8");
}

export function recordLearningLine(
  category: string,
  entity: string,
  observation: string,
  source = "chat",
  brainDir = getBrainDir()
): void {
  appendLearningFeed(
    { entity, observation, category: category as LearningCandidate["category"], draft: false, profile: false },
    source,
    brainDir
  );
}

function appendLearningFeed(item: LearningCandidate, source = "chat", brainDir = getBrainDir()): void {
  const dir = path.join(brainDir, "health");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "learning.md");
  const today = new Date().toISOString().slice(0, 10);
  const line = `- ${today} · ${item.category} · ${item.entity}: ${item.observation} *(source: ${source})*`;
  let body = "";
  if (existsSync(file)) body = readFileSync(file, "utf8");
  if (body.toLowerCase().includes(item.observation.toLowerCase())) return;
  if (!body.trim()) {
    body = "---\ntags: [friday-brain, learning]\n---\n\n# Learning feed\n\nDated, deduped facts from conversation. The profile file is not edited from here.\n";
  }
  writeFileSync(file, body.trimEnd() + "\n" + line + "\n", "utf8");
}
