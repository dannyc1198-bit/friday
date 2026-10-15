import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Absolute paths derived from this checkout, never from a hard-coded home path. */
export const ORCHESTRATOR_ROOT = path.resolve(SERVICE_DIR, "..", "..");
export const REPO_ROOT = path.resolve(ORCHESTRATOR_ROOT, "..", "..");
export const DATA_DIR = path.resolve(
  process.env.FRIDAY_DATA_DIR || path.join(ORCHESTRATOR_ROOT, "data")
);
export const CONVERSATION_DIR = path.join(DATA_DIR, "conversations");
export const SKILLS_DIR = path.resolve(
  process.env.FRIDAY_SKILLS_DIR || path.join(ORCHESTRATOR_ROOT, "skills")
);
export const SKILL_WORKSHOP_DIR = path.join(DATA_DIR, "skill-workshop");

export function ensureRuntimeDirs(): void {
  for (const dir of [DATA_DIR, CONVERSATION_DIR, SKILLS_DIR, SKILL_WORKSHOP_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Local calendar date, used by the Vancouver-hosted scheduler and transcripts. */
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localTimestamp(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${hours}:${minutes}`;
}
