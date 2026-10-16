// The whole Obsidian vault as a graph for the Brain tab: every note is a node,
// every [[wiki link]] that resolves is an edge. Read-only.

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export interface VaultNode {
  id: string;     // vault-relative path, forward slashes
  name: string;
  folder: string;
  links: number;
}

export interface VaultGraph {
  vault: string;
  vaultName: string;
  nodes: VaultNode[];
  edges: Array<[string, string]>;
  builtAt: string;
}

const SKIP = new Set([".obsidian", ".git", ".trash", "node_modules"]);
const MAX_NOTES = 20_000;

function walk(root: string, dir: string, out: string[]): void {
  if (out.length >= MAX_NOTES) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(relative(root, full).split(sep).join("/"));
    if (out.length >= MAX_NOTES) return;
  }
}

export function extractLinks(text: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) out.push(match[1].trim());
  return out;
}

export function noteKey(target: string): string {
  return basename(target.replace(/\\/g, "/")).replace(/\.md$/i, "").toLowerCase();
}

let cache: { root: string; at: number; graph: VaultGraph } | null = null;

export function buildVaultGraph(root: string, now = Date.now()): VaultGraph {
  if (cache && cache.root === root && now - cache.at < 60_000) return cache.graph;
  const files: string[] = [];
  walk(root, root, files);
  const byKey = new Map<string, string>();
  for (const file of files) if (!byKey.has(noteKey(file))) byKey.set(noteKey(file), file);
  const edges: Array<[string, string]> = [];
  const degree = new Map<string, number>();
  for (const file of files) {
    let text = "";
    try {
      text = readFileSync(join(root, file), "utf8").slice(0, 200_000);
    } catch {
      continue;
    }
    const seen = new Set<string>();
    for (const link of extractLinks(text)) {
      const target = byKey.get(noteKey(link));
      if (!target || target === file || seen.has(target)) continue;
      seen.add(target);
      edges.push([file, target]);
      degree.set(file, (degree.get(file) || 0) + 1);
      degree.set(target, (degree.get(target) || 0) + 1);
    }
  }
  const nodes = files.map((file) => ({
    id: file,
    name: basename(file).replace(/\.md$/i, ""),
    folder: file.includes("/") ? file.split("/")[0] : "(root)",
    links: degree.get(file) || 0,
  }));
  const graph = { vault: root, vaultName: basename(root), nodes, edges, builtAt: new Date(now).toISOString() };
  cache = { root, at: now, graph };
  return graph;
}

// Read one note, refusing anything outside the vault (.., absolute paths, symlinks out).
export function readVaultNote(root: string, rel: string): { path: string; content: string; modified: string } | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean.toLowerCase().endsWith(".md") || clean.split("/").includes("..")) return null;
  try {
    const realRoot = realpathSync(root);
    const full = realpathSync(resolve(realRoot, clean));
    if (!full.startsWith(realRoot + sep)) return null;
    const content = readFileSync(full, "utf8");
    return { path: clean, content: content.slice(0, 100_000), modified: statSync(full).mtime.toISOString() };
  } catch {
    return null;
  }
}