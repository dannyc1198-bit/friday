// Permission Gate — human-in-the-loop confirmation for dangerous tools
//
// Flow:
//   1. Dangerous tool calls requireConfirmation({ action, details, risk }).
//   2. That returns a Promise. A sentinel object is also emitted via the
//      confirmEvents EventEmitter, which the agentic loop in openai.ts /
//      gemini.ts listens to and yields as a `confirm_action` StreamChunk.
//   3. Frontend POSTs /api/confirm/:token with { approved: true|false }.
//   4. confirmAction() resolves the pending promise; tool proceeds or denies.
//   5. If no confirmation arrives in 60s, the promise auto-denies.
//
// Every request & decision is appended to data/audit.log as a JSONL entry.

import { EventEmitter } from "events";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join, normalize, resolve } from "path";
import { DATA_DIR, REPO_ROOT } from "./runtime-paths.js";

// ─── Safe-command & safe-path lists ──────────────────────────────

export const SAFE_COMMAND_WHITELIST: RegExp[] = [
  /^\s*git\s+status(\s|$)/i,
  /^\s*git\s+log(\s|$)/i,
  /^\s*git\s+diff(\s|$)/i,
  /^\s*npm\s+list(\s|$)/i,
  /^\s*dir(\s|$)/i,
  /^\s*ls(\s|$)/i,
  /^\s*pwd\s*$/i,
  /^\s*cat\s+/i,
  /^\s*type\s+/i,
  /^\s*echo(\s|$)/i,
  /^\s*whoami\s*$/i,
  /^\s*node\s+--version\s*$/i,
  /^\s*ollama\s+list\s*$/i,
];

export const SAFE_FILE_PATH_PREFIXES: string[] = [
  REPO_ROOT + "\\",
  "C:\\Users\\12368\\Obsidian\\",
  "C:\\Users\\12368\\Documents\\",
];

// Dangerous substrings — if a path contains any of these, it's denied even
// if it sits under a safe prefix (defense-in-depth against traversal).
const FORBIDDEN_PATH_SUBSTRINGS = [
  "System32",
  "Windows\\",
  "Program Files",
  "\\.ssh",
  "\\.env",
];

export function isSafeShellCommand(cmd: string): boolean {
  if (!cmd || typeof cmd !== "string") return false;
  // Block command chaining: ;, &&, ||, `, $(), pipes into dangerous things
  if (/[;&|`]|\$\(/.test(cmd)) return false;
  return SAFE_COMMAND_WHITELIST.some((re) => re.test(cmd));
}

export function isSafeFilePath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  let normalized: string;
  try {
    normalized = normalize(resolve(path));
  } catch {
    return false;
  }
  // Must be under a safe prefix (case-insensitive on Windows)
  const lower = normalized.toLowerCase();
  const underSafePrefix = SAFE_FILE_PATH_PREFIXES.some((p) =>
    lower.startsWith(p.toLowerCase())
  );
  if (!underSafePrefix) return false;
  // Reject forbidden substrings anywhere in the path
  for (const bad of FORBIDDEN_PATH_SUBSTRINGS) {
    if (normalized.includes(bad)) return false;
  }
  return true;
}

// ─── Confirmation registry ───────────────────────────────────────

export type Risk = "low" | "medium" | "high" | "critical";

export interface ConfirmSentinel {
  __requiresConfirm: true;
  action: string;
  details: string;
  risk: Risk;
  confirmToken: string;
}

interface PendingEntry {
  action: string;
  details: string;
  risk: Risk;
  createdAt: number;
  resolve: (approved: boolean) => void;
  timeoutId: NodeJS.Timeout;
}

const pending = new Map<string, PendingEntry>();

// EventEmitter so the agentic loop can yield a confirm_action chunk
// without tight coupling to a specific streaming implementation.
export const confirmEvents = new EventEmitter();
confirmEvents.setMaxListeners(50);

const CONFIRM_TIMEOUT_MS = 60_000;

// ─── Audit log ───────────────────────────────────────────────────

const AUDIT_DIR = DATA_DIR;
const AUDIT_LOG = join(AUDIT_DIR, "audit.log");

function auditLog(event: Record<string, unknown>): void {
  try {
    if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });
    appendFileSync(
      AUDIT_LOG,
      JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n",
      "utf-8"
    );
  } catch (err) {
    console.error("[permission-gate] audit log failed:", err);
  }
}

// ─── Public API ──────────────────────────────────────────────────

export interface RequireConfirmationInput {
  action: string;
  details: string;
  risk: Risk;
}

/**
 * Request user confirmation for a dangerous action.
 * Returns a Promise<boolean> that resolves when confirmAction() is called
 * or auto-denies after 60 seconds.
 *
 * Also emits a `pending` event on confirmEvents with the sentinel payload
 * so the agentic streaming loop can yield a `confirm_action` chunk to the
 * frontend.
 */
export function requireConfirmation(
  input: RequireConfirmationInput
): { sentinel: ConfirmSentinel; promise: Promise<boolean> } {
  const confirmToken = randomBytes(6).toString("hex");
  const sentinel: ConfirmSentinel = {
    __requiresConfirm: true,
    action: input.action,
    details: input.details,
    risk: input.risk,
    confirmToken,
  };

  auditLog({
    kind: "confirm_request",
    token: confirmToken,
    action: input.action,
    risk: input.risk,
    details: input.details.slice(0, 500),
  });

  const promise = new Promise<boolean>((resolvePromise) => {
    const timeoutId = setTimeout(() => {
      if (pending.has(confirmToken)) {
        pending.delete(confirmToken);
        auditLog({
          kind: "confirm_decision",
          token: confirmToken,
          approved: false,
          reason: "timeout",
        });
        resolvePromise(false);
      }
    }, CONFIRM_TIMEOUT_MS);

    pending.set(confirmToken, {
      action: input.action,
      details: input.details,
      risk: input.risk,
      createdAt: Date.now(),
      resolve: resolvePromise,
      timeoutId,
    });
  });

  // Fire-and-forget emit — subscribers (streaming loop) can forward this
  // to the SSE/WS channel as a type:"confirm_action" chunk.
  confirmEvents.emit("pending", sentinel);

  return { sentinel, promise };
}

/**
 * Called by the /api/confirm/:token route when the frontend responds.
 * Returns true if the token was matched; false if unknown/expired.
 */
export function confirmAction(token: string, approved: boolean): boolean {
  const entry = pending.get(token);
  if (!entry) return false;
  clearTimeout(entry.timeoutId);
  pending.delete(token);
  auditLog({
    kind: "confirm_decision",
    token,
    approved,
    reason: "user_response",
  });
  entry.resolve(approved);
  return true;
}

/**
 * Snapshot of currently pending confirmations — used by
 * GET /api/confirm/pending so a frontend that missed the SSE event can
 * still render the prompt.
 */
export function listPendingConfirmations(): Array<{
  token: string;
  action: string;
  details: string;
  risk: Risk;
  createdAt: number;
  ageMs: number;
}> {
  const now = Date.now();
  return Array.from(pending.entries()).map(([token, e]) => ({
    token,
    action: e.action,
    details: e.details,
    risk: e.risk,
    createdAt: e.createdAt,
    ageMs: now - e.createdAt,
  }));
}
