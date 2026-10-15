// Obsidian vault location. Read at call time so .env, tests, and a moved
// checkout all win — module-load constants froze the path before dotenv ran
// on some import orders, and hardcoded C:\Users\12368\... broke every other machine.

import os from "os";
import path from "path";

/** Danny's Wavelength vault on his Windows box; override with OBSIDIAN_VAULT_PATH. */
export function getObsidianVaultPath(): string {
  const fromEnv = process.env.OBSIDIAN_VAULT_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, "Obsidian", "Wavelength");
}

export function getBrainDir(): string {
  return path.join(getObsidianVaultPath(), "FRIDAY_BRAIN");
}

export function getEntitiesDir(): string {
  return path.join(getBrainDir(), "entities");
}

export function getDailyDir(): string {
  return path.join(getObsidianVaultPath(), "Daily");
}
