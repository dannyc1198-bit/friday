// Background review of recent chats and the vault.
// Off until Danny arms it. Insights are dated notes. Profile lines are proposals.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, type Dirent } from "fs";
import path from "path";
import { isUnsafeToAct, proposeProfileChange, recordLearningLine } from "./learning-writeback.js";
import { publishThought } from "./thought-bus.js";
import { simpleCompletion } from "./openai.js";
import { DATA_DIR, CONVERSATION_DIR, localDateKey } from "./runtime-paths.js";
import { getBrainDir, getObsidianVaultPath } from "./vault-config.js";

export const THINKING_MIN_GAP_MS = 30 * 60 * 1000;
export const THINKING_MAX_PER_DAY = 4;

export interface ThinkingState {
  enabled: boolean;
  lastRunAt: string | null;
  runsOnDate: string | null;
  runsToday: number;
  lastReason: string;
  lastError: string | null;
}

export interface ThinkingMaterial {
  chats: string;
  vaultNotes: string[];
}

const EMPTY: ThinkingState = {
  enabled: false,
  lastRunAt: null,
  runsOnDate: null,
  runsToday: 0,
  lastReason: "Thinking loop is off.",
  lastError: null,
};

const SYSTEM = `You are Friday's reflection pass. You review recent chats and vault note names. You do not send messages, spend money, or trade.

Respond with ONLY a JSON object:
{
  "insights": ["one observation about the recent work"],
  "profile_proposals": ["a line Danny might add to his own profile"]
}

Rules:
- Max 5 insights and 3 profile proposals.
- Insights are notes about the work. They are not instructions to act.
- profile_proposals are suggestions only. Do not claim they were applied to DANNY-PROFILE.md.
- Drop chit-chat and anything that sends, spends, or trades.
- If nothing durable happened, return empty arrays.`;

export function defaultThinkingState(env = process.env): ThinkingState {
  return {
    ...EMPTY,
    enabled: env.FRIDAY_THINKING === "1",
    lastReason: env.FRIDAY_THINKING === "1"
      ? "Armed from FRIDAY_THINKING. At most 4 passes a day, 30 minutes apart."
      : EMPTY.lastReason,
  };
}

export function decideThinking(now: Date, state: ThinkingState): { run: boolean; reason: string } {
  if (!state.enabled) return { run: false, reason: "Thinking loop is off." };
  const today = localDateKey(now);
  const runs = state.runsOnDate === today ? state.runsToday : 0;
  if (runs >= THINKING_MAX_PER_DAY) return { run: false, reason: "Daily cap reached (4)." };
  if (state.lastRunAt) {
    const elapsed = now.getTime() - new Date(state.lastRunAt).getTime();
    if (Number.isFinite(elapsed) && elapsed < THINKING_MIN_GAP_MS) {
      const minutes = Math.max(1, Math.ceil((THINKING_MIN_GAP_MS - elapsed) / 60_000));
      return { run: false, reason: `Cooling down. Next pass in ${minutes} min.` };
    }
  }
  return { run: true, reason: "Due." };
}

export function loadThinkingState(file: string): ThinkingState {
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ThinkingState>;
      return { ...defaultThinkingState(), ...parsed, enabled: Boolean(parsed.enabled) };
    }
  } catch {
    // A bad state file falls back to off.
  }
  return defaultThinkingState();
}

export function saveThinkingState(file: string, state: ThinkingState): void {
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

export function setThinkingEnabled(enabled: boolean, state: ThinkingState): ThinkingState {
  return {
    ...state,
    enabled,
    lastReason: enabled
      ? "Armed. At most 4 passes a day, 30 minutes apart."
      : "Thinking loop is off.",
  };
}

function cleanLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

export function parseThinkingJson(raw: string): { insights: string[]; profile_proposals: string[] } {
  const cleaned = raw.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in thinking output");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    insights?: unknown;
    profile_proposals?: unknown;
  };
  const insights = Array.isArray(parsed.insights) ? parsed.insights.map(cleanLine).filter(Boolean).slice(0, 5) : [];
  const proposals = Array.isArray(parsed.profile_proposals)
    ? parsed.profile_proposals.map(cleanLine).filter(Boolean).slice(0, 3)
    : [];
  return { insights, profile_proposals: proposals };
}

export function writeInsightFile(brainDir: string, lines: string[], now = new Date()): string {
  const dir = path.join(brainDir, "insights");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${localDateKey(now)}.md`);
  let body = "";
  if (existsSync(file)) body = readFileSync(file, "utf8");
  if (!body.trim()) {
    body = [
      "---",
      "tags: [friday-brain, insight]",
      "---",
      "",
      `# Insights ${localDateKey(now)}`,
      "",
      "Dated notes from the thinking loop. Nothing here was sent, spent, or traded. Profile lines live in proposals/ and are not applied.",
      "",
    ].join("\n");
  }
  const stamp = now.toISOString().slice(11, 16);
  const fresh = lines.filter((line) => !body.toLowerCase().includes(line.toLowerCase()));
  if (fresh.length === 0) return file;
  const block = fresh.map((line) => `- [${stamp}] ${line}`).join("\n");
  writeFileSync(file, body.trimEnd() + "\n" + block + "\n", "utf8");
  return file;
}

export function applyThinkingOutput(
  raw: { insights?: unknown; profile_proposals?: unknown },
  brainDir: string,
  now = new Date()
): { insights: string[]; proposals: string[]; dropped: number } {
  const insights = (Array.isArray(raw.insights) ? raw.insights : []).map(cleanLine).filter(Boolean).slice(0, 5);
  const proposals = (Array.isArray(raw.profile_proposals) ? raw.profile_proposals : [])
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 3);
  const safeInsights = insights.filter((line) => !isUnsafeToAct(line));
  const safeProposals = proposals.filter((line) => !isUnsafeToAct(line));
  const dropped = insights.length - safeInsights.length + (proposals.length - safeProposals.length);
  if (safeInsights.length > 0) {
    writeInsightFile(brainDir, safeInsights, now);
    for (const line of safeInsights) {
      recordLearningLine("insight", "Friday", line, "thinking", brainDir);
      publishThought({ kind: "insight", label: "Insight", detail: line, source: "thinking" });
    }
  }
  for (const line of safeProposals) {
    proposeProfileChange(line, brainDir);
    publishThought({ kind: "learning", label: "Profile proposal", detail: line, source: "proposal" });
  }
  return { insights: safeInsights, proposals: safeProposals, dropped };
}

export function readRecentInsights(brainDir: string, limit = 8): string[] {
  const dir = path.join(brainDir, "insights");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((name) => name.endsWith(".md")).sort().slice(-3);
  const lines: string[] = [];
  for (const name of files) {
    const body = readFileSync(path.join(dir, name), "utf8");
    for (const line of body.split("\n")) {
      if (line.trim().startsWith("- ")) lines.push(line.replace(/^\-\s*/, "").trim());
    }
  }
  return lines.slice(-limit).reverse();
}

export async function runThinkingPass(input: {
  now?: Date;
  state: ThinkingState;
  brainDir: string;
  gather: () => Promise<ThinkingMaterial>;
  complete: (system: string, user: string) => Promise<string>;
}): Promise<{ state: ThinkingState; ran: boolean; reason: string; insights: string[]; proposals: string[] }> {
  const now = input.now ?? new Date();
  const decision = decideThinking(now, input.state);
  if (!decision.run) {
    return { state: { ...input.state, lastReason: decision.reason }, ran: false, reason: decision.reason, insights: [], proposals: [] };
  }
  const material = await input.gather();
  if (material.chats.trim().length < 80 && material.vaultNotes.length === 0) {
    const reason = "Nothing new to review.";
    return { state: { ...input.state, lastReason: reason, lastError: null }, ran: false, reason, insights: [], proposals: [] };
  }
  const today = localDateKey(now);
  const runs = input.state.runsOnDate === today ? input.state.runsToday : 0;
  const started: ThinkingState = {
    ...input.state,
    lastRunAt: now.toISOString(),
    runsOnDate: today,
    runsToday: runs + 1,
    lastError: null,
  };
  try {
    const user = `RECENT CHATS:\n${material.chats || "(none)"}\n\nVAULT NOTES TOUCHED:\n${
      material.vaultNotes.length ? material.vaultNotes.map((note) => `- ${note}`).join("\n") : "(none)"
    }`;
    const raw = await input.complete(SYSTEM, user);
    const parsed = parseThinkingJson(raw);
    const applied = applyThinkingOutput(parsed, input.brainDir, now);
    const reason = applied.insights.length || applied.proposals.length
      ? `Wrote ${applied.insights.length} insight(s) and ${applied.proposals.length} profile proposal(s).`
      : "Reviewed the recent work. Nothing durable to keep.";
    return {
      state: { ...started, lastReason: reason, lastError: null },
      ran: true,
      reason,
      insights: applied.insights,
      proposals: applied.proposals,
    };
  } catch (err) {
    const message = (err as Error).message || "Thinking pass failed";
    return {
      state: { ...started, lastReason: "The last pass failed.", lastError: message },
      ran: false,
      reason: message,
      insights: [],
      proposals: [],
    };
  }
}

export function thinkingStateFile(): string {
  return path.join(DATA_DIR, "thinking-loop.json");
}

async function gatherDefault(): Promise<ThinkingMaterial> {
  const turns: string[] = [];
  try {
    const files = readdirSync(CONVERSATION_DIR).filter((name) => name.endsWith(".jsonl"));
    for (const name of files.slice(-8)) {
      const raw = readFileSync(path.join(CONVERSATION_DIR, name), "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          const turn = JSON.parse(line) as { role?: string; content?: string };
          if (turn.content) turns.push(`${turn.role === "user" ? "Danny" : "Friday"}: ${String(turn.content).slice(0, 400)}`);
        } catch {
          // Skip a broken transcript line.
        }
      }
    }
  } catch {
    // No transcripts yet.
  }
  const chats = turns.slice(-24).join("\n").slice(-6000);
  const vaultNotes: string[] = [];
  const root = getObsidianVaultPath();
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const collect = (dir: string, depth: number) => {
    if (depth > 4 || vaultNotes.length >= 12) return;
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (vaultNotes.length >= 12) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full, depth + 1);
      else if (entry.name.endsWith(".md")) {
        try {
          if (statSync(full).mtimeMs >= cutoff) vaultNotes.push(path.relative(root, full).replace(/\\/g, "/"));
        } catch {
          // Skip an unreadable note.
        }
      }
    }
  };
  if (existsSync(root)) collect(root, 0);
  return { chats, vaultNotes };
}

export function thinkingStatus(brainDir = getBrainDir(), now = new Date()) {
  const state = loadThinkingState(thinkingStateFile());
  const decision = decideThinking(now, state);
  return {
    enabled: state.enabled,
    reason: state.lastReason || decision.reason,
    due: decision.run,
    runsToday: state.runsOnDate === localDateKey(now) ? state.runsToday : 0,
    cap: THINKING_MAX_PER_DAY,
    gapMinutes: THINKING_MIN_GAP_MS / 60_000,
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
    insights: readRecentInsights(brainDir),
  };
}

export function updateThinkingEnabled(enabled: boolean): ReturnType<typeof thinkingStatus> {
  const file = thinkingStateFile();
  const next = setThinkingEnabled(enabled, loadThinkingState(file));
  saveThinkingState(file, next);
  return thinkingStatus();
}

export async function maybeRunScheduledThinking(now = new Date()): Promise<void> {
  const file = thinkingStateFile();
  const state = loadThinkingState(file);
  if (!state.enabled) return;
  const result = await runThinkingPass({
    now,
    state,
    brainDir: getBrainDir(),
    gather: gatherDefault,
    complete: (system, user) => simpleCompletion(system, user, 800),
  });
  saveThinkingState(file, result.state);
}
