import { existsSync, readFileSync } from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import { DATA_DIR } from "../services/runtime-paths.js";
import { sortTasksForDisplay, type StoredTask } from "../services/task-store.js";

export interface TodayTask {
  id: string;
  text: string;
  priority: string;
  due?: string;
}

const RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function listTasks(raw: unknown): { tasks: StoredTask[]; error?: string } {
  if (raw == null) return { tasks: [] };
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { tasks?: unknown }).tasks)
      ? (raw as { tasks: unknown[] }).tasks
      : null;
  if (!list) return { tasks: [], error: "tasks.json is not a task list" };
  const tasks: StoredTask[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text : typeof row.title === "string" ? row.title : "";
    if (!text.trim()) continue;
    const priority = row.priority === "low" || row.priority === "medium" || row.priority === "high" || row.priority === "urgent"
      ? row.priority
      : "medium";
    tasks.push({
      id: typeof row.id === "string" && row.id ? row.id : `task_${tasks.length + 1}`,
      text,
      due: typeof row.due === "string" ? row.due : typeof row.dueDate === "string" ? row.dueDate : undefined,
      priority,
      completed: row.completed === true,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      completedAt: typeof row.completedAt === "string" ? row.completedAt : undefined,
    });
  }
  return { tasks: sortTasksForDisplay(tasks) };
}

export function pickNextTask(tasks: TodayTask[]): TodayTask | null {
  const open = tasks.filter((task) => task.text?.trim());
  open.sort((a, b) => {
    const byPriority = (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2);
    if (byPriority !== 0) return byPriority;
    return (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99");
  });
  return open[0] || null;
}

function readTaskFile(): { tasks: StoredTask[]; error?: string } {
  const file = path.join(DATA_DIR, "tasks.json");
  if (!existsSync(file)) return { tasks: [] };
  try {
    return listTasks(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return { tasks: [], error: "tasks.json could not be read" };
  }
}

export async function todayRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/today", async () => {
    const loaded = readTaskFile();
    if (loaded.error) return { task: null };
    const open = loaded.tasks.filter((task) => !task.completed).map((task) => ({
      id: task.id,
      text: task.text,
      priority: task.priority,
      due: task.due,
    }));
    return { task: pickNextTask(open) };
  });

  app.get("/api/tasks", async () => readTaskFile());
}
