import test from "node:test";
import assert from "node:assert/strict";
import { listTasks, pickNextTask } from "./today.js";

test("task list keeps open and completed rows in display order", () => {
  const loaded = listTasks({
    tasks: [
      { id: "done", text: "Filed", priority: "low", completed: true, createdAt: "2026-01-01" },
      { id: "later", text: "Later", priority: "low", completed: false, createdAt: "2026-01-03" },
      { id: "now", text: "Now", priority: "urgent", completed: false, createdAt: "2026-01-02" },
    ],
  });
  assert.deepEqual(loaded.tasks.map((task) => task.id), ["now", "done", "later"]);
  const next = pickNextTask(loaded.tasks.filter((task) => !task.completed));
  assert.equal(next?.id, "now");
});

test("a missing or corrupt task file stays an empty list", () => {
  assert.deepEqual(listTasks(null), { tasks: [] });
  assert.equal(listTasks({ nope: true }).error, "tasks.json is not a task list");
});
