// Memory System for JARVIS — Phase 2, Step 2.5
// JSON file-based memory: save facts, search, recall, update, delete
// Spec: memory_save, memory_search, memory_get_recent, memory_delete, memory_update
// Replaces ChromaDB dependency with simple keyword matching

import { promises as fs } from "fs";
import path from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

// ─── Interfaces ──────────────────────────────────────────────

export interface Memory {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  accessCount: number;
  lastAccessed: string;
}

interface MemoryStore {
  memories: Memory[];
  lastUpdated: string;
}

// ─── Storage ─────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

// Cap to prevent unbounded growth (spec: security audit item)
const MAX_MEMORIES = 1000;

async function loadMemories(): Promise<MemoryStore> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(MEMORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { memories: [], lastUpdated: new Date().toISOString() };
  }
}

async function saveMemories(store: MemoryStore): Promise<void> {
  store.lastUpdated = new Date().toISOString();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MEMORY_FILE, JSON.stringify(store, null, 2));
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ─── Search Helper ───────────────────────────────────────────
// Simple keyword matching: splits query into words, scores by
// how many words appear in the memory content + tags.
// Good enough for hundreds of memories. Upgrade to embeddings later.

function scoreMemory(memory: Memory, queryWords: string[]): number {
  const text = `${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
  let score = 0;
  for (const word of queryWords) {
    if (text.includes(word)) score++;
  }
  return score;
}

// ─── Tool Definitions ────────────────────────────────────────

const memorySaveTool: Tool = {
  name: "memory_save",
  description:
    "Save a fact, preference, or piece of information to long-term memory. Use this proactively when Danny mentions preferences, important facts, or things to remember.",
  category: "memory",
  parameters: [
    {
      name: "content",
      type: "string",
      description: "The fact or information to remember",
      required: true,
    },
    {
      name: "tags",
      type: "array",
      description:
        "Tags for categorization (e.g., ['preference', 'music'], ['fact', 'business'])",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadMemories();

    if (store.memories.length >= MAX_MEMORIES) {
      return {
        toolCallId: "",
        success: false,
        error: `Memory limit reached (${MAX_MEMORIES}). Delete old memories first.`,
      };
    }

    const content = params.content as string;
    if (!content || content.trim().length === 0) {
      return {
        toolCallId: "",
        success: false,
        error: "Memory content cannot be empty.",
      };
    }

    // Cap content length to prevent abuse
    if (content.length > 2000) {
      return {
        toolCallId: "",
        success: false,
        error: "Memory content too long (max 2000 characters).",
      };
    }

    const now = new Date().toISOString();
    const memory: Memory = {
      id: generateId(),
      content: content.trim(),
      tags: (params.tags as string[]) || [],
      createdAt: now,
      accessCount: 0,
      lastAccessed: now,
    };

    store.memories.push(memory);
    await saveMemories(store);

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Noted. Memory saved with ${memory.tags.length} tag(s). Total memories: ${store.memories.length}.`,
        memory,
      },
    };
  },
};

const memorySearchTool: Tool = {
  name: "memory_search",
  description:
    "Search memories by keyword. Returns the most relevant matches based on content and tags.",
  category: "memory",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query — keywords or phrase to find",
      required: true,
    },
    {
      name: "limit",
      type: "number",
      description: "Max results to return (default: 5, max: 20)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadMemories();
    const query = (params.query as string).toLowerCase();
    const limit = Math.min(Math.max(1, (params.limit as number) || 5), 20);
    const queryWords = query.split(/\s+/).filter((w) => w.length > 1);

    if (queryWords.length === 0) {
      return {
        toolCallId: "",
        success: false,
        error: "Search query too short.",
      };
    }

    // Score all memories and sort by relevance
    const scored = store.memories
      .map((m) => ({ memory: m, score: scoreMemory(m, queryWords) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Update access counts for returned memories
    for (const { memory } of scored) {
      memory.accessCount++;
      memory.lastAccessed = new Date().toISOString();
    }
    if (scored.length > 0) {
      await saveMemories(store);
    }

    return {
      toolCallId: "",
      success: true,
      data: {
        message:
          scored.length > 0
            ? `Found ${scored.length} matching memor${scored.length === 1 ? "y" : "ies"}.`
            : `No memories found matching "${params.query}".`,
        memories: scored.map((s) => s.memory),
        count: scored.length,
      },
    };
  },
};

const memoryGetRecentTool: Tool = {
  name: "memory_get_recent",
  description:
    "Get the most recently saved memories. Useful for reviewing what JARVIS has been told lately.",
  category: "memory",
  parameters: [
    {
      name: "limit",
      type: "number",
      description: "Number of recent memories to return (default: 10, max: 50)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadMemories();
    const limit = Math.min(Math.max(1, (params.limit as number) || 10), 50);

    // Sort by createdAt descending, take limit
    const recent = [...store.memories]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, limit);

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `${recent.length} recent memor${recent.length === 1 ? "y" : "ies"} (of ${store.memories.length} total).`,
        memories: recent,
        count: recent.length,
        totalMemories: store.memories.length,
      },
    };
  },
};

const memoryDeleteTool: Tool = {
  name: "memory_delete",
  description: "Delete a memory by its ID.",
  category: "memory",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "Memory ID (starts with mem_)",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadMemories();
    const id = params.id as string;
    const idx = store.memories.findIndex((m) => m.id === id);

    if (idx === -1) {
      return {
        toolCallId: "",
        success: false,
        error: `Memory not found: "${id}"`,
      };
    }

    const removed = store.memories.splice(idx, 1)[0];
    await saveMemories(store);

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Deleted memory: "${removed.content.substring(0, 60)}${removed.content.length > 60 ? "..." : ""}"`,
        memory: removed,
      },
    };
  },
};

const memoryUpdateTool: Tool = {
  name: "memory_update",
  description:
    "Update an existing memory's content or tags.",
  category: "memory",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "Memory ID (starts with mem_)",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "New content (optional)",
      required: false,
    },
    {
      name: "tags",
      type: "array",
      description: "New tags (optional, replaces existing tags)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadMemories();
    const id = params.id as string;
    const memory = store.memories.find((m) => m.id === id);

    if (!memory) {
      return {
        toolCallId: "",
        success: false,
        error: `Memory not found: "${id}"`,
      };
    }

    if (params.content) {
      const newContent = (params.content as string).trim();
      if (newContent.length > 2000) {
        return {
          toolCallId: "",
          success: false,
          error: "Memory content too long (max 2000 characters).",
        };
      }
      memory.content = newContent;
    }

    if (params.tags) {
      memory.tags = params.tags as string[];
    }

    await saveMemories(store);

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Updated memory "${memory.content.substring(0, 60)}${memory.content.length > 60 ? "..." : ""}"`,
        memory,
      },
    };
  },
};

// ─── Registration ────────────────────────────────────────────

export function registerMemoryTools(): void {
  toolRegistry.register(memorySaveTool);
  toolRegistry.register(memorySearchTool);
  toolRegistry.register(memoryGetRecentTool);
  toolRegistry.register(memoryDeleteTool);
  toolRegistry.register(memoryUpdateTool);
}
