import { execFile } from "child_process";
import { copyFile, mkdir, readFile, writeFile, access, readdir, stat } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { isInsideRoot } from "../../safe-path.js";
import type { PortItemInput } from "../port-db.js";

const execFileAsync = promisify(execFile);
const SKIP = new Set([".obsidian", ".trash", ".git", "node_modules", ".smart-env"]);

export type WriteFolder = "Jarvis" | "Inbox";

export function assertWritableNote(vault: string, target: string): void {
  if (!isInsideRoot(vault, target)) throw new Error("Path is outside the vault");
  const rel = path.relative(vault, target).replace(/\\/g, "/");
  if (!rel.startsWith("Jarvis/") && !rel.startsWith("Inbox/")) {
    throw new Error("Notes can only be written under Jarvis/ or Inbox/.");
  }
}

export function notePath(vault: string, title: string, folder: WriteFolder = "Jarvis"): string {
  const safe = title.replace(/[<>:"/\\|?*]/g, "-").replace(/\.md$/i, "").trim();
  if (!safe) throw new Error("Title is required");
  const full = path.join(vault, folder, `${safe}.md`);
  assertWritableNote(vault, full);
  return full;
}

function stamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function appendDailyLog(vault: string, summary: string, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const logPath = path.join(vault, "Jarvis", "Logs", `${day}.md`);
  assertWritableNote(vault, logPath);
  await mkdir(path.dirname(logPath), { recursive: true });
  const line = `- ${now.toTimeString().slice(0, 5)} ${summary.trim()}\n`;
  if (!(await exists(logPath))) {
    await writeFile(logPath, `# Jarvis log ${day}\n\n${line}`, "utf8");
    return;
  }
  const existing = await readFile(logPath, "utf8");
  await writeFile(logPath, existing.endsWith("\n") ? existing + line : `${existing}\n${line}`, "utf8");
}

export async function writeNote(options: {
  vault: string;
  title: string;
  folder?: WriteFolder;
  body: string;
  mode?: "create" | "append" | "replace";
  now?: Date;
}): Promise<{ path: string; relativePath: string; backupPath?: string }> {
  const full = notePath(options.vault, options.title, options.folder || "Jarvis");
  const mode = options.mode || "create";
  await mkdir(path.dirname(full), { recursive: true });
  let backupPath: string | undefined;
  if (mode === "append" && (await exists(full))) {
    const existing = await readFile(full, "utf8");
    await writeFile(full, `${existing.replace(/\s*$/, "")}\n\n${options.body.trim()}\n`, "utf8");
  } else if (mode === "replace" && (await exists(full))) {
    backupPath = `${full}.bak-${stamp(options.now)}`;
    await copyFile(full, backupPath);
    await commitBackup(options.vault, full);
    await writeFile(full, options.body, "utf8");
  } else if (await exists(full)) {
    throw new Error(`Note already exists: ${path.relative(options.vault, full)}`);
  } else {
    await writeFile(full, options.body, "utf8");
  }
  const relativePath = path.relative(options.vault, full).replace(/\\/g, "/");
  await appendDailyLog(options.vault, `${mode} ${relativePath}`, options.now);
  return { path: full, relativePath, backupPath };
}

async function commitBackup(vault: string, file: string): Promise<void> {
  const rel = path.relative(vault, file);
  const run = (args: string[]) => execFileAsync("git", ["-C", vault, ...args], { timeout: 15000 });
  try {
    await execFileAsync("git", ["-C", vault, "rev-parse", "--is-inside-work-tree"], { timeout: 8000 });
    await run(["add", "--", rel]);
    try {
      await run(["commit", "-m", `Jarvis backup before edit: ${path.basename(file)}`, "--", rel]);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/tell me who you are|user\.email|user\.name/i.test(text)) {
        await run([
          "-c", "user.email=friday@localhost",
          "-c", "user.name=FRIDAY",
          "commit", "-m", `Jarvis backup before edit: ${path.basename(file)}`,
          "--", rel,
        ]);
      }
    }
  } catch {
    // A missing git repo or a clean file still has the .bak copy.
  }
}

export function headingChunks(markdown: string): { heading: string; text: string; tags: string[]; links: string[] }[] {
  const tags = new Set<string>();
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const body = fm ? markdown.slice(fm[0].length) : markdown;
  const tagLine = fm?.[1].match(/tags:\s*\[([^\]]*)\]/);
  if (tagLine) {
    for (const tag of tagLine[1].split(",")) {
      const clean = tag.trim().replace(/^#/, "").toLowerCase();
      if (clean) tags.add(clean);
    }
  }
  for (const match of body.matchAll(/(^|[\s(])#([A-Za-z][\w/-]{1,})/g)) tags.add(match[2].toLowerCase());
  const links = [...new Set([...body.matchAll(/\[\[([^\]|#]+)/g)].map((match) => match[1].trim()))];

  const sections: { heading: string; lines: string[] }[] = [];
  let current = { heading: "", lines: [] as string[] };
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (current.heading || current.lines.some((line) => line.trim())) sections.push(current);
      current = { heading: heading[2].trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.some((line) => line.trim())) sections.push(current);
  return sections
    .map((section) => ({
      heading: section.heading,
      text: section.lines.join("\n").trim(),
      tags: [...tags],
      links,
    }))
    .filter((section) => section.text.length > 0);
}

export async function collectVault(vault: string): Promise<PortItemInput[]> {
  const items: PortItemInput[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (!isInsideRoot(vault, full)) continue;
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith(".md") || entry.name.includes(".bak-")) continue;
      const info = await stat(full);
      if (info.size > 1_000_000) continue;
      const raw = await readFile(full, "utf8");
      const rel = path.relative(vault, full).replace(/\\/g, "/");
      headingChunks(raw).forEach((chunk, index) => {
        items.push({
          source: "obsidian",
          externalId: `${rel}#${index}`,
          title: chunk.heading || path.basename(rel, ".md"),
          content: chunk.text,
          kind: rel.startsWith("Jarvis/Projects") ? "project" : "episode",
          path: rel,
          metadata: { tags: chunk.tags, wikilinks: chunk.links, mtimeMs: info.mtimeMs },
        });
      });
    }
  }
  await walk(vault);
  return items;
}
