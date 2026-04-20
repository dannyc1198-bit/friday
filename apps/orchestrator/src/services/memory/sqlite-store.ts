// SQLite-backed memory store — canonical memory layer for FRIDAY.
//
// Replaces ChromaDB (kept crashing) + file-based JSON (not indexed).
// Single SQLite file with two tables:
//   memories  — hot store with FTS5 virtual table for keyword search
//   vectors   — embeddings stored as BLOB, cosine similarity in JS
//
// Implements the existing MemoryClient interface so memory-service.ts
// can swap backends without code changes in call sites.
//
// Why BLOB + in-process cosine instead of a vector extension:
//   better-sqlite3 doesn't ship sqlite-vec on Windows. For <50k memories
//   (Danny will never hit that), scanning + cosine in Node is <50ms.
//   Zero native compilation, zero extra deps.

import Database from "better-sqlite3";
import type { Database as DB, Statement } from "better-sqlite3";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import type {
  MemoryDocument,
  MemorySearchResult,
  ChromaStatus,
} from "./types.js";

const HOME = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368";
const DB_DIR = join(HOME, "jarvis", "apps", "orchestrator", "data");
const DB_PATH = join(DB_DIR, "friday-memory.sqlite");

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function vecToBlob(vec: number[]): Buffer {
  const f = new Float32Array(vec);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

function blobToVec(buf: Buffer): Float32Array {
  return new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  );
}

class SqliteMemoryStore {
  private db: DB | null = null;
  private connected = false;
  private lastHealthCheck = new Date();

  private stInsert!: Statement;
  private stInsertVec!: Statement;
  private stDeleteByConv!: Statement;
  private stDeleteOld!: Statement;
  private stAll!: Statement;
  private stCount!: Statement;

  connect(): Promise<boolean> {
    try {
      if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
      const db = new Database(DB_PATH);
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");

      db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          content TEXT NOT NULL,
          role TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          user_name TEXT,
          intent TEXT,
          tools_used TEXT,
          topics TEXT,
          sentiment TEXT,
          importance TEXT,
          source TEXT DEFAULT 'friday',
          tags TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );

        CREATE INDEX IF NOT EXISTS idx_memories_conv ON memories(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_memories_ts ON memories(timestamp);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);

        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          id UNINDEXED,
          content,
          content='memories',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, id, content)
            VALUES ('delete', old.rowid, old.id, old.content);
        END;

        CREATE TABLE IF NOT EXISTS vectors (
          memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
          embedding BLOB NOT NULL
        );
      `);

      this.stInsert = db.prepare(`
        INSERT OR REPLACE INTO memories
          (id, conversation_id, content, role, timestamp, user_name, intent, tools_used, topics, sentiment, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      this.stInsertVec = db.prepare(
        "INSERT OR REPLACE INTO vectors (memory_id, embedding) VALUES (?, ?)"
      );
      this.stDeleteByConv = db.prepare(
        "DELETE FROM memories WHERE conversation_id = ?"
      );
      this.stDeleteOld = db.prepare(
        "DELETE FROM memories WHERE timestamp < ?"
      );
      this.stAll = db.prepare(`
        SELECT m.*, v.embedding as emb
        FROM memories m
        LEFT JOIN vectors v ON v.memory_id = m.id
      `);
      this.stCount = db.prepare("SELECT COUNT(*) as n FROM memories");

      this.db = db;
      this.connected = true;
      const count = (this.stCount.get() as { n: number }).n;
      console.log(`[SqliteMemory] Connected. ${count} memories in store.`);
      return Promise.resolve(true);
    } catch (err) {
      console.error("[SqliteMemory] Connect failed:", err);
      this.connected = false;
      return Promise.resolve(false);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStatus(): ChromaStatus {
    const count = this.connected
      ? (this.stCount.get() as { n: number }).n
      : 0;
    return {
      connected: this.connected,
      host: "local",
      port: 0,
      collection: "friday-memory",
      documentCount: count,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  async addDocuments(
    documents: MemoryDocument[],
    embeddings: number[][]
  ): Promise<void> {
    if (!this.db) throw new Error("SqliteMemory not connected");

    const tx = this.db.transaction((docs: MemoryDocument[], embs: number[][]) => {
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const m = d.metadata;
        this.stInsert.run(
          d.id,
          d.conversationId,
          d.content,
          d.role,
          d.timestamp.getTime(),
          m.userName || null,
          m.intent || null,
          m.toolsUsed ? JSON.stringify(m.toolsUsed) : null,
          m.topics ? JSON.stringify(m.topics) : null,
          m.sentiment || null,
          m.importance || "medium"
        );
        if (embs[i] && embs[i].length > 0) {
          this.stInsertVec.run(d.id, vecToBlob(embs[i]));
        }
      }
    });

    tx(documents, embeddings);
  }

  async queryByEmbedding(
    embedding: number[],
    limit: number,
    where?: Record<string, unknown>
  ): Promise<MemorySearchResult[]> {
    if (!this.db) return [];

    const q = new Float32Array(embedding);
    const rows = this.stAll.all() as Array<{
      id: string;
      conversation_id: string;
      content: string;
      role: "user" | "assistant";
      timestamp: number;
      user_name: string | null;
      intent: string | null;
      tools_used: string | null;
      topics: string | null;
      sentiment: string | null;
      importance: string | null;
      emb: Buffer | null;
    }>;

    const scored: MemorySearchResult[] = [];
    for (const r of rows) {
      if (!r.emb) continue;
      if (where) {
        if (where.role && r.role !== where.role) continue;
        if (where.conversationId && r.conversation_id !== where.conversationId)
          continue;
      }
      const sim = cosine(q, blobToVec(r.emb));
      scored.push({
        document: {
          id: r.id,
          conversationId: r.conversation_id,
          content: r.content,
          role: r.role,
          timestamp: new Date(r.timestamp),
          metadata: {
            userName: r.user_name || undefined,
            intent: r.intent || undefined,
            toolsUsed: r.tools_used ? JSON.parse(r.tools_used) : undefined,
            topics: r.topics ? JSON.parse(r.topics) : undefined,
            sentiment: (r.sentiment as "positive" | "neutral" | "negative") || undefined,
            importance: (r.importance as "low" | "medium" | "high") || undefined,
          },
        },
        similarity: sim,
        distance: 1 - sim,
      });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  async deleteByConversationId(conversationId: string): Promise<number> {
    if (!this.db) return 0;
    const result = this.stDeleteByConv.run(conversationId);
    return result.changes;
  }

  async deleteOldDocuments(retentionDays: number): Promise<number> {
    if (!this.db) return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const result = this.stDeleteOld.run(cutoff);
    return result.changes;
  }

  async healthCheck(): Promise<boolean> {
    this.lastHealthCheck = new Date();
    return this.connected && this.db !== null;
  }

  searchKeyword(query: string, limit = 20): MemoryDocument[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(`
      SELECT m.* FROM memories_fts f
      JOIN memories m ON m.rowid = f.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank LIMIT ?
    `);
    const rows = stmt.all(query, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      conversationId: r.conversation_id as string,
      content: r.content as string,
      role: r.role as "user" | "assistant",
      timestamp: new Date(r.timestamp as number),
      metadata: {
        userName: (r.user_name as string) || undefined,
        intent: (r.intent as string) || undefined,
        toolsUsed: r.tools_used ? JSON.parse(r.tools_used as string) : undefined,
        topics: r.topics ? JSON.parse(r.topics as string) : undefined,
        sentiment: (r.sentiment as "positive" | "neutral" | "negative") || undefined,
        importance: (r.importance as "low" | "medium" | "high") || undefined,
      },
    }));
  }

  getRawDb(): DB | null {
    return this.db;
  }
}

export const sqliteMemoryStore = new SqliteMemoryStore();
