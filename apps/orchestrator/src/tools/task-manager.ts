// Task Management Tools for JARVIS — Phase 2, Step 2.4
// CRUD tasks with JSON file storage
// Spec: task_add, task_complete, task_delete, task_list, task_search, task_update

import { promises as fs } from "fs";
import path from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { DATA_DIR } from "../services/runtime-paths.js";
import { resolveTaskIdentifier, sortTasksForDisplay, type StoredTask } from "../services/task-store.js";

// ─── Interfaces ──────────────────────────────────────────────

export interface Task {
  id: string;
  text: string;
  due?: string;
  priority: "low" | "medium" | "high" | "urgent";
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

interface TaskStore {
  tasks: Task[];
  lastUpdated: string;
}

// ─── Storage ─────────────────────────────────────────────────

const TASK_FILE = path.join(DATA_DIR, "tasks.json");

// Max tasks to prevent unbounded growth
const MAX_TASKS = 500;

async function loadTasks(): Promise<TaskStore> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(TASK_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { tasks: [], lastUpdated: new Date().toISOString() };
  }
}

async function saveTasks(store: TaskStore): Promise<void> {
  store.lastUpdated = new Date().toISOString();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TASK_FILE, JSON.stringify(store, null, 2));
}

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ─── Helper: find task by ID, number, or partial title match ──

function findTask(
  tasks: Task[],
  identifier: string
): { task?: Task; error?: string } {
  const resolved = resolveTaskIdentifier(tasks as StoredTask[], identifier);
  return resolved;
}

// ─── Tool Definitions ────────────────────────────────────────

const taskAddTool: Tool = {
  name: "task_add",
  description:
    "Add a new task. Danny can dump any task and JARVIS remembers it.",
  category: "tasks",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "What needs to be done",
      required: true,
    },
    {
      name: "due",
      type: "string",
      description: "Due date (e.g., 'tomorrow', '2026-03-01', 'next Friday')",
      required: false,
    },
    {
      name: "priority",
      type: "string",
      description: "Priority level",
      required: false,
      enum: ["low", "medium", "high", "urgent"],
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadTasks();

    if (store.tasks.length >= MAX_TASKS) {
      return {
        toolCallId: "",
        success: false,
        error: `Task limit reached (${MAX_TASKS}). Complete or delete some tasks first.`,
      };
    }

    const task: Task = {
      id: generateId(),
      text: params.text as string,
      due: params.due as string | undefined,
      priority: (params.priority as Task["priority"]) || "medium",
      completed: false,
      createdAt: new Date().toISOString(),
    };

    store.tasks.push(task);
    await saveTasks(store);

    const pendingCount = store.tasks.filter((t) => !t.completed).length;
    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Added "${task.text}" to your tasks. ${pendingCount} pending.`,
        task,
      },
    };
  },
};

const taskListTool: Tool = {
  name: "task_list",
  description:
    "List tasks. Filter by completed status or priority.",
  category: "tasks",
  parameters: [
    {
      name: "show_completed",
      type: "boolean",
      description: "Include completed tasks (default: false)",
      required: false,
    },
    {
      name: "priority",
      type: "string",
      description: "Filter by priority level",
      required: false,
      enum: ["low", "medium", "high", "urgent"],
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadTasks();
    let tasks = store.tasks;

    // Filter completed
    if (!params.show_completed) {
      tasks = tasks.filter((t) => !t.completed);
    }

    // Filter priority
    if (params.priority) {
      tasks = tasks.filter((t) => t.priority === params.priority);
    }

    tasks = sortTasksForDisplay(tasks);

    if (tasks.length === 0) {
      return {
        toolCallId: "",
        success: true,
        data: {
          message: "No tasks found matching criteria.",
          tasks: [],
          count: 0,
        },
      };
    }

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `${tasks.length} task(s) found.`,
        tasks,
        count: tasks.length,
      },
    };
  },
};

const taskCompleteTool: Tool = {
  name: "task_complete",
  description: "Mark a task as completed by ID, number, or title match.",
  category: "tasks",
  parameters: [
    {
      name: "identifier",
      type: "string",
      description:
        "Task ID, list number (1-based), or partial title to match",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadTasks();
    const found = findTask(store.tasks, params.identifier as string);
    const task = found.task;

    if (!task) {
      return {
        toolCallId: "",
        success: false,
        error: found.error || `Task not found: "${params.identifier}"`,
      };
    }

    if (task.completed) {
      return {
        toolCallId: "",
        success: false,
        error: `"${task.text}" is already completed.`,
      };
    }

    task.completed = true;
    task.completedAt = new Date().toISOString();
    await saveTasks(store);

    const remaining = store.tasks.filter((t) => !t.completed).length;
    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Completed "${task.text}". ${remaining} tasks remaining.`,
        task,
      },
    };
  },
};

const taskDeleteTool: Tool = {
  name: "task_delete",
  description: "Permanently remove a task by ID, number, or title match.",
  category: "tasks",
  parameters: [
    {
      name: "identifier",
      type: "string",
      description:
        "Task ID, list number (1-based), or partial title to match",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadTasks();
    const found = findTask(store.tasks, params.identifier as string);
    const task = found.task;

    if (!task) {
      return {
        toolCallId: "",
        success: false,
        error: found.error || `Task not found: "${params.identifier}"`,
      };
    }

    store.tasks = store.tasks.filter((t) => t.id !== task.id);
    await saveTasks(store);

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Removed "${task.text}".`,
        task,
      },
    };
  },
};

const taskSearchTool: Tool = {
  name: "task_search",
  description:
    "Search tasks by keyword in the task text. Searches both pending and completed.",
  category: "tasks",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search keyword or phrase",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadTasks();
    const query = (params.query as string).toLowerCase();

    const matches = store.tasks.filter((t) =>
      t.text.toLowerCase().includes(query)
    );

    return {
      toolCallId: "",
      success: true,
      data: {
        message:
          matches.length > 0
            ? `Found ${matches.length} task(s) matching "${params.query}".`
            : `No tasks found matching "${params.query}".`,
        tasks: matches,
        count: matches.length,
      },
    };
  },
};

const taskUpdateTool: Tool = {
  name: "task_update",
  description:
    "Update a task's text, due date, or priority. Find by ID, number, or title match.",
  category: "tasks",
  parameters: [
    {
      name: "identifier",
      type: "string",
      description:
        "Task ID, list number (1-based), or partial title to match",
      required: true,
    },
    {
      name: "text",
      type: "string",
      description: "New task text (optional)",
      required: false,
    },
    {
      name: "due",
      type: "string",
      description: "New due date (optional)",
      required: false,
    },
    {
      name: "priority",
      type: "string",
      description: "New priority (optional)",
      required: false,
      enum: ["low", "medium", "high", "urgent"],
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const store = await loadTasks();
    const found = findTask(store.tasks, params.identifier as string);
    const task = found.task;

    if (!task) {
      return {
        toolCallId: "",
        success: false,
        error: found.error || `Task not found: "${params.identifier}"`,
      };
    }

    // Apply updates
    if (params.text) task.text = params.text as string;
    if (params.due) task.due = params.due as string;
    if (params.priority) task.priority = params.priority as Task["priority"];

    await saveTasks(store);

    return {
      toolCallId: "",
      success: true,
      data: {
        message: `Updated "${task.text}".`,
        task,
      },
    };
  },
};

// ─── Registration ────────────────────────────────────────────

export function registerTaskTools(): void {
  toolRegistry.register(taskAddTool);
  toolRegistry.register(taskListTool);
  toolRegistry.register(taskCompleteTool);
  toolRegistry.register(taskDeleteTool);
  toolRegistry.register(taskSearchTool);
  toolRegistry.register(taskUpdateTool);
}
