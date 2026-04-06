// ═══════════════════════════════════════════
// JARVIS — IDENTITY LOADER
// Reads the living .md files that define who JARVIS is.
// These files are JARVIS's soul, memory, and growth record.
// They persist across sessions and evolve over time.
// ═══════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IDENTITY_DIR = join(__dirname, "..", "..", "..", "identity");

// All identity files JARVIS reads on startup
const IDENTITY_FILES = {
  soul: "SOUL.md",
  heartbeat: "HEARTBEAT.md",
  user: "USER.md",
  learning: "LEARNING.md",
  evolution: "EVOLUTION.md",
  autonomous: "AUTONOMOUS.md",
} as const;

type IdentityFile = keyof typeof IDENTITY_FILES;

/**
 * Read a specific identity file
 */
export function readIdentityFile(file: IdentityFile): string | null {
  const path = join(IDENTITY_DIR, IDENTITY_FILES[file]);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    console.error(`[IDENTITY] Failed to read ${file}: ${path}`);
    return null;
  }
}

/**
 * Update a specific identity file (for self-evolution)
 */
export function updateIdentityFile(file: IdentityFile, content: string): boolean {
  const path = join(IDENTITY_DIR, IDENTITY_FILES[file]);
  try {
    writeFileSync(path, content, "utf-8");
    console.log(`[IDENTITY] Updated ${file}`);
    return true;
  } catch (err) {
    console.error(`[IDENTITY] Failed to update ${file}:`, err);
    return false;
  }
}

/**
 * Append to an identity file (for logging to EVOLUTION.md, LEARNING.md)
 */
export function appendToIdentityFile(file: IdentityFile, content: string): boolean {
  const path = join(IDENTITY_DIR, IDENTITY_FILES[file]);
  try {
    const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
    writeFileSync(path, existing + "\n" + content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the identity context that gets injected into the system prompt.
 * This is the core of JARVIS's self-awareness — he knows who he is,
 * what he's learned, and what he can do autonomously.
 */
export function buildIdentityContext(): string {
  const soul = readIdentityFile("soul");
  const user = readIdentityFile("user");
  const learning = readIdentityFile("learning");
  const autonomous = readIdentityFile("autonomous");
  const heartbeat = readIdentityFile("heartbeat");

  const sections: string[] = [];

  if (soul) {
    sections.push("=== MY IDENTITY (SOUL.md) ===\n" + soul);
  }

  if (user) {
    sections.push("=== MY HUMAN (USER.md) ===\n" + user);
  }

  if (learning) {
    sections.push("=== WHAT I'VE LEARNED (LEARNING.md) ===\n" + learning);
  }

  if (autonomous) {
    sections.push("=== MY AUTONOMY LEVEL (AUTONOMOUS.md) ===\n" + autonomous);
  }

  if (heartbeat) {
    sections.push("=== MY HEARTBEAT DUTIES (HEARTBEAT.md) ===\n" + heartbeat);
  }

  if (sections.length === 0) {
    return ""; // No identity files found
  }

  return "\n\n--- JARVIS IDENTITY SYSTEM ---\n" +
    "These files define who I am. I read them every session. I update LEARNING.md and EVOLUTION.md as I grow.\n\n" +
    sections.join("\n\n") +
    "\n--- END IDENTITY ---\n";
}

/**
 * Log a self-improvement to EVOLUTION.md
 */
export function logEvolution(description: string): boolean {
  const date = new Date().toISOString().split("T")[0];
  const entry = `\n### ${date} — ${description}\n`;
  return appendToIdentityFile("evolution", entry);
}

/**
 * Update LEARNING.md with a new proven strategy
 */
export function logLearnedStrategy(domain: string, strategy: string, successRate: number): boolean {
  const learning = readIdentityFile("learning");
  if (!learning) return false;

  const entry = `- **${domain}**: ${strategy} (${(successRate * 100).toFixed(0)}% success rate)`;

  // Insert under "Proven Strategies" section
  const updated = learning.replace(
    "_None yet — I'm just starting to learn. This section will populate as I track outcomes._",
    entry
  );

  // If the placeholder is gone (already has strategies), append
  if (updated === learning) {
    const marker = "## Proven Strategies";
    const idx = learning.indexOf(marker);
    if (idx >= 0) {
      const nextSection = learning.indexOf("\n## ", idx + marker.length);
      const insertPoint = nextSection >= 0 ? nextSection : learning.length;
      const before = learning.slice(0, insertPoint);
      const after = learning.slice(insertPoint);
      return updateIdentityFile("learning", before + "\n" + entry + "\n" + after);
    }
  }

  return updateIdentityFile("learning", updated);
}

/**
 * Log a detected pattern to LEARNING.md
 */
export function logDetectedPattern(pattern: string): boolean {
  const learning = readIdentityFile("learning");
  if (!learning) return false;

  const entry = `- ${pattern}`;
  const updated = learning.replace(
    "_Patterns detected by the learning engine will be summarized here._",
    entry
  );

  if (updated !== learning) {
    return updateIdentityFile("learning", updated);
  }

  // Append under patterns section
  const marker = "## Detected Patterns";
  const idx = learning.indexOf(marker);
  if (idx >= 0) {
    const nextSection = learning.indexOf("\n## ", idx + marker.length);
    const insertPoint = nextSection >= 0 ? nextSection : learning.length;
    const before = learning.slice(0, insertPoint);
    const after = learning.slice(insertPoint);
    return updateIdentityFile("learning", before + "\n" + entry + "\n" + after);
  }

  return false;
}

/**
 * Check all identity files exist
 */
export function checkIdentityHealth(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const [key, filename] of Object.entries(IDENTITY_FILES)) {
    if (!existsSync(join(IDENTITY_DIR, filename))) {
      missing.push(key);
    }
  }
  return { ok: missing.length === 0, missing };
}
