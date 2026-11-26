import { existsSync, readFileSync } from "fs";
import path from "path";
import { sqliteMemoryStore } from "../sqlite-store.js";

export interface ChatHit {
  id: string;
  title: string;
  text: string;
  score: number;
}

function words(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1);
}

function scoreText(text: string, queryWords: string[]): number {
  if (queryWords.length === 0) return 0;
  const haystack = text.toLowerCase();
  const hits = queryWords.filter((word) => haystack.includes(word)).length;
  return hits / queryWords.length;
}

/**
 * Read adapters over the stores that already exist.
 * Keyword only. The OpenAI vectors in `vectors` are not read.
 */
export function recallChat(query: string, k: number, env: NodeJS.ProcessEnv = process.env): ChatHit[] {
  const queryWords = words(query);
  const hits: ChatHit[] = [];
  if (sqliteMemoryStore.isConnected()) {
    try {
      const match = queryWords.map((word) => `"${word}"`).join(" OR ");
      for (const doc of sqliteMemoryStore.searchKeyword(match, k)) {
        hits.push({ id: `chat:${doc.id}`, title: "chat", text: doc.content, score: 0.45 });
      }
    } catch {
      // A bad FTS query should not break recall.
    }
  }

  const home = env.USERPROFILE || env.HOME || "";
  const unified = path.join(home, "jarvis", "apps", "orchestrator", "data", "unified-memory.json");
  if (home && existsSync(unified)) {
    try {
      const parsed = JSON.parse(readFileSync(unified, "utf8")) as { entries?: Array<{ id?: string; content?: string }> };
      for (const entry of parsed.entries || []) {
        if (!entry.content) continue;
        const score = scoreText(entry.content, queryWords);
        if (score > 0) hits.push({ id: `unified:${entry.id || hits.length}`, title: "memory", text: entry.content, score });
      }
    } catch {
      // Unreadable unified memory is skipped. It is not copied into the port.
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}
