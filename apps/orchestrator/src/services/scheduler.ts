// Scheduler — tiny cron-less scheduler for FRIDAY's time-based events
//
// Checks once per minute:
//   - 5 AM local time → fire morning briefing (once per day, even across restarts)
//
// Persistence: data/scheduler-state.json holds { lastBriefingDate: "YYYY-MM-DD" }
// Quiet hours (23:00–05:00) are respected for everything EXCEPT the 5 AM wake.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { proactiveMonitor } from "./proactive-monitor.js";
import { getMorningBriefing } from "./morning-briefing.js";
import { textToSpeech, isTTSAvailable } from "./tts.js";

const USER_HOME = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368";
const DATA_DIR = join(USER_HOME, "jarvis", "apps", "orchestrator", "data");
const STATE_FILE = join(DATA_DIR, "scheduler-state.json");

const CHECK_INTERVAL_MS = 60 * 1000; // every minute
const BRIEFING_HOUR = 5;             // 5 AM local time

const QUIET_HOUR_START = 23;
const QUIET_HOUR_END = 5;

interface SchedulerState {
  lastBriefingDate: string | null; // YYYY-MM-DD
}

// ─── State persistence ───────────────────────────────────────────

function loadState(): SchedulerState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SchedulerState;
    }
  } catch {
    // fall through
  }
  return { lastBriefingDate: null };
}

function saveState(state: SchedulerState): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Scheduler] Failed to persist state:", (err as Error).message);
  }
}

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isQuietHours(date = new Date()): boolean {
  const h = date.getHours();
  if (QUIET_HOUR_START <= QUIET_HOUR_END) {
    return h >= QUIET_HOUR_START && h < QUIET_HOUR_END;
  }
  // wraps midnight
  return h >= QUIET_HOUR_START || h < QUIET_HOUR_END;
}

// ─── Scheduler ───────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function fireMorningBriefing(): Promise<void> {
  try {
    console.log("[Scheduler] Firing morning briefing…");
    const briefing = await getMorningBriefing();

    // Queue as high-priority briefing alert (frontend/history)
    proactiveMonitor.queueAlert({
      type: "system", // briefing is a system-level event; alert type union doesn't include "briefing"
      priority: "high",
      title: "Morning Briefing",
      message: briefing.script,
    });

    // Speak immediately if TTS is available — the 5 AM briefing is intentional
    if (isTTSAvailable()) {
      try {
        const audio = await textToSpeech(briefing.script);
        if (audio) {
          // We have an audio buffer but no speaker channel from the backend alone.
          // The frontend will pick up the queued alert and play it; we still
          // generate here to warm the cache and verify TTS availability.
          console.log(`[Scheduler] Morning briefing TTS ready (${audio.length} bytes)`);
        }
      } catch (err) {
        console.warn("[Scheduler] TTS for briefing failed:", (err as Error).message);
      }
    } else {
      console.log("[Scheduler] TTS unavailable — briefing queued silently");
    }
  } catch (err) {
    console.error("[Scheduler] Morning briefing failed:", (err as Error).message);
  }
}

async function tick(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();
  const state = loadState();
  const today = todayKey(now);

  // 5 AM briefing — fires once per local day
  if (hour === BRIEFING_HOUR && state.lastBriefingDate !== today) {
    await fireMorningBriefing();
    state.lastBriefingDate = today;
    saveState(state);
  }
}

export function startScheduler(): void {
  if (intervalHandle) return;
  console.log("[Scheduler] Started — checking every minute (briefing at 5 AM local)");
  // Run once immediately so a restart right at 5 AM still fires
  tick().catch((e) => console.warn("[Scheduler] tick error:", e));
  intervalHandle = setInterval(() => {
    tick().catch((e) => console.warn("[Scheduler] tick error:", e));
  }, CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
