// FRIDAY Reflection — the nightly "thinking" pass.
//
// Pattern: khoj automations + obsidian-second-brain's nightly agent.
// Once a day (scheduler, 21:30) — or on demand via brain_reflect / POST
// /api/brain/reflect — FRIDAY:
//   1. Reads the day's conversation transcripts (data/conversations/*.jsonl)
//   2. Notes which vault files Danny touched today
//   3. Runs ONE LLM call to distill: summary, durable facts, open loops
//   4. Writes facts into entity notes (brain.rememberFact — update-in-place)
//   5. Appends a "FRIDAY Reflection" section to today's daily note
//   6. Refreshes FRIDAY_BRAIN/INDEX.md (the brain's table of contents)
//
// Cost: one completion per day on the free tier. The brain compounds while
// Danny sleeps, and every fact lands as readable markdown in his vault.

import { promises as fs } from "fs";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { simpleCompletion } from "./openai.js";
import { rememberFact, getBrainStats, getRecentLearnings } from "./brain.js";
import { isUnsafeToAct, recordLearningLine } from "./learning-writeback.js";
import { DATA_DIR, CONVERSATION_DIR, localDateKey, localTimestamp } from "./runtime-paths.js";
import { getBrainDir, getDailyDir, getEntitiesDir, getObsidianVaultPath } from "./vault-config.js";

function vaultPath(): string {
  return getObsidianVaultPath();
}
const CONVO_DIR = CONVERSATION_DIR;
const STATE_FILE = path.join(DATA_DIR, "brain-reflection.json");

const MAX_TRANSCRIPT_CHARS = 9000; // keep the single daily call cheap

export interface ReflectionState {
  lastReflectionDate: string | null; // YYYY-MM-DD that was last reflected on
  lastRunAt: string | null;
  lastSummary: string;
  lastFactsAdded: number;
  lastError: string | null;
}

export interface ReflectionResult {
  ran: boolean;
  date: string;
  summary?: string;
  factsAdded?: number;
  skippedReason?: string;
  error?: string;
}

// ─── State ──────────────────────────────────────────────────────

export function loadReflectionState(): ReflectionState {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch { /* fresh */ }
  return { lastReflectionDate: null, lastRunAt: null, lastSummary: "", lastFactsAdded: 0, lastError: null };
}

function saveReflectionState(state: ReflectionState): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Reflection] state save failed:", (err as Error).message);
  }
}

// ─── Gather the day's raw material ──────────────────────────────

async function gatherTranscripts(date: string): Promise<string> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(CONVO_DIR)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return "";
  }

  const turns: { time: string; role: string; content: string }[] = [];
  for (const f of files) {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(CONVO_DIR, f), "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const t = JSON.parse(line);
        if (typeof t.timestamp === "string" && t.timestamp.startsWith(date) && t.content) {
          turns.push({ time: t.timestamp.slice(11, 16), role: t.role, content: String(t.content) });
        }
      } catch { /* skip malformed line */ }
    }
  }

  turns.sort((a, b) => a.time.localeCompare(b.time));
  let out = "";
  for (const t of turns) {
    const line = `[${t.time}] ${t.role === "user" ? "Danny" : "FRIDAY"}: ${t.content.slice(0, 500)}\n`;
    if (out.length + line.length > MAX_TRANSCRIPT_CHARS) {
      out += `\n[... ${turns.length} total turns, truncated for budget ...]\n`;
      break;
    }
    out += line;
  }
  return out;
}

async function vaultActivityToday(date: string): Promise<string[]> {
  const touched: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".md")) {
        try {
          const stat = await fs.stat(full);
          if (localDateKey(stat.mtime) === date) {
            touched.push(path.relative(vaultPath(), full).replace(/\\/g, "/"));
          }
        } catch { /* skip */ }
      }
    }
  }
  await walk(vaultPath());
  return touched.slice(0, 15);
}

// ─── The LLM distillation ───────────────────────────────────────

const REFLECTION_SYSTEM = `You are the reflection process of FRIDAY, Danny's AI assistant. You distill a day of conversation into durable knowledge for his Obsidian vault.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{
  "summary": "2-3 sentence plain-English summary of the day",
  "highlights": ["bullet", "bullet"],
  "facts": [
    {"entity": "Name of person/project/client/topic", "type": "person|client|project|preference|place|tool|fact", "observation": "one durable, self-contained fact worth remembering long-term", "category": "fact|decision|preference|insight|event"}
  ],
  "open_loops": ["unfinished things Danny said he'd do or asked FRIDAY to follow up on"],
  "improvements": ["what Friday should do better next time"]
}

Rules for facts:
- Only DURABLE knowledge: decisions made, preferences stated, people/clients/projects described, commitments, lessons. Max 8 facts.
- Never instruct yourself to send a message, spend money, or place a live trade. Those stay drafts until Danny approves them in the moment.
- Skip chit-chat, weather, one-off commands ("open chrome"), anything already obvious.
- Each observation must stand alone — readable a year from now with no other context.
- Entity names should be short and reusable (e.g. "Abe", "Wavelength Solutions", "Dan Martell Goal"), not sentences.
- If the day had nothing durable, return "facts": [].
- "improvements" is what Friday should change about her own behavior. Max 5. Do not edit DANNY-PROFILE.md. Profile changes stay proposals.`;

function extractJson(raw: string): any {
  const cleaned = raw.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object in reflection output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ─── Vault write-backs ──────────────────────────────────────────

async function appendToDailyNote(date: string, md: string): Promise<void> {
  if (!existsSync(getDailyDir())) mkdirSync(getDailyDir(), { recursive: true });
  const file = path.join(getDailyDir(), `${date}.md`);
  let content = "";
  try {
    content = await fs.readFile(file, "utf-8");
  } catch {
    content = `# ${date}\n`;
  }
  // Idempotent per day: replace an existing reflection section instead of stacking.
  const marker = "## 🧠 FRIDAY Reflection";
  const idx = content.indexOf(marker);
  if (idx !== -1) {
    const nextHeading = content.indexOf("\n## ", idx + marker.length);
    content = nextHeading === -1 ? content.slice(0, idx) : content.slice(0, idx) + content.slice(nextHeading + 1);
  }
  content = content.trimEnd() + "\n\n" + md + "\n";
  await fs.writeFile(file, content, "utf-8");
}

async function refreshBrainIndex(): Promise<void> {
  if (!existsSync(getEntitiesDir())) return;
  const files = readdirSync(getEntitiesDir()).filter((f) => f.endsWith(".md"));
  const byType = new Map<string, string[]>();

  for (const f of files) {
    let type = "fact";
    try {
      const raw = readFileSync(path.join(getEntitiesDir(), f), "utf-8");
      const m = raw.match(/^type:\s*(\w+)/m);
      if (m) type = m[1];
    } catch { /* default */ }
    const name = f.replace(/\.md$/, "");
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(name);
  }

  const state = loadReflectionState();
  const recent = getRecentLearnings(8);
  const lines: string[] = [
    "---",
    "tags: [friday-brain, index]",
    "---",
    "",
    "# 🧠 FRIDAY Brain Index",
    "",
    "*Auto-maintained by FRIDAY's nightly reflection. Everything FRIDAY knows, as it learns it.*",
    "",
    `- **Entities:** ${files.length}`,
    `- **Last reflection:** ${state.lastRunAt ? state.lastRunAt.slice(0, 16).replace("T", " ") : "never"}`,
    "",
  ];

  const order = ["person", "client", "project", "preference", "place", "tool", "fact"];
  for (const type of order) {
    const names = byType.get(type);
    if (!names || names.length === 0) continue;
    lines.push(`## ${type[0].toUpperCase() + type.slice(1)}s`);
    for (const n of names.sort()) lines.push(`- [[entities/${n}|${n}]]`);
    lines.push("");
  }

  if (recent.length > 0) {
    lines.push("## Recently learned");
    for (const r of recent) {
      lines.push(`- ${r.at.slice(0, 10)} — **${r.entity}**: ${r.observation.slice(0, 120)}`);
    }
    lines.push("");
  }

  await fs.writeFile(path.join(getBrainDir(), "INDEX.md"), lines.join("\n"), "utf-8");
}

// ─── Main entry ─────────────────────────────────────────────────

let reflecting = false;

export async function runReflection(dateStr?: string): Promise<ReflectionResult> {
  const date = dateStr || localDateKey();
  if (reflecting) return { ran: false, date, skippedReason: "Reflection already in progress" };
  reflecting = true;

  const state = loadReflectionState();
  try {
    const transcript = await gatherTranscripts(date);
    const touched = await vaultActivityToday(date);

    if (transcript.length < 200 && touched.length === 0) {
      return { ran: false, date, skippedReason: "Nothing substantial to reflect on today" };
    }

    const userPrompt = `DATE: ${date}

TODAY'S CONVERSATIONS BETWEEN DANNY AND FRIDAY:
${transcript || "(no conversations today)"}

VAULT NOTES DANNY TOUCHED TODAY:
${touched.length > 0 ? touched.map((t) => `- ${t}`).join("\n") : "(none)"}

Distill this day per your instructions. JSON only.`;

    const raw = await simpleCompletion(REFLECTION_SYSTEM, userPrompt, 1500);
    const parsed = extractJson(raw);

    const summary: string = typeof parsed.summary === "string" ? parsed.summary : "";
    const highlights: string[] = Array.isArray(parsed.highlights) ? parsed.highlights.filter((h: unknown) => typeof h === "string") : [];
    const facts: any[] = Array.isArray(parsed.facts) ? parsed.facts.slice(0, 8) : [];
    const openLoops: string[] = Array.isArray(parsed.open_loops) ? parsed.open_loops.filter((l: unknown) => typeof l === "string") : [];
    const improvements: string[] = Array.isArray(parsed.improvements)
      ? parsed.improvements.filter((item: unknown) => typeof item === "string").slice(0, 5)
      : [];

    let factsAdded = 0;
    for (const f of facts) {
      if (!f || typeof f.entity !== "string" || typeof f.observation !== "string") continue;
      if (isUnsafeToAct(f.observation)) continue;
      try {
        const res = await rememberFact({
          entity: f.entity,
          observation: f.observation,
          type: f.type,
          category: f.category,
          source: "reflection",
        });
        if (!res.duplicate) {
          factsAdded++;
          recordLearningLine(typeof f.category === "string" ? f.category : "fact", f.entity, f.observation, "reflection");
        }
      } catch (err) {
        console.warn(`[Reflection] fact write failed for "${f.entity}":`, (err as Error).message);
      }
    }

    const md = [
      "## 🧠 FRIDAY Reflection",
      "",
      summary,
      "",
      ...(highlights.length > 0 ? ["**Highlights:**", ...highlights.map((h) => `- ${h}`), ""] : []),
      ...(factsAdded > 0 ? [`**Learned:** ${factsAdded} new fact(s) → [[FRIDAY_BRAIN/INDEX|Brain Index]]`, ""] : []),
      ...(openLoops.length > 0 ? ["**Open loops:**", ...openLoops.map((l) => `- [ ] ${l}`), ""] : []),
      ...(improvements.length > 0 ? ["**Improve:**", ...improvements.map((item) => `- ${item}`), ""] : []),
      `*Reflected ${localTimestamp().slice(0, 16).replace("T", " ")}*`,
    ].join("\n");

    await appendToDailyNote(date, md);

    state.lastReflectionDate = date;
    state.lastRunAt = new Date().toISOString();
    state.lastSummary = summary;
    state.lastFactsAdded = factsAdded;
    state.lastError = null;
    saveReflectionState(state);

    await refreshBrainIndex();

    console.log(`[Reflection] ${date}: ${factsAdded} fact(s) learned. ${getBrainStats().entities} entities total.`);
    return { ran: true, date, summary, factsAdded };
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[Reflection] failed:", msg);
    state.lastError = msg;
    state.lastRunAt = new Date().toISOString();
    saveReflectionState(state);
    return { ran: false, date, error: msg };
  } finally {
    reflecting = false;
  }
}
