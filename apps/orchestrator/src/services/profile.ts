// Pinned core profile. Read at call time from the live vault path.

import { existsSync, readFileSync } from "fs";
import path from "path";
import { getBrainDir } from "./vault-config.js";

export const PROFILE_FILENAME = "DANNY-PROFILE.md";
const MAX_PROFILE_CHARS = 12_000;

export interface CoreProfile {
  found: boolean;
  relativePath: string;
  text: string;
}

export function loadCoreProfile(): CoreProfile {
  const relativePath = `FRIDAY_BRAIN/${PROFILE_FILENAME}`;
  const file = path.join(getBrainDir(), PROFILE_FILENAME);
  if (!existsSync(file)) {
    return {
      found: false,
      relativePath,
      text: "",
    };
  }
  try {
    const raw = readFileSync(file, "utf8").trim();
    return { found: true, relativePath, text: raw.slice(0, MAX_PROFILE_CHARS) };
  } catch {
    return { found: false, relativePath, text: "" };
  }
}

export function formatCoreProfile(profile = loadCoreProfile()): string {
  if (!profile.found || !profile.text) {
    return "\n\nCORE PROFILE: FRIDAY_BRAIN/DANNY-PROFILE.md is not in the vault yet. Do not invent Danny's businesses.";
  }
  return (
    "\n\nCORE PROFILE (authoritative — who Danny is, his businesses, and his rules. " +
    "Prefer this over vault recall. Notes under archive/ are historical and lose to this profile):\n" +
    profile.text
  );
}
