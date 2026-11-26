import { createHash } from "crypto";
import { mkdirSync } from "fs";
import path from "path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { assertLocalVector } from "./local-embed.js";

export interface PortItemInput {
  source: string;
  externalId: string;
  title: string;
  content: string;
  kind: string;
  path?: string;
  metadata?: Record<string, unknown>;
}

export interface PortItemRow {
  rowid: number;
  id: string;
  source: string;
  externalId: string;
  title: string;
  content: string;
  kind: string;
  path: string;
  embeddingModel: string | null;
  dim: number | null;
  forgotten: number;
  contentHash: string;
  updatedAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS port_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS port_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'episode',
  path TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  embedding_model TEXT,
  dim INTEGER,
  forgotten INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_port_source_ext ON port_items(source, external_id);

CREATE VIRTUAL TABLE IF NOT EXISTS port_fts USING fts5(
  title,
  content,
  content='port_items',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS port_items_ai AFTER INSERT ON port_items BEGIN
  INSERT INTO port_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS port_items_ad AFTER DELETE ON port_items BEGIN
  INSERT INTO port_fts(port_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS port_items_au AFTER UPDATE ON port_items BEGIN
  INSERT INTO port_fts(port_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
  INSERT INTO port_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
`;

export function contentHash(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function itemId(source: string, externalId: string): string {
  return createHash("sha1").update(`${source}\n${externalId}`).digest("hex");
}

export function openPortDatabase(filePath: string): { db: Database.Database; vecLoaded: boolean } {
  if (filePath !== ":memory:") mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  let vecLoaded = true;
  try {
    sqliteVec.load(db);
  } catch {
    vecLoaded = false;
  }
  db.exec(SCHEMA);
  return { db, vecLoaded };
}

export function meta(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM port_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO port_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function upsertItem(db: Database.Database, item: PortItemInput): { rowid: number; changed: boolean } {
  const id = itemId(item.source, item.externalId);
  const hash = contentHash(item.content);
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT rowid as rowid, content_hash, forgotten FROM port_items WHERE id = ?").get(id) as
    | { rowid: number; content_hash: string; forgotten: number }
    | undefined;
  if (existing && existing.content_hash === hash && existing.forgotten === 0) {
    return { rowid: Number(existing.rowid), changed: false };
  }
  const metadata = JSON.stringify(item.metadata || {});
  if (existing) {
    db.prepare(
      `UPDATE port_items
       SET title = ?, content = ?, kind = ?, path = ?, metadata = ?, content_hash = ?,
           updated_at = ?, forgotten = 0, embedding_model = NULL, dim = NULL
       WHERE id = ?`
    ).run(item.title, item.content, item.kind, item.path || "", metadata, hash, now, id);
    clearVector(db, Number(existing.rowid));
    return { rowid: Number(existing.rowid), changed: true };
  }
  const result = db.prepare(
    `INSERT INTO port_items
      (id, source, external_id, title, content, kind, path, metadata, content_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, item.source, item.externalId, item.title, item.content, item.kind, item.path || "", metadata, hash, now);
  return { rowid: Number(result.lastInsertRowid), changed: true };
}

export function vecReady(db: Database.Database): { model: string; dim: number } | null {
  const dim = meta(db, "vec_dim");
  const model = meta(db, "vec_model");
  if (!dim || !model) return null;
  return { model, dim: Number(dim) };
}

export function ensureVecTable(db: Database.Database, model: string, dim: number): void {
  assertLocalVector(model, dim);
  const current = vecReady(db);
  if (!current) {
    db.exec(`CREATE VIRTUAL TABLE port_vec USING vec0(embedding float[${dim}] distance_metric=cosine)`);
    setMeta(db, "vec_dim", String(dim));
    setMeta(db, "vec_model", model);
    return;
  }
  if (current.dim !== dim || current.model !== model) {
    throw new Error(
      `Vector index is ${current.model} (${current.dim}). Refusing ${model} (${dim}). Reindex to rebuild this collection.`
    );
  }
}

export function resetVecTable(db: Database.Database, model: string, dim: number): void {
  assertLocalVector(model, dim);
  db.exec("DROP TABLE IF EXISTS port_vec");
  db.prepare("DELETE FROM port_meta WHERE key IN ('vec_dim', 'vec_model')").run();
  ensureVecTable(db, model, dim);
}

export function writeVector(db: Database.Database, rowid: number, model: string, vector: number[]): void {
  ensureVecTable(db, model, vector.length);
  db.prepare("UPDATE port_items SET embedding_model = ?, dim = ? WHERE rowid = ?").run(model, vector.length, rowid);
  db.prepare("DELETE FROM port_vec WHERE rowid = ?").run(BigInt(rowid));
  db.prepare("INSERT INTO port_vec (rowid, embedding) VALUES (?, ?)").run(BigInt(rowid), Float32Array.from(vector));
}

function clearVector(db: Database.Database, rowid: number): void {
  if (!vecReady(db)) return;
  db.prepare("DELETE FROM port_vec WHERE rowid = ?").run(BigInt(rowid));
}

export function ftsQuery(query: string): string | null {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1);
  if (words.length === 0) return null;
  return words.map((word) => `"${word.replace(/"/g, "")}"`).join(" OR ");
}

export function searchFts(
  db: Database.Database,
  query: string,
  sources: string[],
  limit: number
): Array<PortItemRow & { score: number }> {
  const match = ftsQuery(query);
  if (!match || sources.length === 0) return [];
  const placeholders = sources.map(() => "?").join(", ");
  const rows = db.prepare(
    `SELECT p.rowid as rowid, p.*, bm25(port_fts) as rank
     FROM port_fts
     JOIN port_items p ON p.rowid = port_fts.rowid
     WHERE port_fts MATCH ? AND p.forgotten = 0 AND p.source IN (${placeholders})
     ORDER BY rank
     LIMIT ?`
  ).all(match, ...sources, limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({ ...mapRow(row), score: 1 / (1 + Math.abs(Number(row.rank || 0))) }));
}

export function searchVec(
  db: Database.Database,
  vector: number[],
  sources: string[],
  limit: number
): Array<PortItemRow & { score: number }> {
  const ready = vecReady(db);
  if (!ready || vector.length !== ready.dim || sources.length === 0) return [];
  const hits = db.prepare(
    "SELECT rowid, distance FROM port_vec WHERE embedding MATCH ? AND k = ?"
  ).all(Float32Array.from(vector), limit) as Array<{ rowid: number | bigint; distance: number }>;
  const sourceSet = new Set(sources);
  const out: Array<PortItemRow & { score: number }> = [];
  const read = db.prepare("SELECT rowid as rowid, * FROM port_items WHERE rowid = ? AND forgotten = 0");
  for (const hit of hits) {
    const row = read.get(Number(hit.rowid)) as Record<string, unknown> | undefined;
    if (!row || !sourceSet.has(String(row.source))) continue;
    out.push({ ...mapRow(row), score: 1 - Number(hit.distance) });
  }
  return out;
}

export function rowsNeedingEmbed(db: Database.Database, model: string, dim: number): PortItemRow[] {
  return (
    db.prepare(
      `SELECT rowid as rowid, * FROM port_items
       WHERE forgotten = 0 AND (embedding_model IS NULL OR embedding_model != ? OR dim IS NULL OR dim != ?)`
    ).all(model, dim) as Array<Record<string, unknown>>
  ).map(mapRow);
}

export function forgetById(db: Database.Database, id: string): PortItemRow | undefined {
  const row = db.prepare("SELECT rowid as rowid, * FROM port_items WHERE id = ? AND forgotten = 0").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return undefined;
  db.prepare("UPDATE port_items SET forgotten = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  clearVector(db, Number(row.rowid));
  return mapRow(row);
}

export function forgottenHashes(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT content_hash FROM port_items WHERE forgotten = 1").all() as Array<{ content_hash: string }>;
  return new Set(rows.map((row) => row.content_hash));
}

function mapRow(row: Record<string, unknown>): PortItemRow {
  return {
    rowid: Number(row.rowid),
    id: String(row.id),
    source: String(row.source),
    externalId: String(row.external_id),
    title: String(row.title || ""),
    content: String(row.content || ""),
    kind: String(row.kind || "episode"),
    path: String(row.path || ""),
    embeddingModel: row.embedding_model ? String(row.embedding_model) : null,
    dim: row.dim == null ? null : Number(row.dim),
    forgotten: Number(row.forgotten || 0),
    contentHash: String(row.content_hash || ""),
    updatedAt: String(row.updated_at || ""),
  };
}
