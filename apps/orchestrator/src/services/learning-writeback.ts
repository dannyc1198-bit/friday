// After a turn, keep durable facts Danny actually stated.
// Messages, money, and live trades are written as drafts and never executed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { rememberFact } from "./brain.js";
import { getBrainDir } from "./vault-config.js";

export interface LearningCandidate {
  entity: string;
  observation: string;
  category: "fact" | "decision" | "preference";
  draft: boolean;
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
    if (item.draft) {
      appendDraft(item);
      drafted++;
      continue;
    }
    const result = await rememberFact({
      entity: item.entity,
      observation: item.observation,
      type: item.entity === "Danny" ? "preference" : "fact",
      category: item.category,
      source: "chat",
    });
    if (!result.duplicate) saved++;
  }
  return { saved, drafted };
}

function candidate(entity: string, observation: string, category: LearningCandidate["category"]): LearningCandidate {
  return { entity, observation, category, draft: isUnsafeToAct(observation) };
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
