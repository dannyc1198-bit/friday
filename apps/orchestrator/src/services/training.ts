// FRIDAY — Training program (Track A foundation: the voice gym coach)
// ─────────────────────────────────────────────────────────────────────
// HYBRID model: YOU set the split (DEFAULT_PROGRAM below). FRIDAY fills the
// exercises from the demo library, cues form over voice, and progresses your
// load over time. Everything the coach says hangs off this structure.
//
// Stored at data/program.json (next to dashboard.json / health.json).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(
  process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368",
  "jarvis", "apps", "orchestrator", "data",
);
const PROGRAM_FILE = join(DATA_DIR, "program.json");

export interface ExercisePrescription {
  name: string;
  sets: number;
  repRange: [number, number];
  targetRpe?: number;   // 1–10 effort target
  notes?: string;       // form cue / focus
}
export interface SplitDay {
  label: string;        // "Push", "Pull", "Legs"…
  focus: string[];      // target muscle groups FRIDAY programs around
  exercises: ExercisePrescription[]; // FRIDAY fills these (hybrid) — start empty
}
export interface Program {
  name: string;
  goal: string;
  equipment: string[];
  daysPerWeek: number;
  split: SplitDay[];
}

// ═══════════════════════════════════════════════════════════════════════
//  ⭐ DANNY'S SPLIT — the hybrid input. Edit this to YOUR real training week.
//  Leave `exercises` empty: FRIDAY fills each day from the demo library at
//  runtime (and you can lock a specific movement by adding it here).
// ═══════════════════════════════════════════════════════════════════════
export const DEFAULT_PROGRAM: Program = {
  name: "Lean bulk",
  goal: "Hypertrophy — lean bulk toward 170 lb",
  equipment: ["full gym"],
  daysPerWeek: 5,
  split: [
    { label: "Push",  focus: ["chest", "shoulders", "triceps"], exercises: [] },
    { label: "Pull",  focus: ["back", "rear delts", "biceps"], exercises: [] },
    { label: "Legs",  focus: ["quads", "hamstrings", "glutes", "calves"], exercises: [] },
    { label: "Upper", focus: ["chest", "back", "shoulders", "arms"], exercises: [] },
    { label: "Lower", focus: ["quads", "hamstrings", "glutes", "calves"], exercises: [] },
  ],
};

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/** Active program — saved override if present, else Danny's DEFAULT_PROGRAM. */
export function getProgram(): Program {
  ensureDir();
  if (!existsSync(PROGRAM_FILE)) return DEFAULT_PROGRAM;
  try {
    const p = JSON.parse(readFileSync(PROGRAM_FILE, "utf8"));
    return p && Array.isArray(p.split) && p.split.length ? p : DEFAULT_PROGRAM;
  } catch {
    return DEFAULT_PROGRAM;
  }
}

export function saveProgram(p: Program): Program {
  ensureDir();
  writeFileSync(PROGRAM_FILE, JSON.stringify(p, null, 2));
  return p;
}

/** Look up a split day by its label (e.g. "Push"). Case-insensitive. */
export function dayByLabel(label: string): SplitDay | undefined {
  return getProgram().split.find((d) => d.label.toLowerCase() === label.toLowerCase());
}
