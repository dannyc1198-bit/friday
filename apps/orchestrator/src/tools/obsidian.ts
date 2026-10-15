// Obsidian Vault Integration for FRIDAY
// Full read-write access to Danny's Second Brain (Wavelength vault)
// Tools: search, read, list, recent, create, edit, daily, delete, tags

import { promises as fs } from "fs";
import path from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { getObsidianVaultPath } from "../services/vault-config.js";

function vaultPath(): string {
  return getObsidianVaultPath();
}
const IGNORED_DIRS = new Set([".obsidian", ".trash", "node_modules"]);

function assertInsideVault(fullPath: string): void {
  const resolved = path.resolve(fullPath);
  const vaultResolved = path.resolve(vaultPath());
  if (!resolved.startsWith(vaultResolved + path.sep) && resolved !== vaultResolved) {
    throw new Error("Path traversal attempt blocked: path resolves outside vault");
  }
}

// ─── Helpers ────────────────────────────────────────────────

async function getAllNotes(dir: string = vaultPath()): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllNotes(full)));
    } else if (entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function relPath(absolute: string): string {
  return path.relative(vaultPath(), absolute).replace(/\\/g, "/");
}

function noteName(filePath: string): string {
  return path.basename(filePath, ".md");
}

// ─── obsidian_search ────────────────────────────────────────

const obsidianSearchTool: Tool = {
  name: "obsidian_search",
  description:
    "Search Danny's Obsidian vault (Second Brain) by keyword. Searches note titles and content. Returns matching notes with context snippets.",
  category: "obsidian",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search keywords (e.g., 'Wavelength revenue', 'Kelowna', 'FRIDAY tools')",
      required: true,
    },
    {
      name: "limit",
      type: "number",
      description: "Max results (default: 10, max: 30)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const query = (params.query as string).toLowerCase().trim();
    const limit = Math.min(Math.max(1, (params.limit as number) || 10), 30);

    if (!query || query.length < 2) {
      return { toolCallId: "", success: false, error: "Query too short (min 2 chars)." };
    }

    const queryWords = query.split(/\s+/).filter((w) => w.length > 1);

    try {
      const notes = await getAllNotes();
      const results: { path: string; name: string; score: number; snippet: string }[] = [];

      for (const notePath of notes) {
        const name = noteName(notePath).toLowerCase();
        const content = await fs.readFile(notePath, "utf-8");
        const lower = content.toLowerCase();

        let score = 0;
        for (const word of queryWords) {
          if (name.includes(word)) score += 3;
          const matches = lower.split(word).length - 1;
          score += Math.min(matches, 5);
        }

        if (score > 0) {
          // Extract a snippet around the first match
          let snippet = "";
          for (const word of queryWords) {
            const idx = lower.indexOf(word);
            if (idx !== -1) {
              const start = Math.max(0, idx - 80);
              const end = Math.min(content.length, idx + word.length + 80);
              snippet = (start > 0 ? "..." : "") + content.slice(start, end).trim() + (end < content.length ? "..." : "");
              break;
            }
          }

          results.push({
            path: relPath(notePath),
            name: noteName(notePath),
            score,
            snippet: snippet.replace(/\n/g, " ").slice(0, 200),
          });
        }
      }

      results.sort((a, b) => b.score - a.score);
      const top = results.slice(0, limit);

      return {
        toolCallId: "",
        success: true,
        data: {
          message: top.length > 0
            ? `Found ${top.length} note(s) matching "${params.query}".`
            : `No notes found matching "${params.query}".`,
          results: top,
          totalNotes: notes.length,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Vault search failed: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── obsidian_read ──────────────────────────────────────────

const obsidianReadTool: Tool = {
  name: "obsidian_read",
  description:
    "Read the full content of an Obsidian note by name or path. Use after searching to get full details.",
  category: "obsidian",
  parameters: [
    {
      name: "note",
      type: "string",
      description: "Note name (e.g., 'FRIDAY', 'Revenue Plan') or relative path (e.g., 'Business/Wavelength Solutions.md')",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const input = (params.note as string).trim();

    try {
      // Try as direct path first
      let fullPath = path.join(vaultPath(), input);
      if (!fullPath.endsWith(".md")) fullPath += ".md";
      assertInsideVault(fullPath);

      try {
        const content = await fs.readFile(fullPath, "utf-8");
        return {
          toolCallId: "",
          success: true,
          data: {
            note: noteName(fullPath),
            path: relPath(fullPath),
            content,
            length: content.length,
          },
        };
      } catch {
        // Not a direct path — search by name
      }

      // Search all notes for a name match
      const notes = await getAllNotes();
      const target = input.toLowerCase().replace(/\.md$/, "");
      const match = notes.find((n) => noteName(n).toLowerCase() === target);

      if (!match) {
        // Fuzzy: partial match
        const partial = notes.filter((n) => noteName(n).toLowerCase().includes(target));
        if (partial.length === 1) {
          const content = await fs.readFile(partial[0], "utf-8");
          return {
            toolCallId: "",
            success: true,
            data: {
              note: noteName(partial[0]),
              path: relPath(partial[0]),
              content,
              length: content.length,
            },
          };
        }
        if (partial.length > 1) {
          return {
            toolCallId: "",
            success: false,
            error: `Multiple matches: ${partial.map((p) => noteName(p)).join(", ")}. Be more specific.`,
          };
        }
        return { toolCallId: "", success: false, error: `Note "${input}" not found in vault.` };
      }

      const content = await fs.readFile(match, "utf-8");
      return {
        toolCallId: "",
        success: true,
        data: {
          note: noteName(match),
          path: relPath(match),
          content,
          length: content.length,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to read note: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── obsidian_list ──────────────────────────────────────────

const obsidianListTool: Tool = {
  name: "obsidian_list",
  description:
    "List all notes in a specific Obsidian folder, or list top-level folders. Useful for browsing the vault structure.",
  category: "obsidian",
  parameters: [
    {
      name: "folder",
      type: "string",
      description: "Folder to list (e.g., 'Business', 'Agents/DanClaw'). Omit or use '/' for root.",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const folder = ((params.folder as string) || "").trim().replace(/^\/+/, "");
    const target = folder ? path.join(vaultPath(), folder) : vaultPath();
    assertInsideVault(target);

    try {
      const entries = await fs.readdir(target, { withFileTypes: true });

      const folders: string[] = [];
      const notes: string[] = [];

      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory()) folders.push(entry.name);
        else if (entry.name.endsWith(".md")) notes.push(entry.name.replace(/\.md$/, ""));
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          folder: folder || "/",
          folders: folders.sort(),
          notes: notes.sort(),
          message: `${folders.length} folder(s), ${notes.length} note(s) in ${folder || "root"}.`,
        },
      };
    } catch {
      return {
        toolCallId: "",
        success: false,
        error: `Folder "${folder || "/"}" not found in vault.`,
      };
    }
  },
};

// ─── obsidian_recent ────────────────────────────────────────

const obsidianRecentTool: Tool = {
  name: "obsidian_recent",
  description:
    "Get the most recently modified Obsidian notes. Useful for seeing what Danny has been working on.",
  category: "obsidian",
  parameters: [
    {
      name: "limit",
      type: "number",
      description: "Number of recent notes (default: 10, max: 30)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const limit = Math.min(Math.max(1, (params.limit as number) || 10), 30);

    try {
      const notes = await getAllNotes();
      const withStats = await Promise.all(
        notes.map(async (n) => {
          const stat = await fs.stat(n);
          return { path: relPath(n), name: noteName(n), modified: stat.mtime.toISOString() };
        })
      );

      withStats.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
      const recent = withStats.slice(0, limit);

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `${recent.length} most recently modified notes.`,
          notes: recent,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to list recent notes: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── Helpers: Templates ────────────────────────────────────

const TEMPLATES: Record<string, (title: string, date: string) => string> = {
  daily: (title: string, date: string) => `# ${date} — Daily Report

## 24-Hour Activity Report

### Agent Activity
- **[[NOVA]]**:
- **[[REX]]**:
- **[[Larry]]**:
- **[[Scout]]**:
- **[[Morning Brief]]**:

### Revenue
- New leads:
- Follow-ups sent:
- Deals closed:
- Revenue today: $

### Content
- Posts published:
- Content created:

### Systems
- [[FRIDAY]] status:
- [[DanClaw]] status:
- Issues/errors:

---

## Today's Priorities
- [ ]
- [ ]
- [ ]

## Notes


## Links
- [[Dashboard]]
- [[Leads Dashboard]]
- [[Revenue Tracker]]
`,
  project: (title: string) => `# ${title}

## Overview


## Status: Planning / Active / Paused / Complete

## Tech Stack
-

## Key Files
- Location:
- GitHub:

## Links
- [[Dashboard]]
`,
  client: (title: string) => `# ${title}

## Business Info
- **Business name**:
- **Industry**:
- **Location**: Fraser Valley
- **Contact**:
- **Phone**:
- **Email**:

## Deal
- **Service**: Free Audit / Paid Audit / AI Setup / Retainer
- **Value**: $
- **Stage**: Lead / Contacted / Audit Done / Proposal / Closed
- **Close date**:

## Audit Results
- Risk score:
- Key findings:
- Report:

## Notes


## Links
- [[Leads Dashboard]]
- [[Revenue Tracker]]
- [[Wavelength Solutions]]
`,
};

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "-").trim();
}

// ─── obsidian_create ───────────────────────────────────────

const obsidianCreateTool: Tool = {
  name: "obsidian_create",
  description:
    "Create a new note in Danny's Obsidian vault. Supports templates (daily, project, client) or custom content. Auto-creates folders if needed.",
  category: "obsidian",
  parameters: [
    {
      name: "title",
      type: "string",
      description: "Note title (becomes filename). E.g., 'ACME Corp', 'FRIDAY Phase 10'",
      required: true,
    },
    {
      name: "folder",
      type: "string",
      description: "Target folder (e.g., 'Clients', 'Projects', 'Daily'). Omit for vault root.",
      required: false,
    },
    {
      name: "template",
      type: "string",
      description: "Template to use: 'daily', 'project', 'client'. Omit for blank note.",
      required: false,
    },
    {
      name: "content",
      type: "string",
      description: "Note content (markdown). Overrides template if both provided.",
      required: false,
    },
    {
      name: "tags",
      type: "string",
      description: "Comma-separated tags to add as frontmatter (e.g., 'client,active,fraser-valley')",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const title = sanitizeFilename((params.title as string).trim());
    const folder = ((params.folder as string) || "").trim();
    const template = ((params.template as string) || "").toLowerCase().trim();
    const customContent = (params.content as string) || "";
    const tags = ((params.tags as string) || "").split(",").map((t) => t.trim()).filter(Boolean);

    if (!title) {
      return { toolCallId: "", success: false, error: "Title is required." };
    }

    const dir = folder ? path.join(vaultPath(), folder) : vaultPath();
    const filePath = path.join(dir, `${title}.md`);
    assertInsideVault(filePath);

    try {
      // Check if already exists
      try {
        await fs.access(filePath);
        return { toolCallId: "", success: false, error: `Note "${title}" already exists in ${folder || "root"}.` };
      } catch {
        // Good — doesn't exist yet
      }

      await ensureDir(dir);

      // Build content
      let body: string;
      if (customContent) {
        body = customContent;
      } else if (template && TEMPLATES[template]) {
        body = TEMPLATES[template](title, todayDate());
      } else {
        body = `# ${title}\n\n`;
      }

      // Add frontmatter if tags provided
      if (tags.length > 0) {
        const frontmatter = `---\ntags: [${tags.join(", ")}]\ncreated: ${todayDate()}\n---\n\n`;
        body = frontmatter + body;
      }

      await fs.writeFile(filePath, body, "utf-8");

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Created note "${title}" in ${folder || "root"}.`,
          path: relPath(filePath),
          template: template || "blank",
          tags,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to create note: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── obsidian_edit ─────────────────────────────────────────

const obsidianEditTool: Tool = {
  name: "obsidian_edit",
  description:
    "Edit an existing Obsidian note — append content, prepend content, or find-and-replace a section. Use for updating daily notes, adding log entries, modifying project status, etc.",
  category: "obsidian",
  parameters: [
    {
      name: "note",
      type: "string",
      description: "Note name or path (e.g., 'FRIDAY', 'Daily/2026-04-03')",
      required: true,
    },
    {
      name: "action",
      type: "string",
      description: "'append' (add to end), 'prepend' (add to start), 'replace' (find and replace), 'overwrite' (replace entire content)",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "Content to add or the new replacement text",
      required: true,
    },
    {
      name: "find",
      type: "string",
      description: "Text to find (required when action is 'replace'). Matches first occurrence.",
      required: false,
    },
    {
      name: "heading",
      type: "string",
      description: "Append under a specific heading (e.g., '## Notes', '### Agent Activity'). Only for 'append' action.",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const input = (params.note as string).trim();
    const action = (params.action as string).toLowerCase().trim();
    const newContent = params.content as string;
    const find = (params.find as string) || "";
    const heading = (params.heading as string) || "";

    if (!["append", "prepend", "replace", "overwrite"].includes(action)) {
      return { toolCallId: "", success: false, error: "Action must be 'append', 'prepend', 'replace', or 'overwrite'." };
    }

    // Resolve note path
    let filePath = path.join(vaultPath(), input);
    if (!filePath.endsWith(".md")) filePath += ".md";
    assertInsideVault(filePath);

    try {
      await fs.access(filePath);
    } catch {
      // Try name-based search
      const notes = await getAllNotes();
      const target = input.toLowerCase().replace(/\.md$/, "");
      const match = notes.find((n) => noteName(n).toLowerCase() === target);
      if (!match) {
        return { toolCallId: "", success: false, error: `Note "${input}" not found.` };
      }
      filePath = match;
      assertInsideVault(filePath);
    }

    try {
      let existing = await fs.readFile(filePath, "utf-8");

      switch (action) {
        case "append":
          if (heading) {
            // Find the heading and insert after it (before the next heading or end)
            const headingIdx = existing.indexOf(heading);
            if (headingIdx === -1) {
              return { toolCallId: "", success: false, error: `Heading "${heading}" not found in note.` };
            }
            // Find end of heading line
            const lineEnd = existing.indexOf("\n", headingIdx);
            if (lineEnd === -1) {
              existing += "\n" + newContent;
            } else {
              existing = existing.slice(0, lineEnd + 1) + newContent + "\n" + existing.slice(lineEnd + 1);
            }
          } else {
            existing += "\n" + newContent;
          }
          break;

        case "prepend":
          // Preserve frontmatter if present
          if (existing.startsWith("---")) {
            const endFm = existing.indexOf("---", 3);
            if (endFm !== -1) {
              const afterFm = endFm + 3;
              existing = existing.slice(0, afterFm) + "\n\n" + newContent + existing.slice(afterFm);
            } else {
              existing = newContent + "\n" + existing;
            }
          } else {
            existing = newContent + "\n" + existing;
          }
          break;

        case "replace":
          if (!find) {
            return { toolCallId: "", success: false, error: "'find' parameter required for replace action." };
          }
          if (!existing.includes(find)) {
            return { toolCallId: "", success: false, error: `Text "${find.slice(0, 50)}..." not found in note.` };
          }
          existing = existing.replace(find, newContent);
          break;

        case "overwrite":
          existing = newContent;
          break;
      }

      await fs.writeFile(filePath, existing, "utf-8");

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `${action === "append" ? "Appended to" : action === "prepend" ? "Prepended to" : action === "replace" ? "Updated" : "Overwrote"} "${noteName(filePath)}".`,
          path: relPath(filePath),
          action,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Edit failed: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── obsidian_daily ────────────────────────────────────────

const obsidianDailyTool: Tool = {
  name: "obsidian_daily",
  description:
    "Create or get today's daily note. If it doesn't exist, creates it from the Daily Note template. If it exists, returns it. Use this to log daily activity, priorities, and notes.",
  category: "obsidian",
  parameters: [
    {
      name: "date",
      type: "string",
      description: "Date in YYYY-MM-DD format. Defaults to today.",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const date = ((params.date as string) || todayDate()).trim();
    const dir = path.join(vaultPath(), "Daily");
    const filePath = path.join(dir, `${date}.md`);
    assertInsideVault(filePath);

    try {
      // Try to read existing
      try {
        const content = await fs.readFile(filePath, "utf-8");
        return {
          toolCallId: "",
          success: true,
          data: {
            message: `Daily note for ${date} already exists.`,
            path: relPath(filePath),
            content,
            created: false,
          },
        };
      } catch {
        // Doesn't exist — create it
      }

      await ensureDir(dir);
      const body = TEMPLATES.daily(date, date);
      await fs.writeFile(filePath, body, "utf-8");

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Created daily note for ${date}.`,
          path: relPath(filePath),
          content: body,
          created: true,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Daily note failed: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── obsidian_delete ───────────────────────────────────────

const obsidianDeleteTool: Tool = {
  name: "obsidian_delete",
  description:
    "Delete an Obsidian note. Requires the confirmed parameter set to true to prevent accidental deletion.",
  category: "obsidian",
  parameters: [
    {
      name: "note",
      type: "string",
      description: "Note name or path to delete",
      required: true,
    },
    {
      name: "confirmed",
      type: "boolean",
      description: "Must be true to confirm deletion. Always ask Danny before deleting.",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const input = (params.note as string).trim();
    const confirmed = params.confirmed as boolean;

    if (!confirmed) {
      return { toolCallId: "", success: false, error: "Deletion not confirmed. Set confirmed=true after asking Danny." };
    }

    let filePath = path.join(vaultPath(), input);
    if (!filePath.endsWith(".md")) filePath += ".md";
    assertInsideVault(filePath);

    try {
      await fs.access(filePath);
    } catch {
      const notes = await getAllNotes();
      const target = input.toLowerCase().replace(/\.md$/, "");
      const match = notes.find((n) => noteName(n).toLowerCase() === target);
      if (!match) {
        return { toolCallId: "", success: false, error: `Note "${input}" not found.` };
      }
      filePath = match;
      assertInsideVault(filePath);
    }

    try {
      const name = noteName(filePath);
      await fs.unlink(filePath);
      return {
        toolCallId: "",
        success: true,
        data: { message: `Deleted note "${name}".`, path: relPath(filePath) },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Delete failed: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── obsidian_tags ─────────────────────────────────────────

const obsidianTagsTool: Tool = {
  name: "obsidian_tags",
  description:
    "Search for notes by tag, or list all tags in the vault. Tags can be in frontmatter (tags: [...]) or inline (#tag).",
  category: "obsidian",
  parameters: [
    {
      name: "tag",
      type: "string",
      description: "Tag to search for (e.g., 'client', 'active', 'revenue'). Omit to list all tags.",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const searchTag = ((params.tag as string) || "").trim().toLowerCase().replace(/^#/, "");

    try {
      const notes = await getAllNotes();
      const tagMap = new Map<string, string[]>();

      for (const notePath of notes) {
        const content = await fs.readFile(notePath, "utf-8");
        const tags = new Set<string>();

        // Extract frontmatter tags: tags: [foo, bar] or tags: [foo]
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const tagsLine = fmMatch[1].match(/tags:\s*\[(.*?)\]/);
          if (tagsLine) {
            tagsLine[1].split(",").forEach((t) => {
              const clean = t.trim().toLowerCase();
              if (clean) tags.add(clean);
            });
          }
        }

        // Extract inline #tags
        const inlineTags = content.match(/(^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g);
        if (inlineTags) {
          inlineTags.forEach((m) => {
            const clean = m.trim().replace(/^#/, "").toLowerCase();
            if (clean && clean.length > 1) tags.add(clean);
          });
        }

        for (const tag of tags) {
          if (!tagMap.has(tag)) tagMap.set(tag, []);
          tagMap.get(tag)!.push(relPath(notePath));
        }
      }

      if (searchTag) {
        const matching = tagMap.get(searchTag) || [];
        return {
          toolCallId: "",
          success: true,
          data: {
            message: matching.length > 0
              ? `${matching.length} note(s) tagged #${searchTag}.`
              : `No notes found with tag #${searchTag}.`,
            tag: searchTag,
            notes: matching,
          },
        };
      }

      // List all tags
      const allTags = Array.from(tagMap.entries())
        .map(([tag, paths]) => ({ tag, count: paths.length }))
        .sort((a, b) => b.count - a.count);

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `${allTags.length} unique tag(s) found across vault.`,
          tags: allTags.slice(0, 50),
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Tag search failed: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── Registration ───────────────────────────────────────────

export function registerObsidianTools(): void {
  toolRegistry.register(obsidianSearchTool);
  toolRegistry.register(obsidianReadTool);
  toolRegistry.register(obsidianListTool);
  toolRegistry.register(obsidianRecentTool);
  toolRegistry.register(obsidianCreateTool);
  toolRegistry.register(obsidianEditTool);
  toolRegistry.register(obsidianDailyTool);
  toolRegistry.register(obsidianDeleteTool);
  toolRegistry.register(obsidianTagsTool);
  console.log(`  ✓ Obsidian vault connected — 9 tools (${vaultPath()})`);
}
