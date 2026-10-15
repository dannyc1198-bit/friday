import test from "node:test";
import assert from "node:assert/strict";
import {
  LLM_JOB_GAP_MS,
  STARTUP_LLM_GRACE_MS,
  getDueJobs,
  isHealthDue,
  pickDeferredLlmJob,
  type SchedulerState,
} from "./scheduler.js";
import { localDateKey } from "./runtime-paths.js";

const blank: SchedulerState = { lastBriefingDate: null, lastReflectionDate: null };

test("scheduler catches up the morning briefing after a restart", () => {
  const now = new Date(2026, 7, 10, 7, 15);
  assert.equal(getDueJobs(now, blank).briefingDate, localDateKey(now));
});

test("scheduler does not deliver a stale briefing after noon", () => {
  const now = new Date(2026, 7, 10, 13, 0);
  assert.equal(getDueJobs(now, blank).briefingDate, null);
});

test("scheduler catches up yesterday before tonight's reflection window", () => {
  const now = new Date(2026, 7, 10, 10, 0);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(getDueJobs(now, blank).reflectionDate, localDateKey(yesterday));
});

test("scheduler processes today after 21:30 and respects retry cooldown", () => {
  const now = new Date(2026, 7, 10, 21, 45);
  assert.equal(getDueJobs(now, blank).reflectionDate, localDateKey(now));
  assert.equal(
    getDueJobs(now, { ...blank, lastReflectionAttemptAt: new Date(now.getTime() - 5 * 60_000).toISOString() }).reflectionDate,
    null
  );
});

test("startup holds briefing and reflection, then spaces them a minute apart", () => {
  const boot = Date.parse("2026-08-10T07:00:00");
  const both = { briefingDate: "2026-08-10", reflectionDate: "2026-08-09" };
  assert.equal(pickDeferredLlmJob(both, { nowMs: boot + 10_000, bootAtMs: boot, lastLlmJobAtMs: null }), null);
  assert.equal(
    pickDeferredLlmJob(both, { nowMs: boot + STARTUP_LLM_GRACE_MS, bootAtMs: boot, lastLlmJobAtMs: null }),
    "briefing"
  );
  assert.equal(
    pickDeferredLlmJob(both, {
      nowMs: boot + STARTUP_LLM_GRACE_MS + 10_000,
      bootAtMs: boot,
      lastLlmJobAtMs: boot + STARTUP_LLM_GRACE_MS,
    }),
    null
  );
  assert.equal(
    pickDeferredLlmJob(
      { briefingDate: null, reflectionDate: "2026-08-09" },
      { nowMs: boot + STARTUP_LLM_GRACE_MS + LLM_JOB_GAP_MS, bootAtMs: boot, lastLlmJobAtMs: boot + STARTUP_LLM_GRACE_MS }
    ),
    "reflection"
  );
  assert.equal(
    pickDeferredLlmJob(
      { briefingDate: null, reflectionDate: "2026-08-09" },
      { nowMs: boot + STARTUP_LLM_GRACE_MS, bootAtMs: boot, lastLlmJobAtMs: null }
    ),
    "reflection"
  );
});

test("the nightly health check is due once after 21:30", () => {
  const now = new Date(2026, 7, 10, 21, 45);
  assert.equal(isHealthDue(now, null), true);
  assert.equal(isHealthDue(now, localDateKey(now)), false);
  assert.equal(isHealthDue(new Date(2026, 7, 10, 10, 0), null), false);
});
