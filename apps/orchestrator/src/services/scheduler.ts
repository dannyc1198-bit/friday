// FRIDAY scheduler: durable local-time jobs with restart catch-up and retries.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { proactiveMonitor } from "./proactive-monitor.js";
import { getMorningBriefing } from "./morning-briefing.js";
import { runReflection } from "./reflection.js";
import { DATA_DIR, localDateKey } from "./runtime-paths.js";
import { runNightlyHealth } from "./upkeep/runtime.js";
import { maybeRunScheduledThinking } from "./thinking-loop.js";

const STATE_FILE = join(DATA_DIR, "scheduler-state.json");
const CHECK_INTERVAL_MS = 60_000;
const RETRY_INTERVAL_MS = 15 * 60_000;
const BRIEFING_HOUR = 5;
const REFLECTION_HOUR = 21;
const REFLECTION_MINUTE = 30;
const QUIET_HOUR_START = 23;
const QUIET_HOUR_END = 5;

export interface SchedulerState {
  lastBriefingDate: string | null;
  lastReflectionDate?: string | null;
  lastReflectionAttemptAt?: string | null;
  lastReflectionError?: string | null;
  lastHealthDate?: string | null;
}

function loadState(): SchedulerState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SchedulerState;
    }
  } catch {
    // A corrupt or missing state file is recoverable from the next tick.
  }
  return { lastBriefingDate: null, lastReflectionDate: null };
}

function saveState(state: SchedulerState): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const temp = `${STATE_FILE}.tmp`;
    writeFileSync(temp, JSON.stringify(state, null, 2), "utf-8");
    renameSync(temp, STATE_FILE);
  } catch (err) {
    console.warn("[Scheduler] Failed to persist state:", (err as Error).message);
  }
}

function previousLocalDate(date: Date): string {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return localDateKey(previous);
}

/** Pure decision function, exported so catch-up semantics can be tested. */
export function getDueJobs(now: Date, state: SchedulerState): {
  briefingDate: string | null;
  reflectionDate: string | null;
} {
  const today = localDateKey(now);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const afterReflectionTime =
    hour > REFLECTION_HOUR ||
    (hour === REFLECTION_HOUR && minute >= REFLECTION_MINUTE);
  const reflectionDate = afterReflectionTime ? today : previousLocalDate(now);
  const lastAttemptMs = state.lastReflectionAttemptAt
    ? new Date(state.lastReflectionAttemptAt).getTime()
    : 0;
  const retryCoolingDown = Number.isFinite(lastAttemptMs) &&
    now.getTime() - lastAttemptMs < RETRY_INTERVAL_MS;

  return {
    // A restart at 05:01 still delivers; after noon the briefing is stale.
    briefingDate:
      hour >= BRIEFING_HOUR && hour < 12 && state.lastBriefingDate !== today
        ? today
        : null,
    // Before tonight's reflection, catch up yesterday. Afterwards process today.
    reflectionDate:
      state.lastReflectionDate !== reflectionDate && !retryCoolingDown
        ? reflectionDate
        : null,
  };
}

/** Once per local day, after the reflection window. Kept out of getDueJobs. */
export function isHealthDue(now: Date, lastHealthDate: string | null | undefined): boolean {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const afterReflection =
    hour > REFLECTION_HOUR || (hour === REFLECTION_HOUR && minute >= REFLECTION_MINUTE);
  if (!afterReflection) return false;
  return (lastHealthDate || null) !== localDateKey(now);
}

export function isQuietHours(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

async function fireMorningBriefing(): Promise<void> {
  const briefing = await getMorningBriefing();
  proactiveMonitor.queueAlert({
    type: "system",
    priority: "high",
    title: "Morning Briefing",
    message: briefing.script,
  });

  // Alert delivery speaks this once. Generating audio here as well
  // stacked a second copy, and restarts replayed every unread copy.
}

export async function runSchedulerTick(now = new Date()): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const state = loadState();
    const due = getDueJobs(now, state);

    if (due.briefingDate) {
      try {
        await fireMorningBriefing();
        state.lastBriefingDate = due.briefingDate;
        saveState(state);
      } catch (err) {
        console.error("[Scheduler] Morning briefing failed:", (err as Error).message);
      }
    }

    if (due.reflectionDate) {
      state.lastReflectionAttemptAt = now.toISOString();
      saveState(state);
      const result = await runReflection(due.reflectionDate);
      if (result.ran) {
        if (result.complete !== false) state.lastReflectionDate = due.reflectionDate;
        state.lastReflectionError = null;
        proactiveMonitor.queueAlert({
          type: "system",
          priority: "low",
          title: "Nightly Reflection",
          message: (result.complete === false
            ? `Reflected the first part of the day (${result.factsAdded} fact(s)). Later conversations are still queued.`
            : `Brain updated: ${result.factsAdded} new fact(s) learned. ${result.summary || ""}`
          ).trim(),
        });
      } else if (result.error) {
        state.lastReflectionError = result.error;
        console.warn(`[Scheduler] Reflection errored; retrying in 15 minutes: ${result.error}`);
      } else {
        // No substantial material is a successful processing result.
        state.lastReflectionDate = due.reflectionDate;
        state.lastReflectionError = null;
      }
      saveState(state);
    }

    if (isHealthDue(now, state.lastHealthDate)) {
      state.lastHealthDate = localDateKey(now);
      saveState(state);
      try {
        await runNightlyHealth();
      } catch (err) {
        console.warn("[Scheduler] Health check failed:", (err as Error).message);
      }
    }

    try {
      await maybeRunScheduledThinking(now);
    } catch (err) {
      console.warn("[Scheduler] Thinking loop failed:", (err as Error).message);
    }
  } finally {
    tickRunning = false;
  }
}

export function startScheduler(): void {
  if (intervalHandle) return;
  console.log("[Scheduler] Started - every minute with missed-job catch-up");
  runSchedulerTick().catch((err) => console.warn("[Scheduler] tick error:", err));
  intervalHandle = setInterval(() => {
    runSchedulerTick().catch((err) => console.warn("[Scheduler] tick error:", err));
  }, CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}
