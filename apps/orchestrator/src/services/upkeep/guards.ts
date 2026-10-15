// Guardrails for self-repair. Pure functions so the tests can lock them
// without spawning git, Claude, or Codex.

export const MAX_REPAIRS_PER_DAY = 3;
export const REPEAT_THRESHOLD = 3;
export const FIX_BRANCH_PREFIX = "friday/fix-";

const SECRET_PATH =
  /(^|\/)\.env($|\.|\/)|(^|\/)credentials(\.|\/|$)|(^|\/)id_rsa$|\.(pem|p12|key)$|(^|\/)secrets?\.(json|ya?ml|txt|env)$/i;

const MISFIRE =
  /\b(that(?:'s| is) wrong|not what i asked|you misunderstood|misfire|that didn'?t work|you broke)\b/i;

export function isSecretPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
  return SECRET_PATH.test(normalized);
}

export function secretPaths(files: readonly string[]): string[] {
  return files.filter(isSecretPath);
}

export function isProtectedBranch(branch: string): boolean {
  const name = branch.trim().toLowerCase();
  return name === "main" || name === "master";
}

export function canMergeInto(baseBranch: string): { ok: true } | { ok: false; reason: string } {
  if (isProtectedBranch(baseBranch)) {
    return {
      ok: false,
      reason: `Refusing to merge into ${baseBranch}. The fix branch can be pushed for you to merge.`,
    };
  }
  if (!baseBranch.trim() || baseBranch.includes("..") || baseBranch.startsWith("-")) {
    return { ok: false, reason: "The base branch name is not safe to merge into." };
  }
  return { ok: true };
}

export function repairBranchName(summary: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "issue";
  return `${FIX_BRANCH_PREFIX}${slug}-${day}`;
}

export function isFixBranch(branch: string): boolean {
  return branch.startsWith(FIX_BRANCH_PREFIX) && !branch.includes("..") && !isProtectedBranch(branch);
}

export function rateLimitDecision(input: {
  attemptsToday: number;
  inFlight: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.inFlight > 0) {
    return { ok: false, reason: "A repair is already in flight. Wait for Approve or Reject." };
  }
  if (input.attemptsToday >= MAX_REPAIRS_PER_DAY) {
    return { ok: false, reason: `Repair limit reached (${MAX_REPAIRS_PER_DAY} per day).` };
  }
  return { ok: true };
}

export function isMisfire(text: string): boolean {
  return MISFIRE.test(text || "");
}

export function fixTaskPrompt(branch: string, summary: string): string {
  return [
    `Fix this one diagnosed bug on git branch ${branch}.`,
    `Bug: ${summary}`,
    "Rules:",
    "- Stay on this branch. Do not checkout, push, merge, or open a pull request.",
    "- Do not read, edit, or create .env files, credentials, keys, or secrets.",
    "- Add or update a test that covers the bug.",
    "- Commit the fix on this branch only.",
  ].join("\n");
}
