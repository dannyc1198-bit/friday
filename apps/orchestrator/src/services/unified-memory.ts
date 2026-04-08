// Unified Memory Bridge — Single memory layer for the entire FRIDAY system
//
// Reads/writes both Jarvis local memory AND OpenClaw workspace memory.
// Every agent in the system (FRIDAY, NEXUS, BUILDER, CREATOR, PULSE)
// shares one memory — what one learns, all know.
//
// Architecture:
//   FRIDAY local memory  ←→  UnifiedMemory  ←→  OpenClaw workspace memory
//   (data/memory.json)                          (~/.openclaw/workspace/MEMORY.md)
//
// The learning engine feeds into this. Pattern recognition and outcome
// tracking all write through this layer.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, normalize } from "path";
import { memoryService } from "./memory/index.js";

// ─── Paths ──────────────────────────────────────────────────────
const USER_HOME = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368";
const FRIDAY_DATA = join(USER_HOME, "jarvis", "apps", "orchestrator", "data");
const OPENCLAW_WORKSPACE = join(USER_HOME, ".openclaw", "workspace");
const OPENCLAW_MEMORY = join(USER_HOME, ".openclaw", "memory");
const UNIFIED_STORE = join(FRIDAY_DATA, "unified-memory.json");

// ─── Types ──────────────────────────────────────────────────────

export interface UnifiedMemoryEntry {
  id: string;
  source: "friday" | "openclaw" | "learning" | "agent";
  agent?: string;            // Which agent created this (FRIDAY, NEXUS, BUILDER, etc.)
  category: "fact" | "preference" | "outcome" | "pattern" | "insight" | "interaction";
  content: string;
  tags: string[];
  importance: "low" | "medium" | "high" | "critical";
  confidence: number;        // 0.0 - 1.0 — decays over time, reinforced by repetition
  createdAt: string;
  updatedAt: string;
  accessCount: number;       // How many times this memory has been retrieved
  lastAccessedAt?: string;
}

export interface UnifiedMemoryStore {
  version: number;
  lastSync: string;
  entries: UnifiedMemoryEntry[];
  stats: {
    totalEntries: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    lastLearningCycle: string;
  };
}

// ─── Unified Memory Service ─────────────────────────────────────

class UnifiedMemoryService {
  private store: UnifiedMemoryStore;
  private dirty = false;

  constructor() {
    this.store = this.loadStore();
  }

  // ─── Core Operations ──────────────────────────────────────────

  /** Store a new memory entry */
  store_entry(entry: Omit<UnifiedMemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount">): string {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const fullEntry: UnifiedMemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
    };

    // Deduplicate: if very similar content exists, reinforce instead of adding
    const existing = this.findSimilar(entry.content, 0.9);
    if (existing) {
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
      existing.accessCount++;
      existing.updatedAt = now;
      if (entry.importance === "critical" || entry.importance === "high") {
        existing.importance = entry.importance;
      }
      this.dirty = true;
      this.save();
      return existing.id;
    }

    this.store.entries.push(fullEntry);
    this.updateStats();
    this.dirty = true;
    this.save();
    return id;
  }

  /** Search memories by content keywords */
  search(query: string, limit = 10): UnifiedMemoryEntry[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    const scored = this.store.entries
      .map(entry => {
        const text = `${entry.content} ${entry.tags.join(" ")}`.toLowerCase();
        let score = 0;
        for (const word of words) {
          if (text.includes(word)) score++;
        }
        // Boost by importance
        if (entry.importance === "critical") score *= 2;
        else if (entry.importance === "high") score *= 1.5;
        // Boost by confidence
        score *= entry.confidence;
        // Recency boost (last 7 days)
        const age = Date.now() - new Date(entry.updatedAt).getTime();
        if (age < 7 * 24 * 60 * 60 * 1000) score *= 1.2;
        return { entry, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Update access tracking
    const now = new Date().toISOString();
    for (const { entry } of scored) {
      entry.accessCount++;
      entry.lastAccessedAt = now;
    }
    if (scored.length > 0) this.save();

    return scored.map(s => s.entry);
  }

  /** Get memories by category */
  getByCategory(category: UnifiedMemoryEntry["category"], limit = 20): UnifiedMemoryEntry[] {
    return this.store.entries
      .filter(e => e.category === category)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  /** Get memories by agent */
  getByAgent(agent: string, limit = 20): UnifiedMemoryEntry[] {
    return this.store.entries
      .filter(e => e.agent === agent)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  /** Get high-importance memories for context injection */
  getContextMemories(currentMessage: string, limit = 5): UnifiedMemoryEntry[] {
    // Combine keyword search with high-importance recall
    const searchResults = this.search(currentMessage, limit);
    const critical = this.store.entries
      .filter(e => e.importance === "critical" && e.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    // Merge and deduplicate
    const seen = new Set<string>();
    const merged: UnifiedMemoryEntry[] = [];
    for (const entry of [...critical, ...searchResults]) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }
    return merged.slice(0, limit);
  }

  /** Build context string for LLM prompt injection */
  buildContextForPrompt(currentMessage: string): string {
    const memories = this.getContextMemories(currentMessage, 5);
    if (memories.length === 0) return "";

    const lines = memories.map(m => {
      const agentTag = m.agent ? ` [${m.agent}]` : "";
      return `- ${m.content}${agentTag} (${m.category}, confidence: ${(m.confidence * 100).toFixed(0)}%)`;
    });

    return `\n\nRELEVANT MEMORIES:\n${lines.join("\n")}`;
  }

  // ─── OpenClaw Sync ────────────────────────────────────────────

  /** Sync with OpenClaw workspace memory */
  syncWithOpenClaw(): { imported: number; exported: number } {
    let imported = 0;
    let exported = 0;

    // Import from OpenClaw workspace MEMORY.md
    try {
      const memoryMdPath = join(OPENCLAW_WORKSPACE, "MEMORY.md");
      if (existsSync(memoryMdPath)) {
        const content = readFileSync(memoryMdPath, "utf-8");
        const entries = this.parseOpenClawMemory(content);
        for (const entry of entries) {
          const exists = this.findSimilar(entry.content, 0.85);
          if (!exists) {
            this.store_entry(entry);
            imported++;
          }
        }
      }
    } catch (error) {
      console.warn("[UnifiedMemory] Failed to import OpenClaw workspace:", error);
    }

    // Import from OpenClaw memory directory (individual files)
    try {
      if (existsSync(OPENCLAW_MEMORY)) {
        const files = readdirSync(OPENCLAW_MEMORY).filter((f: string) => f.endsWith(".json"));
        for (const file of files) {
          try {
            const data = JSON.parse(readFileSync(join(OPENCLAW_MEMORY, file), "utf-8"));
            if (data.content && typeof data.content === "string") {
              const exists = this.findSimilar(data.content, 0.85);
              if (!exists) {
                this.store_entry({
                  source: "openclaw",
                  agent: data.agent || "unknown",
                  category: data.category || "fact",
                  content: data.content,
                  tags: data.tags || [],
                  importance: data.importance || "medium",
                  confidence: data.confidence || 0.7,
                });
                imported++;
              }
            }
          } catch { /* skip malformed files */ }
        }
      }
    } catch (error) {
      console.warn("[UnifiedMemory] Failed to import OpenClaw memory dir:", error);
    }

    // Export critical FRIDAY memories to OpenClaw workspace
    try {
      const fridayMemories = this.store.entries
        .filter(e => e.source === "friday" && (e.importance === "high" || e.importance === "critical"))
        .slice(0, 50);

      if (fridayMemories.length > 0 && existsSync(OPENCLAW_WORKSPACE)) {
        const exportPath = join(OPENCLAW_WORKSPACE, "friday-shared-memory.json");
        writeFileSync(exportPath, JSON.stringify({
          source: "friday",
          syncedAt: new Date().toISOString(),
          entries: fridayMemories,
        }, null, 2), "utf-8");
        exported = fridayMemories.length;
      }
    } catch (error) {
      console.warn("[UnifiedMemory] Failed to export to OpenClaw:", error);
    }

    this.store.lastSync = new Date().toISOString();
    this.save();

    console.log(`[UnifiedMemory] Sync complete: imported ${imported}, exported ${exported}`);
    return { imported, exported };
  }

  // ─── Maintenance ──────────────────────────────────────────────

  /** Decay confidence of old, unaccessed memories */
  decayOldMemories(): number {
    let decayed = 0;
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    for (const entry of this.store.entries) {
      const age = now - new Date(entry.updatedAt).getTime();
      if (age > thirtyDays && entry.accessCount === 0 && entry.importance !== "critical") {
        entry.confidence = Math.max(0.1, entry.confidence - 0.1);
        decayed++;
      }
    }

    // Remove entries with very low confidence
    const before = this.store.entries.length;
    this.store.entries = this.store.entries.filter(e => e.confidence > 0.05);
    const removed = before - this.store.entries.length;

    if (decayed > 0 || removed > 0) {
      this.updateStats();
      this.save();
      console.log(`[UnifiedMemory] Decayed ${decayed} memories, removed ${removed} expired`);
    }

    return decayed;
  }

  /** Get stats about the unified memory */
  getStats(): UnifiedMemoryStore["stats"] {
    return { ...this.store.stats };
  }

  getAllEntries(): UnifiedMemoryEntry[] {
    return [...this.store.entries];
  }

  // ─── Internals ────────────────────────────────────────────────

  private findSimilar(content: string, threshold: number): UnifiedMemoryEntry | null {
    const words = new Set(content.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    if (words.size === 0) return null;

    for (const entry of this.store.entries) {
      const entryWords = new Set(entry.content.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      if (entryWords.size === 0) continue;

      const intersection = new Set([...words].filter(w => entryWords.has(w)));
      const union = new Set([...words, ...entryWords]);
      const similarity = intersection.size / union.size; // Jaccard similarity

      if (similarity >= threshold) {
        return entry;
      }
    }
    return null;
  }

  private parseOpenClawMemory(markdown: string): Array<Omit<UnifiedMemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount">> {
    const entries: Array<Omit<UnifiedMemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount">> = [];
    const lines = markdown.split("\n").filter(l => l.trim().startsWith("- "));

    for (const line of lines) {
      const content = line.replace(/^-\s*/, "").replace(/\[.*?\]\(.*?\)/, "").trim();
      if (content.length > 10) {
        entries.push({
          source: "openclaw",
          category: "fact",
          content,
          tags: ["openclaw-import"],
          importance: "medium",
          confidence: 0.7,
        });
      }
    }

    return entries;
  }

  private loadStore(): UnifiedMemoryStore {
    try {
      if (existsSync(UNIFIED_STORE)) {
        return JSON.parse(readFileSync(UNIFIED_STORE, "utf-8"));
      }
    } catch (error) {
      console.warn("[UnifiedMemory] Failed to load store, starting fresh:", error);
    }

    return {
      version: 1,
      lastSync: "",
      entries: [],
      stats: {
        totalEntries: 0,
        bySource: {},
        byCategory: {},
        lastLearningCycle: "",
      },
    };
  }

  private save(): void {
    try {
      if (!existsSync(FRIDAY_DATA)) {
        mkdirSync(FRIDAY_DATA, { recursive: true });
      }
      writeFileSync(UNIFIED_STORE, JSON.stringify(this.store, null, 2), "utf-8");
      this.dirty = false;
    } catch (error) {
      console.error("[UnifiedMemory] Failed to save:", error);
    }
  }

  private updateStats(): void {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const entry of this.store.entries) {
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }

    this.store.stats = {
      totalEntries: this.store.entries.length,
      bySource,
      byCategory,
      lastLearningCycle: this.store.stats.lastLearningCycle,
    };
  }
}

// Singleton export
export const unifiedMemory = new UnifiedMemoryService();
