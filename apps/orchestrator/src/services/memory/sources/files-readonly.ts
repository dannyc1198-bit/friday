import { readdirSync } from "fs";
import { lstat, readdir, readFile } from "fs/promises";
import path from "path";
import { inflateRawSync, inflateSync } from "zlib";
import { isInsideRoot } from "../../safe-path.js";
import { redactIngest } from "../redact.js";
import type { PortItemInput } from "../port-db.js";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg", "__pycache__", ".venv", "venv",
  "AppData", "Application Data", ".Trash", "$RECYCLE.BIN", "site-packages",
  ".next", ".cache", "Cache", "GPUCache", "Code Cache", ".obsidian",
]);

const TEXT_EXT = new Set([
  ".md", ".txt", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".html",
  ".css", ".yml", ".yaml", ".toml", ".rs", ".go", ".java", ".c", ".h", ".cpp",
  ".cs", ".rb", ".php", ".sh", ".ps1", ".sql", ".xml", ".ini", ".rst",
]);

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".sh", ".ps1"]);

export function defaultFileRoots(home: string): string[] {
  return ["Documents", "Desktop", "Downloads", "Personal-Projects", "Pictures", "Videos"].map((name) =>
    path.join(home, name)
  );
}

export function pathAllowed(roots: string[], candidate: string): string | null {
  const resolved = path.resolve(candidate);
  for (const root of roots) {
    if (isInsideRoot(root, resolved)) return resolved;
  }
  return null;
}

export function exclusionReason(fullPath: string, extra: string[] = []): string | null {
  const parts = fullPath.split(/[\\/]+/).filter(Boolean);
  const base = parts[parts.length - 1] || "";
  const joined = parts.join("/").toLowerCase();
  for (const pattern of extra) {
    if (pattern.trim().length >= 2 && joined.includes(pattern.trim().toLowerCase())) return "exclude list";
  }
  if (parts.some((part) => SKIP_DIRS.has(part))) return "noise directory";
  if (/appdata|application support/.test(joined) && /chrome|edge|firefox|brave|chromium/.test(joined)) {
    return "browser profile";
  }
  if (/^\.env(\..+)?$/i.test(base)) return "secret file";
  if (/\.(pem|pfx|p12|key|kdbx|keystore)$/i.test(base)) return "secret file";
  if (/^(id_rsa|id_ed25519)(\.pub)?$/i.test(base)) return "secret file";
  if (/(1password|bitwarden|keepass)/i.test(base)) return "secret file";
  const ext = path.extname(base).toLowerCase();
  if (!CODE_EXT.has(ext) && /(credential|secret|password)/i.test(base)) return "secret file";
  return null;
}

export async function collectFiles(options: {
  roots: string[];
  extraExcludes?: string[];
  maxFiles?: number;
  textMaxBytes?: number;
}): Promise<{ items: PortItemInput[]; skipped: number; missingRoots: string[] }> {
  const maxFiles = options.maxFiles ?? 20000;
  const textMax = options.textMaxBytes ?? 262144;
  const items: PortItemInput[] = [];
  const missingRoots: string[] = [];
  let skipped = 0;

  async function walk(root: string, dir: string): Promise<void> {
    if (items.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (items.length >= maxFiles) return;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (!pathAllowed([root], full)) continue;
      if (exclusionReason(full, options.extraExcludes)) {
        skipped++;
        continue;
      }
      if (entry.isDirectory()) {
        await walk(root, full);
        continue;
      }
      const info = await lstat(full);
      const ext = path.extname(entry.name).toLowerCase();
      let excerpt = "";
      if (info.size <= textMax && TEXT_EXT.has(ext)) {
        excerpt = redactIngest(await readFile(full, "utf8")).text.slice(0, 4000);
      } else if (info.size <= textMax && ext === ".pdf") {
        excerpt = redactIngest(extractPdfText(await readFile(full))).text.slice(0, 4000);
      }
      items.push({
        source: "files",
        externalId: full,
        title: entry.name,
        content: excerpt ? `${entry.name}\n${excerpt}` : entry.name,
        kind: "episode",
        path: full,
        metadata: { size: info.size, mtimeMs: info.mtimeMs, ext, root },
      });
    }
  }

  for (const root of options.roots) {
    try {
      const info = await lstat(root);
      if (!info.isDirectory()) {
        missingRoots.push(root);
        continue;
      }
    } catch {
      missingRoots.push(root);
      continue;
    }
    await walk(root, root);
  }
  return { items, skipped, missingRoots };
}

export function listFolder(roots: string[], folder: string): { name: string; kind: "file" | "folder" }[] {
  const resolved = pathAllowed(roots, folder);
  if (!resolved) throw new Error("That folder is outside the folders I am allowed to read.");
  if (exclusionReason(resolved)) throw new Error("That folder is excluded.");
  return readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => !exclusionReason(path.join(resolved, entry.name)))
    .slice(0, 40)
    .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? "folder" as const : "file" as const }));
}

function extractPdfText(buffer: Buffer): string {
  const chunks: string[] = [];
  const pull = (source: string) => {
    for (const match of source.matchAll(/\((?:\\.|[^\\)]){3,}\)/g)) {
      const text = match[0].slice(1, -1).replace(/\\n/g, " ").replace(/\\(.)/g, "$1");
      if (/[A-Za-z]{3,}/.test(text)) chunks.push(text);
    }
  };
  pull(buffer.toString("latin1"));
  for (const match of buffer.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const raw = Buffer.from(match[1], "latin1");
    for (const candidate of [raw, raw.subarray(2)]) {
      try {
        pull(inflateSync(candidate).toString("latin1"));
      } catch {
        try {
          pull(inflateRawSync(candidate).toString("latin1"));
        } catch {
          // not a deflate stream
        }
      }
    }
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
