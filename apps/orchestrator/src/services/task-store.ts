// One task shape for tools, Today, and the proactive monitor.
// List order and "task 1" resolution stay the same snapshot.

export interface StoredTask {
  id: string;
  text: string;
  due?: string;
  priority: "low" | "medium" | "high" | "urgent";
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface NormalizedTask {
  id: string;
  title: string;
  priority: string;
  completed: boolean;
  dueDate?: string;
  createdAt?: string;
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function sortTasksForDisplay(tasks: StoredTask[]): StoredTask[] {
  return tasks.slice().sort((a, b) => {
    const priority = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    if (priority !== 0) return priority;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function resolveTaskIdentifier(
  tasks: StoredTask[],
  identifier: string
): { task?: StoredTask; error?: string } {
  const needle = (identifier || "").trim();
  if (!needle) return { error: "Say which task. Use its id or the number from the current list." };
  if (needle.startsWith("task_")) {
    const task = tasks.find((item) => item.id === needle);
    return task ? { task } : { error: `No task with id ${needle}.` };
  }
  if (/^\d+$/.test(needle)) {
    const pending = sortTasksForDisplay(tasks.filter((item) => !item.completed));
    const task = pending[Number(needle) - 1];
    return task ? { task } : { error: `No pending task numbered ${needle}. The list has ${pending.length}.` };
  }
  const matches = tasks.filter((item) => !item.completed && item.text.toLowerCase().includes(needle.toLowerCase()));
  if (matches.length === 1) return { task: matches[0] };
  if (matches.length > 1) {
    return { error: `More than one task matches "${needle}". Use an id: ${matches.map((item) => item.id).join(", ")}.` };
  }
  return { error: `No pending task matches "${needle}".` };
}

export function tasksFromStore(raw: unknown): NormalizedTask[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { tasks?: unknown }).tasks)
      ? (raw as { tasks: unknown[] }).tasks
      : null;
  if (!list) throw new Error("tasks.json is not a task list");
  return list.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const due = typeof row.dueDate === "string" ? row.dueDate : typeof row.due === "string" ? row.due : undefined;
    return {
      id: typeof row.id === "string" ? row.id : "",
      title: typeof row.title === "string" ? row.title : typeof row.text === "string" ? row.text : "",
      priority: typeof row.priority === "string" ? row.priority : "medium",
      completed: row.completed === true,
      dueDate: due,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
    };
  });
}

export function overdueTasks(tasks: NormalizedTask[], now: Date): NormalizedTask[] {
  return tasks.filter((task) => {
    if (task.completed || !task.dueDate) return false;
    const due = new Date(task.dueDate);
    return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
  });
}
