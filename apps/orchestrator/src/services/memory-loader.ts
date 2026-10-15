// Memory Loader — Loads all persistent memory sources into the LLM context
// Sources: Obsidian FRIDAY_BRAIN/, project state, conversation summaries, behavioral patterns

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import { DATA_DIR, REPO_ROOT, localDateKey } from "./runtime-paths.js";

import { getBrainDir } from "./vault-config.js";

// ─── OBSIDIAN BRAIN (Danny's living second brain) ────────────
// Replaces MASTER_MEMORY.md as of 2026-05-04. Source of truth lives in
// the Obsidian vault under FRIDAY_BRAIN/. Every .md file there is
// concatenated into the system prompt. Edit those notes to teach FRIDAY.

let cachedBrain: string | null = null;
let brainLastLoaded = 0;
const BRAIN_CACHE_MS = 60_000; // Re-read every 60s — Danny edits notes live

function loadObsidianBrain(): string {
  const now = Date.now();
  if (cachedBrain && now - brainLastLoaded < BRAIN_CACHE_MS) {
    return cachedBrain;
  }

  if (!existsSync(getBrainDir())) {
    cachedBrain = "";
    brainLastLoaded = now;
    return "";
  }

  try {
    const files = readdirSync(getBrainDir())
      .filter((f) => f.endsWith(".md"))
      .sort();

    const sections: string[] = [];
    for (const f of files) {
      const full = join(getBrainDir(), f);
      try {
        const raw = readFileSync(full, "utf-8").trim();
        if (!raw) continue;
        const title = basename(f, ".md");
        sections.push(`# ${title}\n\n${raw}`);
      } catch {
        continue;
      }
    }

    cachedBrain = sections.join("\n\n---\n\n");
    brainLastLoaded = now;
    console.log(`[MemoryLoader] Loaded Obsidian brain: ${files.length} note(s), ${cachedBrain.length} chars`);
    return cachedBrain;
  } catch (err) {
    console.error("[MemoryLoader] Failed to read FRIDAY_BRAIN:", err);
    cachedBrain = "";
    brainLastLoaded = now;
    return "";
  }
}

// ─── PROJECT STATE (.planning/STATE.md) ──────────────────────

let cachedProjectState: string | null = null;
let projectStateLastLoaded = 0;

function loadProjectState(): string {
  const now = Date.now();
  if (cachedProjectState && now - projectStateLastLoaded < BRAIN_CACHE_MS) {
    return cachedProjectState;
  }

  const statePath = join(REPO_ROOT, ".planning", "STATE.md");
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
  const today = localDateKey();

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

// ─── 30-day persistent facts (memory_save tool writes here) ──
// Auto-inject every fact saved in the last 30 days, so Lily has standing
// awareness of recent things Danny told her without needing to call
// memory_search. Older facts stay searchable on demand.

const MEMORY_RETENTION_DAYS = parseInt(process.env.MEMORY_RETENTION_DAYS || "30", 10);
const MEMORY_FILE = join(DATA_DIR, "memory.json");

function loadRecentFacts(days: number): string {
  if (!existsSync(MEMORY_FILE)) return "";
  try {
    const raw = readFileSync(MEMORY_FILE, "utf-8");
    const store = JSON.parse(raw) as { memories: Array<{ content: string; tags: string[]; createdAt: string }> };
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = (store.memories || []).filter((m) => new Date(m.createdAt).getTime() >= cutoff);
    if (recent.length === 0) return "";
    // Newest first — let the model see the freshest context at the top.
    recent.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lines = recent.map((m) => {
      const when = new Date(m.createdAt).toISOString().slice(0, 10);
      const tags = m.tags?.length ? ` [${m.tags.join(", ")}]` : "";
      return `- ${when}${tags} ${m.content}`;
    });
    return `RECENT FACTS (last ${days} days — ${recent.length} entries — you remember these without needing to search):\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// ─── MAIN: Build full memory context ─────────────────────────

export function buildFullMemoryContext(): string {
  const parts: string[] = [];

  // 1. Obsidian brain (Danny's living second brain — FRIDAY_BRAIN/*.md)
  const brain = loadObsidianBrain();
  if (brain) {
    parts.push("\n\n--- DANNY'S SECOND BRAIN (Obsidian → FRIDAY_BRAIN/) ---\n" + brain);
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

  // 5. Recent saved facts (30-day rolling window — auto-injected)
  const recentFacts = loadRecentFacts(MEMORY_RETENTION_DAYS);
  if (recentFacts) {
    parts.push("\n\n" + recentFacts);
  }

  // 6. Current date/time
  parts.push(`\n\nCURRENT DATE/TIME: ${new Date().toLocaleString("en-CA", { timeZone: "America/Vancouver" })}`);

  return parts.join("");
}
