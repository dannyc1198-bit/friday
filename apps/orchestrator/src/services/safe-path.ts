// Path containment. String prefix checks miss sibling folders (`/vault` vs
// `/vault-evil`) and symlink escapes. Callers that touch the disk use
// resolveInside so the real path is checked too.

import { realpath } from "fs/promises";
import path from "path";

export function isInsideRoot(root: string, candidate: string): boolean {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  const rel = path.relative(base, target);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

export async function resolveInside(root: string, candidate: string): Promise<string> {
  const rootResolved = path.resolve(root);
  let rootReal = rootResolved;
  try {
    rootReal = await realpath(rootResolved);
  } catch {
    // The root may not exist yet. The lexical check still applies.
  }

  const resolved = path.resolve(candidate);
  if (!isInsideRoot(rootResolved, resolved) && !isInsideRoot(rootReal, resolved)) {
    throw new Error("Path traversal attempt blocked: path resolves outside vault");
  }

  const suffix: string[] = [];
  let cursor = resolved;
  while (true) {
    try {
      const real = await realpath(cursor);
      const rebuilt = path.resolve(real, ...suffix);
      if (!isInsideRoot(rootResolved, rebuilt) && !isInsideRoot(rootReal, rebuilt)) {
        throw new Error("Path traversal attempt blocked: path resolves outside vault");
      }
      return rebuilt;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Path traversal")) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
      const parent = path.dirname(cursor);
      if (parent === cursor) return resolved;
      suffix.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transcript files stay inside the conversation directory and only use UUID names. */
export function conversationTranscriptPath(dir: string, id: string): string | null {
  if (!CONVERSATION_ID.test(id || "")) return null;
  const file = path.resolve(dir, `${id}.jsonl`);
  return isInsideRoot(dir, file) ? file : null;
}
