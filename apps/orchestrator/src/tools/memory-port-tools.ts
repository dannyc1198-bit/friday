import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { getMemoryPort, type MemoryScope } from "../services/memory/port.js";
import { socialAccounts } from "../services/memory/sources/social-readonly.js";
import { readProjects } from "../services/memory/sources/tracker.js";
import { getObsidianVaultPath } from "../services/vault-config.js";
import { pathAllowed } from "../services/memory/sources/files-readonly.js";
import { spawn } from "child_process";
import os from "os";
import path from "path";

const SCOPES: MemoryScope[] = ["obsidian", "files", "social", "tracker", "chat"];

function spoken(hits: { title: string; text: string; source: string }[]): string {
  if (hits.length === 0) return "I don't have anything stored on that yet.";
  const top = hits[0];
  return `${top.source}: ${top.title}. ${top.text.replace(/\s+/g, " ").slice(0, 180)}`;
}

const recallTool: Tool = {
  name: "memory_recall",
  description:
    "Search the one local memory index: vault notes, files, projects, chat keywords, and connected social posts. Use for 'what do you know about X' and 'find my ...'. Durable people facts still use brain_recall.",
  category: "memory",
  parameters: [
    { name: "query", type: "string", description: "What to look up", required: true },
    { name: "scope", type: "string", description: "obsidian, files, social, tracker, chat, or all", required: false },
  ],
  execute: async (params): Promise<ToolResult> => {
    const query = String(params.query || "").trim();
    if (query.length < 2) return { toolCallId: "", success: false, error: "Query is too short." };
    const scope = String(params.scope || "all");
    const scopes = scope === "all" || !SCOPES.includes(scope as MemoryScope) ? "all" : [scope as MemoryScope];
    const hits = await getMemoryPort().recall(query, scopes, 5);
    return { toolCallId: "", success: true, data: { message: spoken(hits), hits } };
  },
};

const noteTool: Tool = {
  name: "memory_note",
  description:
    "Write a note into Jarvis/ or Inbox/ in the Obsidian vault. Never deletes. For a lasting fact about a person or client, use brain_remember instead.",
  category: "memory",
  parameters: [
    { name: "text", type: "string", description: "What the note should say", required: true },
    { name: "title", type: "string", description: "Note title", required: false },
    { name: "folder", type: "string", description: "Jarvis or Inbox", required: false },
  ],
  execute: async (params): Promise<ToolResult> => {
    const folder = params.folder === "Inbox" ? "Inbox" : "Jarvis";
    try {
      const saved = await getMemoryPort().remember({
        text: String(params.text || ""),
        title: params.title ? String(params.title) : undefined,
        folder,
      });
      const message = saved.duplicate ? "Already had that note." : `Wrote ${saved.path}.`;
      return { toolCallId: "", success: true, data: { message, ...saved } };
    } catch (error) {
      return { toolCallId: "", success: false, error: error instanceof Error ? error.message : "Could not write the note." };
    }
  },
};

const forgetTool: Tool = {
  name: "memory_forget",
  description: "Hide an indexed memory from recall. Does not delete the Obsidian note or the file.",
  category: "memory",
  parameters: [{ name: "target", type: "string", description: "Memory id or a few words that identify it", required: true }],
  execute: async (params): Promise<ToolResult> => {
    const result = await getMemoryPort().forget(String(params.target || ""));
    return { toolCallId: "", success: result.forgotten > 0, data: result, error: result.forgotten > 0 ? undefined : result.message };
  },
};

const filesFindTool: Tool = {
  name: "files_find",
  description: "Find a file by name or by words in a small text file. Read-only. Say 'find my ...'.",
  category: "memory",
  parameters: [{ name: "query", type: "string", description: "File name or words to find", required: true }],
  execute: async (params): Promise<ToolResult> => {
    const hits = await getMemoryPort().recall(String(params.query || ""), ["files"], 5);
    return { toolCallId: "", success: true, data: { message: spoken(hits), hits } };
  },
};

const filesListTool: Tool = {
  name: "files_list",
  description: "List one folder inside Documents, Desktop, Downloads, Personal-Projects, Pictures, or Videos. Read-only.",
  category: "memory",
  parameters: [{ name: "folder", type: "string", description: "Folder path or a folder name inside an allowed root", required: true }],
  execute: async (params): Promise<ToolResult> => {
    try {
      const entries = getMemoryPort().listFolder(String(params.folder || ""));
      const message = entries.length ? `That folder has ${entries.slice(0, 8).map((entry) => entry.name).join(", ")}.` : "That folder is empty.";
      return { toolCallId: "", success: true, data: { message, entries } };
    } catch (error) {
      return { toolCallId: "", success: false, error: error instanceof Error ? error.message : "Could not list that folder." };
    }
  },
};

const filesOpenTool: Tool = {
  name: "files_open",
  description: "Open a file that is inside an allowed folder, with the default app. Does not edit it.",
  category: "memory",
  parameters: [{ name: "path", type: "string", description: "Full path from files_find", required: true }],
  execute: async (params): Promise<ToolResult> => {
    const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
    const roots = (process.env.FRIDAY_FILE_ROOTS || "")
      .split(/[;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    const allowed = roots.length
      ? roots
      : ["Documents", "Desktop", "Downloads", "Personal-Projects", "Pictures", "Videos"].map((name) => path.join(home, name));
    const resolved = pathAllowed(allowed, String(params.path || ""));
    if (!resolved) return { toolCallId: "", success: false, error: "That file is outside the folders I am allowed to open." };
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", resolved], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [resolved], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [resolved], { detached: true, stdio: "ignore" }).unref();
    }
    return { toolCallId: "", success: true, data: { message: `Opened ${path.basename(resolved)}.` } };
  },
};

const projectNextTool: Tool = {
  name: "project_next",
  description: "Say the single next step on the most stalled or soonest project. One step only.",
  category: "memory",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const step = await getMemoryPort().nextStep();
    return { toolCallId: "", success: true, data: { message: step || "No open next step is written down." } };
  },
};

const projectSaveTool: Tool = {
  name: "project_save",
  description: "Save one project into Jarvis/Projects.md. Status is current, upcoming, paused, or done.",
  category: "memory",
  parameters: [
    { name: "name", type: "string", description: "Project name", required: true },
    { name: "next_step", type: "string", description: "The one next action", required: true },
    { name: "status", type: "string", description: "current, upcoming, paused, or done", required: false },
    { name: "due", type: "string", description: "YYYY-MM-DD", required: false },
  ],
  execute: async (params): Promise<ToolResult> => {
    const name = String(params.name || "").trim();
    const nextStep = String(params.next_step || "").trim();
    if (!name || !nextStep) return { toolCallId: "", success: false, error: "Name and next step are required." };
    const status = ["current", "upcoming", "paused", "done"].includes(String(params.status)) ? String(params.status) as "current" | "upcoming" | "paused" | "done" : "current";
    const port = getMemoryPort();
    const current = await readProjects(getObsidianVaultPath());
    const rest = current.filter((project) => project.name.toLowerCase() !== name.toLowerCase());
    const relative = await port.saveProjects([
      ...rest,
      { name, status, nextStep, due: params.due ? String(params.due) : undefined },
    ]);
    return { toolCallId: "", success: true, data: { message: `Saved ${name}. Next step: ${nextStep}.`, path: relative } };
  },
};

const socialStatusTool: Tool = {
  name: "social_status",
  description: "Which of Danny's social accounts are connected. Read-only. Never repeats keys.",
  category: "memory",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const accounts = socialAccounts();
    const message = accounts.map((account) => account.configured ? `${account.platform} is connected.` : `${account.platform} needs ${account.missing.join(" and ")}.`).join(" ");
    return { toolCallId: "", success: true, data: { message, accounts } };
  },
};

const socialRefreshTool: Tool = {
  name: "social_refresh",
  description: "Pull recent posts from connected social accounts into local memory. Read-only. Does nothing for accounts without keys.",
  category: "memory",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const report = await getMemoryPort().indexAll();
    return { toolCallId: "", success: true, data: { message: `Indexed social posts into local memory. ${report.social} social rows this pass.`, ...report } };
  },
};

export function registerMemoryPortTools(): void {
  for (const tool of [recallTool, noteTool, forgetTool, filesFindTool, filesListTool, filesOpenTool, projectNextTool, projectSaveTool, socialStatusTool, socialRefreshTool]) {
    toolRegistry.register(tool);
  }
}
