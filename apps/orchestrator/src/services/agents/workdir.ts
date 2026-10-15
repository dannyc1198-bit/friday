import fs from "fs";
import path from "path";
import { REPO_ROOT } from "../runtime-paths.js";

export function resolveWorkdir(
  requested: string | undefined,
  env: NodeJS.ProcessEnv
): { ok: true; cwd: string } | { ok: false; error: string } {
  const cwd = path.resolve(requested || REPO_ROOT);
  const allowedRoots = (env.FRIDAY_ALLOWED_CODE_ROOTS || REPO_ROOT)
    .split(path.delimiter)
    .map((root) => path.resolve(root.trim()))
    .filter(Boolean);
  const cwdKey = cwd.toLowerCase();
  const allowed = allowedRoots.some((root) => {
    const key = root.toLowerCase();
    return cwdKey === key || cwdKey.startsWith(key + path.sep);
  });
  if (!allowed) {
    return { ok: false, error: "working_directory is outside FRIDAY_ALLOWED_CODE_ROOTS" };
  }
  try {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      return { ok: false, error: "working_directory does not exist" };
    }
  } catch {
    return { ok: false, error: "working_directory does not exist" };
  }
  return { ok: true, cwd };
}
