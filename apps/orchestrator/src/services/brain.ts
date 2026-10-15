// FRIDAY Brain — long-term mind over Danny's Obsidian vault.
//
// Architecture (stolen from the best of obsidian-copilot / smart-connections /
// basic-memory, 2026-06 research pass):
//   - Markdown is canonical. The vault IS the brain; this service is just an
//     index + a disciplined writer. Everything here is rebuildable from .md.
//   - Retrieval: MiniSearch BM25 over heading-chunked notes. Lexical-first —
//     zero model downloads, instant results, free. Embeddings can be layered
//     in later behind searchBrain() without touching callers.
//   - Write-back: entity notes in FRIDAY_BRAIN/entities/ using the
//     observation/relation format (one file per person/project/client/topic,
//     categorized fact bullets with "as of" dates, typed [[wikilink]]
//     relations). Renders natively in Obsidian's graph view.
//   - Learning: rememberFact() during chat + nightly reflection (reflection.ts)
//     both funnel through here. A small JSON journal feeds the frontend's
//     "what FRIDAY learned" panel.
//
// The FRIDAY_BRAIN root notes (00-who-i-am.md etc.) are ALWAYS injected into
// the prompt by memory-loader, so they're excluded from retrieval to avoid
// double-spending tokens on duplicated context.

import { promises as fs } from "fs";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import MiniSearch from "minisearch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { isInsideRoot } from "./safe-path.js";
import { getEntitiesDir, getObsidianVaultPath } from "./vault-config.js";

function vaultPath(): string {
  return getObsidianVaultPath();
}
function entitiesDir(): string {
  return getEntitiesDir();
}
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const JOURNAL_FILE = path.join(DATA_DIR, "brain-journal.json");

const IGNORED_DIRS = new Set([".obsidian", ".trash", "node_modules", ".smart-env", ".git"]);
const RESCAN_INTERVAL_MS = 5 * 60 * 1000; // incremental re-index every 5 min
const MIN_CHUNK_CHARS = 60;
const MAX_CHUNK_CHARS = 1800;

// ─── Types ──────────────────────────────────────────────────────

export interface BrainChunk {
  id: string;        // `${relPath}::${n}`
  notePath: string;  // vault-relative, forward slashes
  noteName: string;
  heading: string;   // nearest heading above the chunk ("" for preamble)
  text: string;
  asOf?: string | null;
  status?: string | null;
}

export interface BrainHit {
  notePath: string;
  noteName: string;
  heading: string;
  snippet: string;
  score: number;
  asOf?: string | null;
  status?: string | null;
}

export interface JournalEntry {
  at: string;          // ISO timestamp
  entity: string;
  type: string;
  observation: string;
  category: string;
  source: "chat" | "reflection" | "manual";
}

export interface BrainStats {
  notes: number;
  chunks: number;
  entities: number;
  lastIndexed: string | null;
  vaultPath: string;
}

// ─── Index state ────────────────────────────────────────────────

let mini = newIndex();
const fileState = new Map<string, { mtimeMs: number; chunkIds: string[] }>(); // relPath → state
let noteCount = 0;
let lastIndexed: string | null = null;
let rescanHandle: ReturnType<typeof setInterval> | null = null;

function newIndex(): MiniSearch<BrainChunk> {
  return new MiniSearch<BrainChunk>({
    fields: ["noteName", "heading", "text"],
    storeFields: ["notePath", "noteName", "heading", "text", "asOf", "status"],
    searchOptions: {
      boost: { noteName: 3, heading: 2 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: "OR",
    },
  });
}

// ─── Vault walking + chunking ───────────────────────────────────

async function walkVault(dir: string = vaultPath()): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    if (entry.isSymbolicLink()) continue; // FRIDAY_BRAIN/memory@ etc. — never follow
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkVault(full)));
    } else if (entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function relPath(absolute: string): string {
  return path.relative(vaultPath(), absolute).replace(/\\/g, "/");
}

/** True for FRIDAY_BRAIN root-level core notes — always in the prompt already. */
function isAlwaysLoadedCore(rel: string): boolean {
  return rel.startsWith("FRIDAY_BRAIN/") && !rel.slice("FRIDAY_BRAIN/".length).includes("/");
}

export function isArchivePath(notePath: string): boolean {
  return /(^|\/)archive\//i.test(notePath.replace(/\\/g, "/"));
}

export function isPendingKnowledgePath(notePath: string): boolean {
  const note = notePath.replace(/\\/g, "/");
  return /(^|\/)(proposals|drafts)\//i.test(note) || /pending-approval\.md$/i.test(note);
}

export function parseEvidence(raw: string): { asOf: string | null; status: string | null } {
  const front = raw.match(/^---\n([\s\S]*?)\n---/);
  const block = front?.[1] || "";
  const dated = block.match(/^(?:date|updated|as_of):\s*["']?(\d{4}-\d{2}-\d{2})/m);
  const status = block.match(/^status:\s*["']?([A-Za-z0-9_-]+)/m);
  const inline = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return {
    asOf: dated?.[1] || inline?.[1] || null,
    status: status?.[1] || null,
  };
}

/** Split a note into heading-scoped chunks (smart-connections style). */
export function chunkNote(rel: string, raw: string): BrainChunk[] {
  const noteName = path.basename(rel, ".md");
  const evidence = parseEvidence(raw);
  // Strip frontmatter — metadata isn't prose worth ranking on.
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const lines = body.split("\n");

  const sections: { heading: string; text: string }[] = [];
  let heading = "";
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length >= MIN_CHUNK_CHARS) {
      // Long sections get split on paragraph boundaries to stay under cap.
      if (text.length > MAX_CHUNK_CHARS) {
        let piece = "";
        for (const para of text.split(/\n\n+/)) {
          if (piece.length + para.length > MAX_CHUNK_CHARS && piece.length >= MIN_CHUNK_CHARS) {
            sections.push({ heading, text: piece.trim() });
            piece = "";
          }
          piece += para + "\n\n";
        }
        if (piece.trim().length >= MIN_CHUNK_CHARS) sections.push({ heading, text: piece.trim() });
      } else {
        sections.push({ heading, text });
      }
    }
    buf = [];
  };

  for (const line of lines) {
    const h = line.match(/^#{1,6}\s+(.*)/);
    if (h) {
      flush();
      heading = h[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();

  return sections.map((s, i) => ({
    id: `${rel}::${i}`,
    notePath: rel,
    noteName,
    heading: s.heading,
    text: s.text,
    asOf: evidence.asOf,
    status: evidence.status,
  }));
}

// ─── Indexing ───────────────────────────────────────────────────

async function indexFile(abs: string, mtimeMs: number): Promise<void> {
  const rel = relPath(abs);
  if (isAlwaysLoadedCore(rel)) return;

  const prior = fileState.get(rel);
  if (prior) {
    for (const id of prior.chunkIds) {
      try { mini.discard(id); } catch { /* already gone */ }
    }
  }

  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf-8");
  } catch {
    fileState.delete(rel);
    return;
  }

  const chunks = chunkNote(rel, raw);
  if (chunks.length > 0) mini.addAll(chunks);
  fileState.set(rel, { mtimeMs, chunkIds: chunks.map((c) => c.id) });
}

/** Full or incremental scan. Cheap at this vault size (85 notes / 2.8MB). */
export async function rescanVault(): Promise<{ indexed: number; removed: number }> {
  const absNotes = await walkVault();
  const seen = new Set<string>();
  let indexed = 0;

  for (const abs of absNotes) {
    const rel = relPath(abs);
    seen.add(rel);
    if (isAlwaysLoadedCore(rel)) continue;
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    const prior = fileState.get(rel);
    if (!prior || prior.mtimeMs !== stat.mtimeMs) {
      await indexFile(abs, stat.mtimeMs);
      indexed++;
    }
  }

  // Drop deleted notes from the index.
  let removed = 0;
  for (const [rel, state] of fileState) {
    if (!seen.has(rel)) {
      for (const id of state.chunkIds) {
        try { mini.discard(id); } catch { /* ok */ }
      }
      fileState.delete(rel);
      removed++;
    }
  }

  noteCount = absNotes.length;
  lastIndexed = new Date().toISOString();
  return { indexed, removed };
}

export async function initBrain(): Promise<BrainStats> {
  if (!existsSync(entitiesDir())) mkdirSync(entitiesDir(), { recursive: true });
  const t0 = Date.now();
  const { indexed } = await rescanVault();
  console.log(
    `[Brain] Indexed ${indexed} notes (${fileState.size} files, ${mini.documentCount} chunks) in ${Date.now() - t0}ms — vault: ${vaultPath()}`
  );
  if (!rescanHandle) {
    rescanHandle = setInterval(() => {
      rescanVault().then(({ indexed: n, removed }) => {
        if (n > 0 || removed > 0) console.log(`[Brain] Re-indexed ${n} changed, dropped ${removed} deleted note(s)`);
      }).catch((e) => console.warn("[Brain] rescan failed:", (e as Error).message));
    }, RESCAN_INTERVAL_MS);
    rescanHandle.unref?.();
  }
  return getBrainStats();
}

export function stopBrain(): void {
  if (rescanHandle) {
    clearInterval(rescanHandle);
    rescanHandle = null;
  }
}

// ─── Retrieval ──────────────────────────────────────────────────

export function rankBrainHits(hits: BrainHit[], query: string, limit = 6): BrainHit[] {
  const wantArchive = /\b(archive|history|historical|used to|old notes?)\b/i.test(query);
  const wantPending = /\b(proposal|proposals|draft|drafts|pending approval)\b/i.test(query);
  const visible = hits.filter((hit) => wantPending || !isPendingKnowledgePath(hit.notePath));
  const ranked = visible.map((hit) => {
    let score = hit.score;
    if (isArchivePath(hit.notePath)) score *= wantArchive ? 1.1 : 0.15;
    else score *= 1.25;
    if (hit.asOf) score *= 1.05;
    const notePath = hit.notePath.replace(/\\/g, "/");
    if (notePath.startsWith("FRIDAY_BRAIN/entities/")) score *= 1.15;
    return { ...hit, score: Math.round(score * 100) / 100 };
  });
  ranked.sort((a, b) => b.score - a.score);
  const fresh = ranked.filter((hit) => !isArchivePath(hit.notePath));
  const pool = !wantArchive && fresh.length > 0 ? fresh : ranked;
  return pool.slice(0, Math.min(Math.max(1, limit), 20));
}

export function searchBrain(query: string, limit = 6): BrainHit[] {
  const q = (query || "").trim();
  if (q.length < 2) return [];
  const results = mini.search(q).slice(0, 40);
  const hits = results.map((r) => ({
    notePath: r.notePath as string,
    noteName: r.noteName as string,
    heading: (r.heading as string) || "",
    snippet: ((r.text as string) || "").slice(0, 400),
    score: Math.round(r.score * 100) / 100,
    asOf: (r.asOf as string) || null,
    status: (r.status as string) || null,
  }));
  return rankBrainHits(hits, q, limit);
}

/** Hits for one chat turn. Short messages stay quiet so the prompt is not padded. */
export function recallHits(message: string, limit = 5): BrainHit[] {
  const m = (message || "").trim();
  if (m.length < 8) return [];
  return searchBrain(m, limit);
}

export function formatBrainContext(hits: BrainHit[], maxChars = 1600): string {
  if (hits.length === 0) return "";
  const parts: string[] = [];
  let used = 0;
  for (const h of hits) {
    const when = h.asOf ? `as of ${h.asOf}` : "undated — older than dated evidence";
    const status = h.status ? ` status ${h.status}` : "";
    const block = `[${h.notePath}${h.heading ? ` › ${h.heading}` : ""} | ${when}${status}]\n${h.snippet}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  if (parts.length === 0) return "";
  return (
    "\n\nVAULT RECALL (auto-retrieved from the Obsidian brain — relevant to this message; cite naturally, never read paths aloud):\n" +
    parts.join("\n---\n")
  );
}

/**
 * Per-message context injection: the top vault chunks relevant to what Danny
 * just said, capped hard so the free-tier token budget survives. Returns ""
 * when nothing relevant — never pads.
 */
export function buildBrainContext(message: string, maxChars = 1600): string {
  return formatBrainContext(recallHits(message, 5), maxChars);
}

// ─── Entity write-back (the brain LEARNS) ───────────────────────

const ENTITY_TYPES = ["person", "client", "project", "preference", "place", "tool", "fact"] as const;
const OBS_CATEGORIES = ["fact", "decision", "preference", "insight", "question", "event"] as const;

function sanitizeEntityName(name: string): string {
  return name.replace(/[<>:"/\\|?*#^[\]\u0000]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export interface RememberInput {
  entity: string;
  observation: string;
  type?: string;
  category?: string;
  relations?: string[]; // ["partner_of Wavelength Solutions", "works_at Mamba"]
  source?: JournalEntry["source"];
}

export interface RememberResult {
  entity: string;
  notePath: string;
  created: boolean;
  duplicate: boolean;
}

export async function rememberFact(input: RememberInput): Promise<RememberResult> {
  const name = sanitizeEntityName(input.entity);
  if (!name) throw new Error("Entity name is required");
  const observation = (input.observation || "").trim();
  if (!observation) throw new Error("Observation is required");

  const type = ENTITY_TYPES.includes(input.type as any) ? (input.type as string) : "fact";
  const category = OBS_CATEGORIES.includes(input.category as any) ? (input.category as string) : "fact";
  const source = input.source || "chat";

  if (!existsSync(entitiesDir())) mkdirSync(entitiesDir(), { recursive: true });
  const file = path.join(entitiesDir(), `${name}.md`);
  if (!isInsideRoot(entitiesDir(), file)) throw new Error("Entity name is not a safe file name");
  const obsLine = `- [${category}] ${observation} *(as of ${today()}, ${source})*`;

  let created = false;
  let duplicate = false;
  let content: string;

  if (existsSync(file)) {
    content = readFileSync(file, "utf-8");

    // Two-Output Rule, update-in-place: identical observation text (ignoring
    // category + date suffix) is a duplicate — bump nothing, vault stays clean.
    const existingObs = content
      .split("\n")
      .filter((l) => l.trim().startsWith("- ["))
      .map((l) => l.replace(/^-\s*\[[^\]]*\]\s*/, "").replace(/\s*\*\(as of.*?\)\*\s*$/, "").trim().toLowerCase());
    if (existingObs.includes(observation.toLowerCase())) {
      duplicate = true;
    } else {
      const obsHeading = "## Observations";
      const idx = content.indexOf(obsHeading);
      if (idx === -1) {
        content = content.trimEnd() + `\n\n${obsHeading}\n${obsLine}\n`;
      } else {
        const lineEnd = content.indexOf("\n", idx);
        const insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
        content = content.slice(0, insertAt) + obsLine + "\n" + content.slice(insertAt);
      }
      content = content.replace(/^updated: .*$/m, `updated: ${today()}`);
    }
  } else {
    created = true;
    content = `---
entity: ${name}
type: ${type}
created: ${today()}
updated: ${today()}
tags: [friday-brain, ${type}]
---

# ${name}

## Observations
${obsLine}

## Relations
`;
  }

  // Merge relations as typed wikilinks (basic-memory format): "rel_type [[Target]]"
  if (input.relations && input.relations.length > 0 && !duplicate) {
    const relHeading = "## Relations";
    if (!content.includes(relHeading)) content = content.trimEnd() + `\n\n${relHeading}\n`;
    for (const rel of input.relations.slice(0, 10)) {
      const m = rel.trim().match(/^(\w+)\s+(.+)$/);
      const relType = m ? m[1] : "relates_to";
      const target = sanitizeEntityName(m ? m[2].replace(/^\[\[|\]\]$/g, "") : rel);
      if (!target) continue;
      const relLine = `- ${relType} [[${target}]]`;
      if (!content.includes(`[[${target}]]`)) {
        const idx = content.indexOf(relHeading);
        const lineEnd = content.indexOf("\n", idx);
        const insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
        content = content.slice(0, insertAt) + relLine + "\n" + content.slice(insertAt);
      }
    }
  }

  if (!duplicate) {
    writeFileSync(file, content, "utf-8");
    // Make the new knowledge searchable immediately.
    try {
      const stat = await fs.stat(file);
      await indexFile(file, stat.mtimeMs);
    } catch { /* index catches up on next rescan */ }
    appendJournal({ at: new Date().toISOString(), entity: name, type, observation, category, source });
  }

  return { entity: name, notePath: relPath(file), created, duplicate };
}

// ─── Journal (feeds the frontend "what FRIDAY learned" panel) ───

function loadJournal(): JournalEntry[] {
  try {
    if (existsSync(JOURNAL_FILE)) return JSON.parse(readFileSync(JOURNAL_FILE, "utf-8"));
  } catch { /* corrupt → start fresh */ }
  return [];
}

function appendJournal(entry: JournalEntry): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const journal = loadJournal();
    journal.push(entry);
    writeFileSync(JOURNAL_FILE, JSON.stringify(journal.slice(-300), null, 2), "utf-8");
  } catch (err) {
    console.warn("[Brain] journal write failed:", (err as Error).message);
  }
}

export function getRecentLearnings(limit = 20): JournalEntry[] {
  return loadJournal().slice(-Math.min(Math.max(1, limit), 100)).reverse();
}

// ─── Stats ──────────────────────────────────────────────────────

export function getBrainStats(): BrainStats {
  let entities = 0;
  try {
    if (existsSync(entitiesDir())) {
      entities = readdirSync(entitiesDir()).filter((f) => f.endsWith(".md")).length;
    }
  } catch { /* 0 */ }
  return {
    notes: noteCount,
    chunks: mini.documentCount,
    entities,
    lastIndexed,
    vaultPath: vaultPath(),
  };
}
