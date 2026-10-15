import { existsSync, readFileSync } from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import { DATA_DIR } from "../services/runtime-paths.js";

export interface TodayTask {
  id: string;
  text: string;
  priority: string;
  due?: string;
}

const RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function pickNextTask(tasks: TodayTask[]): TodayTask | null {
  const open = tasks.filter((task) => task.text?.trim());
  open.sort((a, b) => {
    const byPriority = (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2);
    if (byPriority !== 0) return byPriority;
    return (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99");
  });
  return open[0] || null;
}

export async function todayRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/today", async () => {
    const file = path.join(DATA_DIR, "tasks.json");
    if (!existsSync(file)) return { task: null };
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as
        | TodayTask[]
        | { tasks?: Array<TodayTask & { completed?: boolean }> };
      const tasks = (Array.isArray(raw) ? raw : raw.tasks || []) as Array<TodayTask & { completed?: boolean }>;
      const open = tasks.filter((task) => !task.completed).map((task) => ({
        id: task.id,
        text: task.text,
        priority: task.priority,
        due: task.due,
      }));
      return { task: pickNextTask(open) };
    } catch {
      return { task: null };
    }
  });
}
