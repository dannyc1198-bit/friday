import test from "node:test";
import assert from "node:assert/strict";
import { getDueJobs, isHealthDue, type SchedulerState } from "./scheduler.js";
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

test("the nightly health check is due once after 21:30", () => {
  const now = new Date(2026, 7, 10, 21, 45);
  assert.equal(isHealthDue(now, null), true);
  assert.equal(isHealthDue(now, localDateKey(now)), false);
  assert.equal(isHealthDue(new Date(2026, 7, 10, 10, 0), null), false);
});
