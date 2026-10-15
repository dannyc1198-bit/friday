import test from "node:test";
import assert from "node:assert/strict";
import { overdueTasks, resolveTaskIdentifier, sortTasksForDisplay, tasksFromStore, type StoredTask } from "./task-store.js";

const tasks: StoredTask[] = [
  { id: "task_low", text: "File the receipt", priority: "low", completed: false, createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "task_urgent", text: "Call the client", priority: "urgent", completed: false, createdAt: "2026-10-02T00:00:00.000Z" },
];

test("task number 1 is the first displayed task, not the first inserted", () => {
  const shown = sortTasksForDisplay(tasks.filter((task) => !task.completed));
  assert.equal(shown[0].id, "task_urgent");
  assert.equal(resolveTaskIdentifier(tasks, "1").task?.id, "task_urgent");
  assert.equal(resolveTaskIdentifier(tasks, "task_low").task?.id, "task_low");
});

test("a partial title that matches two tasks asks for an id", () => {
  const ambiguous: StoredTask[] = [
    { id: "task_a", text: "Email Ada", priority: "medium", completed: false, createdAt: "2026-10-01" },
    { id: "task_b", text: "Email Bea", priority: "medium", completed: false, createdAt: "2026-10-02" },
  ];
  const result = resolveTaskIdentifier(ambiguous, "Email");
  assert.match(result.error || "", /task_a/);
  assert.equal(result.task, undefined);
});

test("the monitor reads the tool task file and its due field", () => {
  const normalized = tasksFromStore({
    tasks: [{ id: "task_1", text: "Ship the draft", due: "2026-10-01", priority: "high", completed: false }],
    lastUpdated: "2026-10-15",
  });
  assert.equal(normalized[0].title, "Ship the draft");
  assert.equal(overdueTasks(normalized, new Date("2026-10-15T00:00:00.000Z")).length, 1);
  assert.throws(() => tasksFromStore({ nope: true }), /task list/);
});
