// Saved brain choice. This file is not .env and never stores a key.

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { DATA_DIR } from "./runtime-paths.js";

export type BrainProviderId = "openai" | "xai" | "gemini";

export const BRAIN_PROVIDERS: BrainProviderId[] = ["openai", "xai", "gemini"];

export function isBrainProvider(value: string): value is BrainProviderId {
  return value === "openai" || value === "xai" || value === "gemini";
}

export function brainSettingsPath(file?: string | null): string {
  if (file) return file;
  const dir = process.env.FRIDAY_DATA_DIR || DATA_DIR;
  return path.join(dir, "settings.json");
}

export function readBrainProvider(file?: string | null): BrainProviderId | null {
  if (file === null) return null;
  try {
    const raw = JSON.parse(readFileSync(brainSettingsPath(file), "utf8")) as { provider?: unknown };
    const provider = String(raw.provider || "").trim().toLowerCase();
    return isBrainProvider(provider) ? provider : null;
  } catch {
    return null;
  }
}

export function writeBrainProvider(provider: BrainProviderId, file?: string): BrainProviderId {
  const target = brainSettingsPath(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ provider }, null, 2)}\n`, "utf8");
  return provider;
}
