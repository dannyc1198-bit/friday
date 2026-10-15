import test from "node:test";
import assert from "node:assert/strict";
import { alertDedupeKey, collapseAlerts, isDuplicateAlert } from "./alert-dedupe.js";
import { extractLearnings, isUnsafeToAct } from "./learning-writeback.js";
import { higgsfieldCredentials, integrationStatuses } from "./creative/credentials.js";
import { pickNextTask } from "../routes/today.js";
import { GREETING_TEXT } from "./greeting.js";

test("morning briefings collapse to one per day", () => {
  const alerts = [1, 2, 3, 4, 5].map((n) => ({
    title: "Morning Briefing",
    timestamp: `2026-10-15T07:0${n}:00.000Z`,
    read: false,
  }));
  const collapsed = collapseAlerts(alerts);
  assert.equal(collapsed.length, 1);
  assert.equal(isDuplicateAlert(collapsed, "Morning Briefing", "2026-10-15T08:00:00.000Z"), true);
  assert.equal(alertDedupeKey("Morning Briefing", "2026-10-16T05:00:00.000Z").endsWith("2026-10-16"), true);
});

test("stated goals are learnable and unsafe actions stay drafts", () => {
  const goal = extractLearnings("My Enagic goal is 20 compliant K8 conversations this month.");
  assert.equal(goal[0]?.entity, "Enagic");
  assert.equal(goal[0]?.draft, false);
  assert.equal(isUnsafeToAct("send the email and place the order"), true);
  const draft = extractLearnings("Remember that we should send the invoice email tomorrow.");
  assert.equal(draft[0]?.draft, true);
});

test("integrations report needs key until credentials are pasted", () => {
  const rows = integrationStatuses({}, false);
  assert.ok(rows.every((row) => row.state !== "ready"));
  assert.equal(rows.find((row) => row.id === "meshy")?.state, "needs_key");
  assert.equal(rows.find((row) => row.id === "higgsfield")?.state, "needs_key");
  assert.equal(rows.find((row) => row.id === "xai")?.state, "needs_key");
  assert.equal(higgsfieldCredentials({ HIGGSFIELD_API_KEY: "id-1:secret-1" })?.id, "id-1");
});

test("today keeps a single next task and the greeting line is fixed", () => {
  const next = pickNextTask([
    { id: "a", text: "Later", priority: "low" },
    { id: "b", text: "Call Russell", priority: "high", due: "2026-10-15" },
  ]);
  assert.equal(next?.text, "Call Russell");
  assert.equal(GREETING_TEXT, "Hey Daniel, how's it going boss? What do we need to do today?");
});
