// Each specialist keeps its own notes under FRIDAY_BRAIN/mindspace/<folder>/.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { getBrainDir } from "../vault-config.js";

export function defaultMindspaceRoot(): string {
  return path.join(getBrainDir(), "mindspace");
}

export function readSpecialistMemory(dir: string, limit = 1600): string {
  try {
    const file = path.join(dir, "log.md");
    if (!existsSync(file)) return "";
    const text = readFileSync(file, "utf8");
    return text.length > limit ? text.slice(-limit) : text;
  } catch {
    return "";
  }
}

export function writeSpecialistMemory(dir: string, entry: string): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, "log.md"), entry.endsWith("\n") ? entry : `${entry}\n`, "utf8");
}
