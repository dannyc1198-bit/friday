// One-time import of OpenClaw memory into FRIDAY's unified memory store.
//
// Sources (STRICTLY read-only):
//   1. C:\Users\12368\openclaw\apps\server\data\clawdy-memory.json
//      — array of { id, fact, tags, createdAt } records from the Clawdy bot.
//   2. C:\Users\12368\.openclaw\memory\main.sqlite (chunks table, via node:sqlite)
//      — markdown chunks of OpenClaw memory files; bullet lines ("- ...") are
//        extracted as individual facts, mirroring unified-memory.ts's own
//        parseOpenClawMemory convention.
//
// Target: apps/orchestrator/data/unified-memory.json
//   — entries match the UnifiedMemoryEntry schema in
//     apps/orchestrator/src/services/unified-memory.ts.
//
// Dedupe: exact (trimmed) content match against existing entries AND within
// the import batch, so re-running is safe (idempotent).
//
// A backup copy (unified-memory.backup-pre-import.json) is written before
// any modification.
//
// Run: node scripts/import-openclaw-memory.mjs

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const IMPORT_TAG = "openclaw-import-2026-06-12";
const USER_HOME = process.env.USERPROFILE || "C:\\Users\\12368";
const UNIFIED_STORE = join(USER_HOME, "jarvis", "apps", "orchestrator", "data", "unified-memory.json");
const BACKUP_PATH = join(USER_HOME, "jarvis", "apps", "orchestrator", "data", "unified-memory.backup-pre-import.json");
const CLAWDY_JSON = join(USER_HOME, "openclaw", "apps", "server", "data", "clawdy-memory.json");
const OPENCLAW_SQLITE = join(USER_HOME, ".openclaw", "memory", "main.sqlite");

// ─── Load target store ──────────────────────────────────────────

if (!existsSync(UNIFIED_STORE)) {
  console.error(`Target store not found: ${UNIFIED_STORE}`);
  process.exit(1);
}

const store = JSON.parse(readFileSync(UNIFIED_STORE, "utf-8"));
if (!Array.isArray(store.entries)) {
  console.error("unified-memory.json has no entries array — aborting.");
  process.exit(1);
}

// Only write the backup once — re-runs must not overwrite the true
// pre-import snapshot with an already-imported store.
if (!existsSync(BACKUP_PATH)) {
  copyFileSync(UNIFIED_STORE, BACKUP_PATH);
  console.log(`Backup written: ${BACKUP_PATH}`);
} else {
  console.log(`Backup already exists, preserved: ${BACKUP_PATH}`);
}

const seen = new Set(store.entries.map((e) => String(e.content || "").trim()));
const now = new Date().toISOString();
let counter = 0;

function makeId() {
  counter++;
  return `mem_${Date.now()}_${counter}${Math.random().toString(36).slice(2, 7)}`;
}

function addEntry({ content, tags, agent, createdAt }) {
  const text = String(content || "").trim();
  if (text.length < 10) return false;
  if (seen.has(text)) return false;
  seen.add(text);
  const entry = {
    source: "openclaw",
    category: "fact",
    content: text,
    tags,
    importance: "medium",
    confidence: 0.7,
    id: makeId(),
    createdAt: createdAt || now,
    updatedAt: now,
    accessCount: 0,
  };
  if (agent) entry.agent = agent;
  store.entries.push(entry);
  return true;
}

// ─── Source 1: clawdy-memory.json ───────────────────────────────

let clawdyImported = 0;
let clawdyDeduped = 0;
try {
  const facts = JSON.parse(readFileSync(CLAWDY_JSON, "utf-8"));
  for (const f of Array.isArray(facts) ? facts : []) {
    if (!f || typeof f.fact !== "string") continue;
    const ok = addEntry({
      content: f.fact,
      tags: [...(Array.isArray(f.tags) ? f.tags : []), IMPORT_TAG],
      agent: "clawdy",
      createdAt: f.createdAt,
    });
    if (ok) clawdyImported++;
    else clawdyDeduped++;
  }
  console.log(`clawdy-memory.json: ${clawdyImported} imported, ${clawdyDeduped} deduped/skipped`);
} catch (err) {
  console.warn(`clawdy-memory.json: skipped (${err.message})`);
}

// ─── Source 2: main.sqlite chunks (best-effort) ─────────────────

let sqliteImported = 0;
let sqliteDeduped = 0;
let sqliteStatus = "skipped";
try {
  const { DatabaseSync } = await import("node:sqlite");
  if (!existsSync(OPENCLAW_SQLITE)) throw new Error("file not found");
  const db = new DatabaseSync(OPENCLAW_SQLITE, { readOnly: true });
  try {
    const rows = db.prepare("SELECT path, text FROM chunks").all();
    for (const row of rows) {
      // Mirror unified-memory.ts parseOpenClawMemory: one fact per bullet line.
      const bullets = String(row.text || "")
        .split("\n")
        .filter((l) => l.trim().startsWith("- "));
      for (const line of bullets) {
        const content = line.replace(/^\s*-\s*/, "").replace(/\[.*?\]\(.*?\)/, "").trim();
        const ok = addEntry({
          content,
          tags: [IMPORT_TAG, "sqlite-memory", String(row.path || "")],
        });
        if (ok) sqliteImported++;
        else sqliteDeduped++;
      }
    }
    sqliteStatus = "ok";
  } finally {
    db.close();
  }
  console.log(`main.sqlite: ${sqliteImported} imported, ${sqliteDeduped} deduped/skipped`);
} catch (err) {
  sqliteStatus = `unavailable (${err.message})`;
  console.warn(`main.sqlite: skipped — ${err.message}`);
}

// ─── Recompute stats + save ─────────────────────────────────────

const totalImported = clawdyImported + sqliteImported;
if (totalImported > 0) {
  const bySource = {};
  const byCategory = {};
  for (const e of store.entries) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  }
  store.stats = {
    totalEntries: store.entries.length,
    bySource,
    byCategory,
    lastLearningCycle: store.stats?.lastLearningCycle || "",
  };
  writeFileSync(UNIFIED_STORE, JSON.stringify(store, null, 2), "utf-8");
  console.log(`Saved ${UNIFIED_STORE}`);
} else {
  console.log("Nothing new to import — store left untouched.");
}

console.log(
  `DONE: imported=${totalImported} (clawdy=${clawdyImported}, sqlite=${sqliteImported}) ` +
  `deduped=${clawdyDeduped + sqliteDeduped} totalEntries=${store.entries.length} sqlite=${sqliteStatus}`
);
