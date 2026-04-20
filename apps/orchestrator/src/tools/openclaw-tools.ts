// Phase 3 — OpenClaw Integration Tools
// Web search, Gmail, YouTube, Notion, VAPI, files, shell, reminders, image analysis
//
// Architecture: Direct API calls where keys are available.
// OpenClaw bridge as fallback for services needing OAuth (Gmail, YouTube).
// Every tool degrades gracefully when its service is unavailable.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import {
  callOpenClaw,
  isOpenClawAvailable,
} from "../services/openclaw-bridge.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from "fs";
import { join, resolve, normalize } from "path";
import { execFileSync } from "child_process";

// ─── Config ──────────────────────────────────────────────────────
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const VAPI_API_KEY = process.env.VAPI_API_KEY || "";
const VAPI_ASSISTANT_ID =
  process.env.VAPI_ASSISTANT_ID || "4653720f-ef5d-4f08-acaf-89422bf203ab";
const USER_HOME = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368";

// File access whitelist — JARVIS can only read/write within these dirs
const ALLOWED_PATHS = [
  normalize(join(USER_HOME, "jarvis")),
  normalize(join(USER_HOME, "projects")),
  normalize(join(USER_HOME, "Desktop")),
  normalize(join(USER_HOME, "Documents")),
  normalize(join(USER_HOME, "Downloads")),
  normalize(join(USER_HOME, ".openclaw", "workspace")),
];

// Reminders storage
const DATA_DIR = join(USER_HOME, "JARVIS", "apps", "orchestrator", "data");
const REMINDERS_FILE = join(DATA_DIR, "reminders.json");

// ─── Helpers ─────────────────────────────────────────────────────

function isPathAllowed(filePath: string): boolean {
  try {
    // Resolve symlinks to prevent traversal attacks
    let resolved: string;
    try {
      resolved = normalize(realpathSync(resolve(filePath)));
    } catch {
      // File doesn't exist yet (write operation) — resolve the parent dir
      const parent = resolve(filePath, "..");
      try {
        const realParent = realpathSync(parent);
        const filename = filePath.split(/[/\\]/).pop() || "";
        resolved = normalize(join(realParent, filename));
      } catch {
        return false; // Parent doesn't exist either — deny
      }
    }
    // Strict child check: must be inside an allowed dir, not just prefix-matching
    return ALLOWED_PATHS.some((allowed) =>
      resolved === allowed || resolved.startsWith(allowed + "\\") || resolved.startsWith(allowed + "/")
    );
  } catch {
    return false;
  }
}

function makeResult(
  success: boolean,
  data?: unknown,
  error?: string
): ToolResult {
  return { toolCallId: "", success, data, error };
}

// ─── Web Search (Tavily API — direct) ────────────────────────────

const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Searches the web for current information. Returns relevant results with titles, URLs, and snippets.",
  category: "integration",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "The search query",
      required: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of results (1-10, default 5)",
      required: false,
      default: 5,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const query = params.query as string;
    const count = Math.min(10, Math.max(1, (params.count as number) || 5));

    if (!TAVILY_API_KEY) {
      // Fallback to OpenClaw if available
      if (await isOpenClawAvailable()) {
        try {
          const result = await callOpenClaw("web_search", { query, count });
          return makeResult(true, result);
        } catch {
          return makeResult(
            false,
            undefined,
            "Web search unavailable. Set TAVILY_API_KEY in .env or start OpenClaw."
          );
        }
      }
      return makeResult(
        false,
        undefined,
        "Web search not configured. Add TAVILY_API_KEY to .env."
      );
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          max_results: count,
          include_answer: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        answer?: string;
        results: Array<{
          title: string;
          url: string;
          content: string;
        }>;
      };

      return makeResult(true, {
        answer: data.answer,
        results: data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content?.slice(0, 300),
        })),
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Web search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── Web Fetch (read a URL's content) ────────────────────────────

const webFetchTool: Tool = {
  name: "web_fetch",
  description:
    "Fetches and reads the content of a web page. Returns the text content.",
  category: "integration",
  parameters: [
    {
      name: "url",
      type: "string",
      description: "The URL to fetch",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const url = params.url as string;

    // Validate URL
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return makeResult(false, undefined, "Only http/https URLs are allowed.");
      }
    } catch {
      return makeResult(false, undefined, "Invalid URL format.");
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; JARVIS/1.0; +http://localhost)",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return makeResult(
          false,
          undefined,
          `Failed to fetch URL: HTTP ${response.status}`
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text") && !contentType.includes("json")) {
        return makeResult(false, undefined, "URL returned non-text content.");
      }

      const text = await response.text();
      // Strip HTML tags for readability, keep text content
      const cleaned = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10_000);

      return makeResult(true, {
        url,
        content: cleaned,
        contentLength: text.length,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── Gmail (via OpenClaw — needs OAuth) ──────────────────────────

const gmailInboxTool: Tool = {
  name: "gmail_inbox",
  description: "Gets recent emails from Gmail inbox. Returns subject, sender, date, and snippet.",
  category: "integration",
  parameters: [
    {
      name: "limit",
      type: "number",
      description: "Number of emails to retrieve (default 10)",
      required: false,
      default: 10,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const limit = (params.limit as number) || 10;

    if (!(await isOpenClawAvailable())) {
      return makeResult(
        false,
        undefined,
        "Gmail requires OpenClaw to be running. Start OpenClaw with 'openclaw start' and try again."
      );
    }

    try {
      const result = await callOpenClaw("gmail_list", { limit });
      return makeResult(true, result);
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Gmail check failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

const gmailSendTool: Tool = {
  name: "gmail_send",
  description:
    "Sends an email via Gmail. IMPORTANT: Always confirm with the user before sending.",
  category: "integration",
  parameters: [
    {
      name: "to",
      type: "string",
      description: "Recipient email address",
      required: true,
    },
    {
      name: "subject",
      type: "string",
      description: "Email subject line",
      required: true,
    },
    {
      name: "body",
      type: "string",
      description: "Email body text",
      required: true,
    },
    {
      name: "confirmed",
      type: "boolean",
      description: "Must be true — confirms the user approved sending this email",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    // Permission gate: never send without explicit confirmation
    if (params.confirmed !== true) {
      return makeResult(
        false,
        undefined,
        "Email not sent. I need your confirmation first, sir. Shall I send this email?"
      );
    }

    if (!(await isOpenClawAvailable())) {
      return makeResult(
        false,
        undefined,
        "Gmail requires OpenClaw to be running."
      );
    }

    try {
      const result = await callOpenClaw("gmail_send", {
        to: params.to,
        subject: params.subject,
        body: params.body,
      });
      return makeResult(true, result);
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Email send failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

const gmailSearchTool: Tool = {
  name: "gmail_search",
  description: "Searches Gmail for emails matching a query.",
  category: "integration",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query (same syntax as Gmail search)",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    if (!(await isOpenClawAvailable())) {
      return makeResult(
        false,
        undefined,
        "Gmail requires OpenClaw to be running."
      );
    }

    try {
      const result = await callOpenClaw("gmail_search", {
        query: params.query,
      });
      return makeResult(true, result);
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Gmail search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── YouTube (via OpenClaw — needs OAuth) ────────────────────────

const youtubeStatsTool: Tool = {
  name: "youtube_channel_stats",
  description:
    "Gets YouTube channel stats — subscribers, views, recent video performance.",
  category: "integration",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    if (!(await isOpenClawAvailable())) {
      return makeResult(
        false,
        undefined,
        "YouTube requires OpenClaw to be running."
      );
    }

    try {
      const result = await callOpenClaw("youtube_channel_stats", {});
      return makeResult(true, result);
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `YouTube stats failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── Notion (direct API — key available) ─────────────────────────

function getNotionKey(): string {
  if (NOTION_API_KEY) return NOTION_API_KEY;

  // Try reading from config file
  try {
    const keyPath = join(USER_HOME, ".config", "notion", "api_key");
    return readFileSync(keyPath, "utf-8").trim();
  } catch {
    return "";
  }
}

const notionCreateTool: Tool = {
  name: "notion_create",
  description: "Creates a new page in Notion with a title and content.",
  category: "integration",
  parameters: [
    {
      name: "title",
      type: "string",
      description: "Page title",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "Page content (plain text)",
      required: true,
    },
    {
      name: "parent_id",
      type: "string",
      description: "Parent page ID (optional — creates in default workspace if omitted)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const apiKey = getNotionKey();
    if (!apiKey) {
      return makeResult(
        false,
        undefined,
        "Notion not configured. Add NOTION_API_KEY to .env or save it at ~/.config/notion/api_key."
      );
    }

    try {
      const body: Record<string, unknown> = {
        properties: {
          title: {
            title: [{ text: { content: params.title as string } }],
          },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                { text: { content: params.content as string } },
              ],
            },
          },
        ],
      };

      if (params.parent_id) {
        body.parent = { page_id: params.parent_id as string };
      } else {
        body.parent = { type: "page_id", page_id: "" };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.text().catch(() => "");
        throw new Error(`Notion API error ${response.status}: ${err.slice(0, 200)}`);
      }

      const data = (await response.json()) as { id: string; url: string };
      return makeResult(true, {
        message: `Created Notion page: ${params.title}`,
        pageId: data.id,
        url: data.url,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Notion create failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

const notionSearchTool: Tool = {
  name: "notion_search",
  description: "Searches Notion for pages matching a query.",
  category: "integration",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const apiKey = getNotionKey();
    if (!apiKey) {
      return makeResult(
        false,
        undefined,
        "Notion not configured. Add NOTION_API_KEY to .env."
      );
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ query: params.query as string }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        results: Array<{
          id: string;
          url: string;
          properties?: Record<string, unknown>;
        }>;
      };

      return makeResult(true, {
        count: data.results.length,
        results: data.results.slice(0, 10).map((r) => ({
          id: r.id,
          url: r.url,
        })),
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Notion search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── VAPI Phone Calls (direct API — key available) ──────────────

const vapiCallTool: Tool = {
  name: "vapi_call",
  description:
    "Makes an AI phone call using VAPI. IMPORTANT: Always confirm with the user before calling.",
  category: "integration",
  parameters: [
    {
      name: "phone_number",
      type: "string",
      description: "Phone number to call (with country code, e.g., +16041234567)",
      required: true,
    },
    {
      name: "confirmed",
      type: "boolean",
      description: "Must be true — confirms the user approved this phone call",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    // Permission gate
    if (params.confirmed !== true) {
      return makeResult(
        false,
        undefined,
        "Phone call not made. I need your confirmation first, sir. Shall I make this call?"
      );
    }

    if (!VAPI_API_KEY) {
      return makeResult(
        false,
        undefined,
        "VAPI not configured. Add VAPI_API_KEY to .env."
      );
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch("https://api.vapi.ai/call/phone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId: VAPI_ASSISTANT_ID,
          phoneNumberId: "1ffd5405-6f41-43e4-9e26-845a16571159",
          customer: {
            number: params.phone_number as string,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.text().catch(() => "");
        throw new Error(`VAPI error ${response.status}: ${err.slice(0, 200)}`);
      }

      const data = (await response.json()) as { id: string; status: string };
      return makeResult(true, {
        message: `Call initiated to ${params.phone_number}`,
        callId: data.id,
        status: data.status,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `VAPI call failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── File Read/Write (direct — path whitelisted) ─────────────────

const fileReadTool: Tool = {
  name: "file_read",
  description:
    "Reads a file from the filesystem. Restricted to safe directories only.",
  category: "integration",
  parameters: [
    {
      name: "path",
      type: "string",
      description: "Absolute file path to read",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;

    if (!isPathAllowed(filePath)) {
      return makeResult(
        false,
        undefined,
        `Access denied. File must be in one of: ${ALLOWED_PATHS.join(", ")}`
      );
    }

    try {
      if (!existsSync(filePath)) {
        return makeResult(false, undefined, `File not found: ${filePath}`);
      }

      const content = readFileSync(filePath, "utf-8");

      // Cap at 50KB to prevent memory issues
      if (content.length > 50_000) {
        return makeResult(true, {
          content: content.slice(0, 50_000),
          truncated: true,
          totalLength: content.length,
        });
      }

      return makeResult(true, { content, truncated: false });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `File read failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

const fileWriteTool: Tool = {
  name: "file_write",
  description:
    "Writes content to a file. Restricted to safe directories only.",
  category: "integration",
  parameters: [
    {
      name: "path",
      type: "string",
      description: "Absolute file path to write",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "Content to write to the file",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    const content = params.content as string;

    if (!isPathAllowed(filePath)) {
      return makeResult(
        false,
        undefined,
        `Access denied. File must be in one of: ${ALLOWED_PATHS.join(", ")}`
      );
    }

    // Cap content size at 1MB
    if (content.length > 1_000_000) {
      return makeResult(
        false,
        undefined,
        "Content too large. Maximum 1MB per write."
      );
    }

    try {
      // Ensure parent directory exists
      const dir = filePath.replace(/[/\\][^/\\]*$/, "");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filePath, content, "utf-8");
      return makeResult(true, {
        message: `Written ${content.length} bytes to ${filePath}`,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `File write failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
};

// ─── Shell Run (PowerShell — gated, using execFileSync) ──────────

const shellRunTool: Tool = {
  name: "shell_run",
  description:
    "Runs a PowerShell command. SECURITY: Always confirm with the user before executing shell commands.",
  category: "integration",
  parameters: [
    {
      name: "command",
      type: "string",
      description: "The PowerShell command to execute",
      required: true,
    },
    {
      name: "confirmed",
      type: "boolean",
      description: "Must be true — confirms the user approved this command",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    // Permission gate
    if (params.confirmed !== true) {
      return makeResult(
        false,
        undefined,
        "Command not executed. I need your confirmation first, sir. Shall I run this command?"
      );
    }

    const command = (params.command as string).slice(0, 1000);

    if (command.length < 2) {
      return makeResult(false, undefined, "Command too short or invalid.");
    }

    try {
      // Use execFileSync to avoid shell injection — passes command as argument
      const output = execFileSync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", command],
        {
          timeout: 30_000,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        }
      );

      return makeResult(true, {
        output: output.trim().slice(0, 10_000),
        command,
      });
    } catch (error) {
      const execError = error as { stderr?: string; status?: number };
      return makeResult(
        false,
        undefined,
        `Command failed: ${(execError.stderr || "Unknown error").slice(0, 500)}`
      );
    }
  },
};

// ─── Reminders (local JSON + setTimeout) ─────────────────────────

interface Reminder {
  id: string;
  text: string;
  datetime: string;
  fired: boolean;
  createdAt: string;
}

function loadReminders(): Reminder[] {
  try {
    if (existsSync(REMINDERS_FILE)) {
      const data = JSON.parse(readFileSync(REMINDERS_FILE, "utf-8"));
      return data.reminders || [];
    }
  } catch { /* ignore */ }
  return [];
}

function saveReminders(reminders: Reminder[]): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(
    REMINDERS_FILE,
    JSON.stringify({ reminders, lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

// Active timers for in-process reminders
const activeTimers = new Map<string, NodeJS.Timeout>();

function scheduleReminder(reminder: Reminder): void {
  const fireAt = new Date(reminder.datetime).getTime();
  const delay = fireAt - Date.now();

  if (delay <= 0 || delay > 24 * 60 * 60 * 1000) {
    // Don't schedule if already past or more than 24h away
    return;
  }

  const timer = setTimeout(() => {
    console.log(`[Reminder] FIRED: ${reminder.text}`);
    reminder.fired = true;
    const reminders = loadReminders();
    const idx = reminders.findIndex((r) => r.id === reminder.id);
    if (idx !== -1) {
      reminders[idx].fired = true;
      saveReminders(reminders);
    }
    activeTimers.delete(reminder.id);
  }, delay);

  activeTimers.set(reminder.id, timer);
}

// On startup, schedule any pending reminders within 24h
function initReminders(): void {
  const reminders = loadReminders();
  for (const r of reminders) {
    if (!r.fired) {
      scheduleReminder(r);
    }
  }
}

const setReminderTool: Tool = {
  name: "set_reminder",
  description:
    "Sets a reminder for a specific date/time. JARVIS will alert at the scheduled time.",
  category: "integration",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "What to remind about",
      required: true,
    },
    {
      name: "datetime",
      type: "string",
      description:
        "When to fire the reminder (ISO 8601 format, e.g., 2026-02-27T19:00:00)",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const text = params.text as string;
    const datetime = params.datetime as string;

    // Validate datetime
    const fireDate = new Date(datetime);
    if (isNaN(fireDate.getTime())) {
      return makeResult(false, undefined, "Invalid datetime format. Use ISO 8601 (e.g., 2026-02-27T19:00:00).");
    }

    if (fireDate.getTime() < Date.now()) {
      return makeResult(false, undefined, "Cannot set a reminder in the past, sir.");
    }

    const reminder: Reminder = {
      id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      datetime,
      fired: false,
      createdAt: new Date().toISOString(),
    };

    const reminders = loadReminders();

    // Cap at 100 reminders
    if (reminders.length >= 100) {
      const fired = reminders.filter((r) => r.fired);
      if (fired.length > 0) {
        const oldestFired = fired.sort(
          (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        )[0];
        const idx = reminders.findIndex((r) => r.id === oldestFired.id);
        if (idx !== -1) reminders.splice(idx, 1);
      } else {
        return makeResult(
          false,
          undefined,
          "Too many active reminders (100 max). Complete or remove some first."
        );
      }
    }

    reminders.push(reminder);
    saveReminders(reminders);
    scheduleReminder(reminder);

    return makeResult(true, {
      message: `Reminder set: "${text}" at ${fireDate.toLocaleString()}`,
      id: reminder.id,
      firesAt: datetime,
    });
  },
};

const listRemindersTool: Tool = {
  name: "list_reminders",
  description: "Lists all pending (unfired) reminders.",
  category: "integration",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const reminders = loadReminders();
    const pending = reminders
      .filter((r) => !r.fired)
      .sort(
        (a, b) =>
          new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
      );

    return makeResult(true, {
      count: pending.length,
      reminders: pending.map((r) => ({
        id: r.id,
        text: r.text,
        firesAt: r.datetime,
      })),
    });
  },
};

// ─── Netlify (direct API or OpenClaw fallback) ───────────────────

const netlifySitesTool: Tool = {
  name: "netlify_sites",
  description: "Lists all Netlify sites associated with the account.",
  category: "integration",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;

    if (netlifyToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        const response = await fetch("https://api.netlify.com/api/v1/sites", {
          headers: { Authorization: `Bearer ${netlifyToken}` },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Netlify API error: ${response.status}`);
        }

        const sites = (await response.json()) as Array<{
          id: string;
          name: string;
          url: string;
          ssl_url: string;
          updated_at: string;
        }>;

        return makeResult(true, {
          count: sites.length,
          sites: sites.slice(0, 20).map((s) => ({
            name: s.name,
            url: s.ssl_url || s.url,
            updatedAt: s.updated_at,
          })),
        });
      } catch (error) {
        return makeResult(
          false,
          undefined,
          `Netlify failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Fallback to OpenClaw
    if (await isOpenClawAvailable()) {
      try {
        const result = await callOpenClaw("netlify_list_sites", {});
        return makeResult(true, result);
      } catch {
        return makeResult(
          false,
          undefined,
          "Netlify not configured. Add NETLIFY_AUTH_TOKEN to .env."
        );
      }
    }

    return makeResult(
      false,
      undefined,
      "Netlify not configured. Add NETLIFY_AUTH_TOKEN to .env."
    );
  },
};

// ─── Registration ────────────────────────────────────────────────

export function registerOpenClawTools(): void {
  // Web
  toolRegistry.register(webSearchTool);
  toolRegistry.register(webFetchTool);

  // Gmail
  toolRegistry.register(gmailInboxTool);
  toolRegistry.register(gmailSendTool);
  toolRegistry.register(gmailSearchTool);

  // YouTube
  toolRegistry.register(youtubeStatsTool);

  // Notion
  toolRegistry.register(notionCreateTool);
  toolRegistry.register(notionSearchTool);

  // VAPI
  toolRegistry.register(vapiCallTool);

  // Files
  toolRegistry.register(fileReadTool);
  toolRegistry.register(fileWriteTool);

  // Shell
  toolRegistry.register(shellRunTool);

  // Reminders
  toolRegistry.register(setReminderTool);
  toolRegistry.register(listRemindersTool);

  // Netlify
  toolRegistry.register(netlifySitesTool);

  // Initialize scheduled reminders
  initReminders();
}
