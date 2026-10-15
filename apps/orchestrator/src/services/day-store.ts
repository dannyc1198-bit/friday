// FRIDAY — Day Store
// ─────────────────────────────────────────────────────────────────────
// One JSON file, keyed by date (YYYY-MM-DD), holding everything we know
// about each day. Both the Apple Health bridge (/api/dashboard/ingest) and
// the manual one-tap logs write here; the score + dashboard read from here.
//
// Mirrors the simple load/save pattern already used by health-tracking.ts —
// no DB, just data/dashboard.json sitting next to health.json.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { DayData } from "./daily-score.js";
import { DATA_DIR, localDateKey } from "./runtime-paths.js";

// Same data dir as health-tracking.ts so all personal data lives together,
// regardless of whether we run from src (tsx) or a compiled dist.
const STORE_FILE = join(DATA_DIR, "dashboard.json");
const MAX_DAYS = 400;

interface DayStore {
  days: Record<string, DayData>;
}

/** Local-date key. The server runs on Danny's PC (his timezone), so "today"
 *  flips at LOCAL midnight, not UTC. */
export function todayStr(): string {
  return localDateKey();
}

function loadStore(): DayStore {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STORE_FILE)) return { days: {} };
  try {
    const parsed = JSON.parse(readFileSync(STORE_FILE, "utf8"));
    return parsed && typeof parsed === "object" && parsed.days ? parsed : { days: {} };
  } catch {
    return { days: {} };
  }
}

function saveStore(store: DayStore): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  // Prune to the most recent MAX_DAYS by date key (lexicographic == chronological).
  const keys = Object.keys(store.days).sort();
  if (keys.length > MAX_DAYS) {
    for (const k of keys.slice(0, keys.length - MAX_DAYS)) delete store.days[k];
  }
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

export function getDay(date: string = todayStr()): DayData {
  const store = loadStore();
  return store.days[date] || { date };
}

/** Merge a partial update into a day and persist. Returns the merged day. */
export function upsertDay(date: string, patch: Partial<DayData>): DayData {
  const store = loadStore();
  const existing = store.days[date] || { date };
  const merged: DayData = { ...existing, ...patch, date };
  store.days[date] = merged;
  saveStore(store);
  return merged;
}

/** Add caffeine mg to a day's running total (cumulative across taps). */
export function addCaffeine(date: string, mg: number): DayData {
  const day = getDay(date);
  return upsertDay(date, { caffeineMg: (day.caffeineMg || 0) + mg });
}

/** Record supplement adherence for the day. */
export function setSupplements(date: string, taken: number, planned: number): DayData {
  return upsertDay(date, { supplementsTaken: taken, supplementsPlanned: planned });
}

/** Trailing window of days, oldest → newest, for trend charts. */
export function getRange(days: number): DayData[] {
  const store = loadStore();
  return Object.values(store.days)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}
