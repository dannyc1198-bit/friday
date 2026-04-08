// Memory Loader — Loads all persistent memory sources into the LLM context
// Sources: MASTER_MEMORY.md, project state, conversation summaries, behavioral patterns

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOME = process.env.USERPROFILE || process.env.HOME || "";
const DATA_DIR = join(__dirname, "..", "..", "data");

// ─── MASTER MEMORY (Danny's full context) ────────────────────

let cachedMasterMemory: string | null = null;
let masterMemoryLastLoaded = 0;
const MASTER_MEMORY_CACHE_MS = 300_000; // Re-read every 5 min

function loadMasterMemory(): string {
  const now = Date.now();
  if (cachedMasterMemory && now - masterMemoryLastLoaded < MASTER_MEMORY_CACHE_MS) {
    return cachedMasterMemory;
  }

  // Try multiple known locations
  const paths = [
    join(HOME, "Desktop", "FRIDAY", "MASTER_MEMORY.md"),
    join(HOME, "Desktop", "jarvis", "MASTER_MEMORY.md"),
    join(HOME, "jarvis", "MASTER_MEMORY.md"),
  ];

  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const raw = readFileSync(p, "utf-8");
        // Extract the most useful sections (trim to ~4K tokens for context window)
        cachedMasterMemory = extractKeyMemorySections(raw);
        masterMemoryLastLoaded = now;
        console.log(`[MemoryLoader] Loaded MASTER_MEMORY.md from ${p} (${cachedMasterMemory.length} chars)`);
        return cachedMasterMemory;
      }
    } catch {
      continue;
    }
  }

  cachedMasterMemory = "";
  masterMemoryLastLoaded = now;
  return "";
}

function extractKeyMemorySections(raw: string): string {
  // Extract the most context-rich sections, skip file locations and architecture details
  // JARVIS already knows its own architecture
  const sections: string[] = [];

  const sectionMap: Record<string, boolean> = {
    "SECTION 1: DANNY": true,         // Identity, schedule, goals
    "SECTION 2: WAVELENGTH AI": true,  // Business context
    "SECTION 4: ALL PROJECTS": true,   // Project status
    "SECTION 5: AGENT TEAM": true,     // Agent roster
    "SECTION 10: CONTENT STRATEGY": true, // Content context
    "SECTION 13: BEHAVIORAL RULES": true, // How to behave
    "SECTION 14: PENDING TASKS": true,    // What's pending
  };

  const rawSections = raw.split(/^# /m);
  for (const section of rawSections) {
    for (const key of Object.keys(sectionMap)) {
      if (section.includes(key)) {
        sections.push("# " + section.trim());
      }
    }
  }

  return sections.join("\n\n");
}

// ─── PROJECT STATE (.planning/STATE.md) ──────────────────────

let cachedProjectState: string | null = null;
let projectStateLastLoaded = 0;

function loadProjectState(): string {
  const now = Date.now();
  if (cachedProjectState && now - projectStateLastLoaded < MASTER_MEMORY_CACHE_MS) {
    return cachedProjectState;
  }

  const statePath = join(HOME, "jarvis", ".planning", "STATE.md");
  try {
    if (existsSync(statePath)) {
      const raw = readFileSync(statePath, "utf-8");
      // Only the first 50 lines (current position + recent phase)
      cachedProjectState = raw.split("\n").slice(0, 50).join("\n");
      projectStateLastLoaded = now;
      return cachedProjectState;
    }
  } catch (err) {
    console.error("[MemoryLoader] Failed to load project state:", err);
  }

  cachedProjectState = "";
  projectStateLastLoaded = now;
  return "";
}

// ─── CONVERSATION SUMMARIES (cross-session memory) ───────────

interface ConversationSummary {
  date: string;
  summary: string;
  keyFacts: string[];
  timestamp: number;
}

const SUMMARIES_FILE = join(DATA_DIR, "conversation-summaries.json");

function loadConversationSummaries(): ConversationSummary[] {
  try {
    if (existsSync(SUMMARIES_FILE)) {
      return JSON.parse(readFileSync(SUMMARIES_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("[MemoryLoader] Failed to load conversation summaries:", err);
  }
  return [];
}

export async function saveConversationSummary(summary: string, keyFacts: string[]): Promise<void> {
  const summaries = loadConversationSummaries();
  const today = new Date().toISOString().split("T")[0];

  // Update today's entry if it exists, otherwise add new
  const existing = summaries.findIndex((s) => s.date === today);
  const entry: ConversationSummary = {
    date: today,
    summary,
    keyFacts,
    timestamp: Date.now(),
  };

  if (existing >= 0) {
    summaries[existing] = entry;
  } else {
    summaries.push(entry);
  }

  // Keep last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const trimmed = summaries.filter((s) => s.timestamp > cutoff);

  try {
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
    await writeFile(SUMMARIES_FILE, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.error("[MemoryLoader] Failed to save conversation summary:", err);
  }
}

function formatConversationSummaries(): string {
  const summaries = loadConversationSummaries();
  if (summaries.length === 0) return "";

  const recent = summaries.slice(-7); // Last 7 days
  const lines = recent.map((s) => {
    const facts = s.keyFacts.length > 0 ? ` | Key: ${s.keyFacts.join(", ")}` : "";
    return `- ${s.date}: ${s.summary}${facts}`;
  });

  return `RECENT CONVERSATION HISTORY (last ${recent.length} days):\n${lines.join("\n")}`;
}

// ─── BEHAVIORAL PATTERNS ─────────────────────────────────────

interface BehavioralPattern {
  pattern: string;
  confidence: number;
  lastObserved: string;
  count: number;
}

const PATTERNS_FILE = join(DATA_DIR, "behavioral-patterns.json");

function loadBehavioralPatterns(): BehavioralPattern[] {
  try {
    if (existsSync(PATTERNS_FILE)) {
      return JSON.parse(readFileSync(PATTERNS_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("[MemoryLoader] Failed to load behavioral patterns:", err);
  }
  return [];
}

export async function recordBehavioralPattern(pattern: string): Promise<void> {
  const patterns = loadBehavioralPatterns();
  const existing = patterns.find((p) => p.pattern === pattern);

  if (existing) {
    existing.count++;
    existing.confidence = Math.min(1.0, existing.confidence + 0.1);
    existing.lastObserved = new Date().toISOString();
  } else {
    patterns.push({
      pattern,
      confidence: 0.5,
      lastObserved: new Date().toISOString(),
      count: 1,
    });
  }

  try {
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
    await writeFile(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
  } catch (err) {
    console.error("[MemoryLoader] Failed to save behavioral pattern:", err);
  }
}

function formatBehavioralPatterns(): string {
  const patterns = loadBehavioralPatterns();
  if (patterns.length === 0) return "";

  const strong = patterns.filter((p) => p.confidence >= 0.6);
  if (strong.length === 0) return "";

  const lines = strong.map((p) => `- ${p.pattern} (observed ${p.count}x)`);
  return `LEARNED BEHAVIORAL PATTERNS:\n${lines.join("\n")}`;
}

// ─── MAIN: Build full memory context ─────────────────────────

export function buildFullMemoryContext(): string {
  const parts: string[] = [];

  // 1. Master Memory (Danny's identity, business, projects, agents, tasks)
  const master = loadMasterMemory();
  if (master) {
    parts.push("\n\n--- MASTER MEMORY (Danny's full context) ---\n" + master);
  }

  // 2. Project State (current JARVIS build phase)
  const projectState = loadProjectState();
  if (projectState) {
    parts.push("\n\n--- JARVIS BUILD STATE ---\n" + projectState);
  }

  // 3. Conversation summaries (what happened in recent days)
  const convSummaries = formatConversationSummaries();
  if (convSummaries) {
    parts.push("\n\n" + convSummaries);
  }

  // 4. Behavioral patterns (learned preferences)
  const behavior = formatBehavioralPatterns();
  if (behavior) {
    parts.push("\n\n" + behavior);
  }

  // 5. Current date/time
  parts.push(`\n\nCURRENT DATE/TIME: ${new Date().toLocaleString("en-CA", { timeZone: "America/Vancouver" })}`);

  return parts.join("");
}
