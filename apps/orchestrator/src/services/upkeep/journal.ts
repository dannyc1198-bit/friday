// Dated error journal under FRIDAY_BRAIN/health/. The vault is canonical.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { REPEAT_THRESHOLD } from "./guards.js";

export type IncidentKind = "runtime" | "tool" | "misfire" | "check" | "repair";

export interface Incident {
  kind: IncidentKind;
  summary: string;
  detail?: string;
  signature: string;
}

export function noteIncident(healthDir: string, incident: Incident, now = new Date()): { count: number; file: string } {
  if (!existsSync(healthDir)) mkdirSync(healthDir, { recursive: true });
  const day = now.toISOString().slice(0, 10);
  const file = path.join(healthDir, `${day}.md`);
  const stamp = now.toISOString().slice(11, 16);
  const signature = incident.signature.replace(/\s+/g, " ").slice(0, 120);
  const detail = (incident.detail || incident.summary).replace(/\s+/g, " ").slice(0, 400);
  const line = `- ${stamp} [${incident.kind}] sig:${signature} — ${detail}`;
  let body = "";
  if (existsSync(file)) body = readFileSync(file, "utf8");
  if (!body.trim()) {
    body = `---\ntags: [friday-brain, health]\n---\n\n# Health ${day}\n\nRuntime errors, failed tools, and reported misfires.\n`;
  }
  writeFileSync(file, body.trimEnd() + "\n" + line + "\n", "utf8");
  const count = readFileSync(file, "utf8").split("\n").filter((row) => row.includes(`sig:${signature}`)).length;
  return { count, file };
}

export function shouldDiagnose(count: number): boolean {
  return count === REPEAT_THRESHOLD;
}

export function readLearningFeed(healthDir: string, limit = 12): string[] {
  const file = path.join(healthDir, "learning.md");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .slice(-limit)
    .reverse();
}
