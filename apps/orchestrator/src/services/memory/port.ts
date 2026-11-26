import os from "os";
import path from "path";
import { searchBrain } from "../brain.js";
import { proactiveMonitor } from "../proactive-monitor.js";
import { DATA_DIR } from "../runtime-paths.js";
import { getObsidianVaultPath } from "../vault-config.js";
import { sqliteMemoryDbPath } from "./sqlite-store.js";
import { contentHash, forgottenHashes, forgetById, openPortDatabase, searchFts, searchVec, upsertItem, vecReady, writeVector, resetVecTable, meta, setMeta } from "./port-db.js";
import type { PortItemInput } from "./port-db.js";
import { ollamaEmbedder, type LocalEmbedder } from "./local-embed.js";
import { collectVault, headingChunks, writeNote, type WriteFolder } from "./sources/obsidian.js";
import { collectFiles, defaultFileRoots, listFolder, pathAllowed } from "./sources/files-readonly.js";
import { collectSocial, socialAccounts } from "./sources/social-readonly.js";
import { projectRecords, readProjects, saveProjects, suggestOneStep, isQuietHours, type Project } from "./sources/tracker.js";
import { recallChat } from "./sources/chat.js";
import { existsSync, readFileSync, watch } from "fs";
import { tasksFromStore } from "../task-store.js";

export type MemoryScope = "obsidian" | "files" | "social" | "tracker" | "chat";
export const MEMORY_SCOPES: MemoryScope[] = ["obsidian", "files", "social", "tracker", "chat"];

export interface RecallHit {
  id: string;
  source: MemoryScope;
  title: string;
  text: string;
  score: number;
  path?: string;
}

export interface SourceReport {
  id: string;
  ready: boolean;
  detail: string;
}

export interface MemoryPort {
  remember(input: { text: string; title?: string; folder?: WriteFolder; kind?: string }): Promise<{ path: string; id: string; duplicate: boolean }>;
  recall(query: string, scopes?: MemoryScope[] | "all", k?: number): Promise<RecallHit[]>;
  forget(target: string): Promise<{ forgotten: number; message: string }>;
  sources(): SourceReport[];
  reindex(): Promise<{ embedded: number; model: string; dim: number }>;
  indexAll(): Promise<{ notes: number; files: number; social: number; projects: number; embedError?: string }>;
  saveProjects(projects: Project[]): Promise<string>;
  nextStep(now?: Date): Promise<string | null>;
  listFolder(folder: string): { name: string; kind: "file" | "folder" }[];
  nudge(now?: Date): Promise<string | null>;
  close(): void;
}

export interface PortOptions {
  dbPath?: string;
  vault?: string;
  fileRoots?: string[];
  embedder?: LocalEmbedder | null;
  extraExcludes?: string[];
  quietHours?: string;
}

export function openMemoryPort(options: PortOptions = {}): MemoryPort {
  const dbPath = options.dbPath || sqliteMemoryDbPath();
  const vault = options.vault || getObsidianVaultPath();
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  const fileRoots = options.fileRoots || defaultFileRoots(home);
  const embedder = options.embedder === undefined ? ollamaEmbedder() : options.embedder;
  const opened = openPortDatabase(dbPath);
  const db = opened.db;
  let embedError = opened.vecLoaded ? "" : "sqlite-vec did not load; keyword search still works.";

  async function storeItems(items: PortItemInput[]): Promise<number> {
    const changed: number[] = [];
    const tx = db.transaction((rows: PortItemInput[]) => {
      for (const item of rows) {
        const saved = upsertItem(db, item);
        if (saved.changed) changed.push(saved.rowid);
      }
    });
    tx(items);
    if (changed.length > 0) {
      const error = await embedRows(changed);
      if (error) embedError = error;
    }
    return items.length;
  }

  async function embedRows(rowids: number[]): Promise<string | undefined> {
    if (!embedder || rowids.length === 0) return undefined;
    const read = db.prepare("SELECT rowid as rowid, content FROM port_items WHERE rowid = ?");
    const rows = rowids
      .map((rowid) => read.get(rowid) as { rowid: number; content: string } | undefined)
      .filter((row): row is { rowid: number; content: string } => Boolean(row));
    try {
      const embedded = await embedder(rows.map((row) => row.content.slice(0, 2000)));
      if (!embedded.vectors.length) return undefined;
      const current = vecReady(db);
      if (current && (current.dim !== embedded.dim || current.model !== embedded.model)) {
        return `Embeddings are ${embedded.model} (${embedded.dim}); the index is ${current.model} (${current.dim}). Run reindex.`;
      }
      for (let i = 0; i < rows.length; i++) {
        writeVector(db, rows[i].rowid, embedded.model, embedded.vectors[i]);
      }
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Embedding failed.";
    }
  }

  return {
    async remember(input) {
      const text = input.text.trim();
      if (!text) throw new Error("Nothing to remember.");
      if (text.length > 4000) throw new Error("That is too long to store (max 4000 characters).");
      const title = (input.title || text.split("\n")[0]).slice(0, 80);
      const body = `# ${title}\n\n${text}\n`;
      const chunks = headingChunks(body);
      const primary = chunks[0]?.text || text;
      const existing = db.prepare(
        "SELECT id, path FROM port_items WHERE source = 'obsidian' AND content_hash = ? AND forgotten = 0"
      ).get(contentHash(primary)) as { id: string; path: string } | undefined;
      if (existing) return { path: existing.path, id: existing.id, duplicate: true };
      const written = await writeNote({
        vault,
        title,
        folder: input.folder || "Jarvis",
        body,
        mode: "create",
      });
      await storeItems(chunks.map((chunk, index) => ({
        source: "obsidian",
        externalId: `${written.relativePath}#${index}`,
        title: chunk.heading || title,
        content: chunk.text,
        kind: input.kind || "fact",
        path: written.relativePath,
        metadata: { tags: chunk.tags, wikilinks: chunk.links },
      })));
      const row = db.prepare("SELECT id FROM port_items WHERE path = ? AND forgotten = 0 ORDER BY rowid DESC LIMIT 1").get(written.relativePath) as { id: string } | undefined;
      return { path: written.relativePath, id: row?.id || "", duplicate: false };
    },

    async recall(query, scopes = "all", k = 5) {
      const selected = scopes === "all" ? MEMORY_SCOPES : scopes;
      const limit = Math.min(Math.max(1, k), 20);
      const hits: RecallHit[] = [];
      const indexed = selected.filter((scope) => scope !== "chat");
      for (const row of searchFts(db, query, indexed, limit * 3)) {
        hits.push({ id: row.id, source: row.source as MemoryScope, title: row.title, text: row.content.slice(0, 400), score: row.score, path: row.path });
      }
      if (embedder && opened.vecLoaded) {
        try {
          const embedded = await embedder([query]);
          const vector = embedded.vectors[0];
          if (vector) {
            for (const row of searchVec(db, vector, indexed, limit * 3)) {
              hits.push({ id: row.id, source: row.source as MemoryScope, title: row.title, text: row.content.slice(0, 400), score: row.score + 0.15, path: row.path });
            }
          }
        } catch (error) {
          embedError = error instanceof Error ? error.message : "Embedding failed.";
        }
      }
      if (selected.includes("obsidian")) {
        const forgotten = forgottenHashes(db);
        for (const hit of searchBrain(query, limit)) {
          if (forgotten.has(contentHash(hit.snippet))) continue;
          hits.push({
            id: `brain:${hit.notePath}:${hit.heading}`,
            source: "obsidian",
            title: hit.noteName,
            text: hit.snippet,
            score: Math.min(1, hit.score / 10),
            path: hit.notePath,
          });
        }
      }
      if (selected.includes("chat")) {
        for (const hit of recallChat(query, limit)) {
          hits.push({ id: hit.id, source: "chat", title: hit.title, text: hit.text, score: hit.score });
        }
      }
      const best = new Map<string, RecallHit>();
      for (const hit of hits) {
        const key = `${hit.source}:${hit.path || ""}:${hit.text.slice(0, 80)}`;
        const previous = best.get(key);
        if (!previous || previous.score < hit.score) best.set(key, hit);
      }
      return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    },

    async forget(target) {
      const direct = forgetById(db, target.trim());
      if (direct) return { forgotten: 1, message: `Forgot the index entry for ${direct.title}. The note is still in the vault.` };
      const hits = searchFts(db, target, MEMORY_SCOPES, 3);
      if (hits.length === 0) return { forgotten: 0, message: "I don't have an index entry that matches that." };
      if (hits.length > 1 && hits[1].score > hits[0].score * 0.85) {
        return { forgotten: 0, message: `I found more than one. The closest is ${hits[0].id}: ${hits[0].title}` };
      }
      forgetById(db, hits[0].id);
      return { forgotten: 1, message: `Forgot the index entry for ${hits[0].title}. The note is still in the vault.` };
    },

    sources() {
      const counts = (source: string) =>
        Number((db.prepare("SELECT COUNT(*) as n FROM port_items WHERE source = ? AND forgotten = 0").get(source) as { n: number }).n);
      const vec = vecReady(db);
      const accounts = socialAccounts();
      return [
        { id: "obsidian", ready: true, detail: `${counts("obsidian")} indexed sections. Vault notes stay the source of truth. brain_remember still writes FRIDAY_BRAIN/entities.` },
        { id: "files", ready: fileRoots.length > 0, detail: `${counts("files")} files indexed. Read-only.` },
        { id: "social", ready: accounts.some((account) => account.configured), detail: accounts.map((account) => `${account.platform}: ${account.configured ? "connected" : `needs ${account.missing.join(", ")}`}`).join("; ") },
        { id: "tracker", ready: true, detail: `${counts("tracker")} projects mirrored from Jarvis/Projects.md. Tasks stay in the task list.` },
        { id: "chat", ready: true, detail: "Keyword reads of chat SQLite and unified-memory.json. OpenAI vectors are not searched." },
        { id: "vectors", ready: Boolean(vec) && opened.vecLoaded, detail: vec ? `${vec.model} (${vec.dim})` : embedError || "no local vectors yet" },
      ];
    },

    async reindex() {
      if (!embedder) throw new Error("No local embedder is configured.");
      const pending = db.prepare("SELECT rowid as rowid, content FROM port_items WHERE forgotten = 0").all() as Array<{ rowid: number; content: string }>;
      if (pending.length === 0) return { embedded: 0, model: "nomic-embed-text", dim: 0 };
      const embedded = await embedder(pending.map((row) => row.content.slice(0, 2000)));
      const current = vecReady(db);
      if (!current || current.dim !== embedded.dim || current.model !== embedded.model) {
        resetVecTable(db, embedded.model, embedded.dim);
      }
      for (let i = 0; i < pending.length; i++) writeVector(db, pending[i].rowid, embedded.model, embedded.vectors[i]);
      return { embedded: pending.length, model: embedded.model, dim: embedded.dim };
    },

    async indexAll() {
      let notes = 0;
      let files = 0;
      let social = 0;
      let projects = 0;
      if (existsSync(vault)) notes = await storeItems(await collectVault(vault));
      const fileIndex = await collectFiles({ roots: fileRoots, extraExcludes: options.extraExcludes });
      files = await storeItems(fileIndex.items);
      const socialIndex = await collectSocial();
      social = await storeItems(socialIndex.items);
      projects = await storeItems(projectRecords(await readProjects(vault)));
      const taskFile = path.join(DATA_DIR, "tasks.json");
      if (existsSync(taskFile)) {
        try {
          const tasks = tasksFromStore(JSON.parse(readFileSync(taskFile, "utf8")));
          await storeItems(tasks.filter((task) => !task.completed).slice(0, 50).map((task) => ({
            source: "tracker",
            externalId: `task:${task.id}`,
            title: task.title,
            content: task.title,
            kind: "project",
            path: "tasks.json",
            metadata: { due: task.dueDate || "" },
          })));
        } catch {
          // A bad tasks file does not stop the rest of the index.
        }
      }
      return { notes, files, social, projects, embedError: embedError || undefined };
    },

    saveProjects(projects) {
      return saveProjects(vault, projects).then(async (relative) => {
        await storeItems(projectRecords(await readProjects(vault)));
        return relative;
      });
    },

    async nextStep(now) {
      const tasks = existsSync(path.join(DATA_DIR, "tasks.json"))
        ? tasksFromStore(JSON.parse(readFileSync(path.join(DATA_DIR, "tasks.json"), "utf8")))
        : [];
      return suggestOneStep({ projects: await readProjects(vault), tasks, now });
    },

    listFolder(folder) {
      const resolved = pathAllowed(fileRoots, folder) || fileRoots.map((root) => path.join(root, folder)).find((candidate) => pathAllowed(fileRoots, candidate));
      if (!resolved) throw new Error("That folder is outside the folders I am allowed to read.");
      return listFolder(fileRoots, resolved);
    },

    async nudge(now = new Date()) {
      const suggestion = await this.nextStep(now);
      if (!suggestion) return null;
      const quiet = options.quietHours || process.env.FRIDAY_QUIET_HOURS || "23:00-05:30";
      if (isQuietHours(now, quiet)) return null;
      const last = meta(db, "last_spoken_at");
      if (last && now.getTime() - Date.parse(last) < 6 * 60 * 60 * 1000) return null;
      setMeta(db, "last_spoken_at", now.toISOString());
      setMeta(db, "last_suggestion", suggestion);
      proactiveMonitor.queueAlert({ type: "system", priority: "low", title: "One next step", message: suggestion });
      return suggestion;
    },

    close() {
      db.close();
    },
  };
}

let singleton: MemoryPort | null = null;
let watcher: ReturnType<typeof watch> | null = null;
let nudgeTimer: ReturnType<typeof setInterval> | null = null;

export function getMemoryPort(): MemoryPort {
  if (!singleton) singleton = openMemoryPort();
  return singleton;
}

export function startMemoryBackground(): void {
  const port = getMemoryPort();
  const run = () => {
    port.indexAll().catch((error) => {
      console.warn(`[memory] index skipped: ${error instanceof Error ? error.message : "failed"}`);
    });
  };
  run();
  const vault = getObsidianVaultPath();
  if (existsSync(vault) && !watcher) {
    try {
      let pending: ReturnType<typeof setTimeout> | null = null;
      watcher = watch(vault, { recursive: true }, () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(run, 1500);
      });
    } catch {
      // Watching is optional. The index command and the next boot still catch up.
    }
  }
  if (!nudgeTimer) {
    nudgeTimer = setInterval(() => {
      port.nudge().catch(() => undefined);
    }, 6 * 60 * 60 * 1000);
    nudgeTimer.unref?.();
  }
}

export function stopMemoryBackground(): void {
  watcher?.close();
  watcher = null;
  if (nudgeTimer) clearInterval(nudgeTimer);
  nudgeTimer = null;
}
