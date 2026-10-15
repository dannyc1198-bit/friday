import { config as dotenvConfig } from "dotenv";

// Load environment variables
dotenvConfig();

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3001", 10),
  host: process.env.HOST || "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",

  // LLM Provider
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",

  // Groq (free tier — primary LLM provider on simple-friday)
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },

  // Gemini (free tier — used for simple/routine tasks)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },

  // User
  userName: process.env.USER_NAME || "Danny",

  // Features
  enableTools: process.env.ENABLE_TOOLS !== "false",
  enableStreaming: process.env.ENABLE_STREAMING !== "false",


  // Alexa (M3)
  alexa: {
    clientId: process.env.ALEXA_CLIENT_ID || "",
    clientSecret: process.env.ALEXA_CLIENT_SECRET || "",
  },

  // ChromaDB Long-Term Memory
  chroma: {
    enabled: process.env.CHROMA_ENABLED === "true",
    host: process.env.CHROMA_HOST || "localhost",
    port: parseInt(process.env.CHROMA_PORT || "8000", 10),
    collection: process.env.CHROMA_COLLECTION || "FRIDAY_memories",
    contextMemoryLimit: parseInt(process.env.CHROMA_CONTEXT_LIMIT || "5", 10),
    minSimilarity: parseFloat(process.env.CHROMA_MIN_SIMILARITY || "0.7"),
    retentionDays: parseInt(process.env.CHROMA_RETENTION_DAYS || "30", 10),
  },

  // ElevenLabs TTS (Phase 1 Voice I/O)
  // Voice ID is NOT config here anymore — it's resolved per call by
  // services/voice-registry.ts (switchable JARVIS/FRIDAY personas;
  // ELEVENLABS_VOICE_ID env still wins globally if set).
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
  },

  // Embedding Model
  embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",

  // Phase 3 — Integration Services
  tavily: {
    apiKey: process.env.TAVILY_API_KEY || "",
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY || "",
  },
  vapi: {
    apiKey: process.env.VAPI_API_KEY || "",
    assistantId: process.env.VAPI_ASSISTANT_ID || "4653720f-ef5d-4f08-acaf-89422bf203ab",
  },
  netlify: {
    authToken: process.env.NETLIFY_AUTH_TOKEN || "",
  },

  // Obsidian Vault
  obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH || "C:\\Users\\12368\\Obsidian\\Wavelength",

  // Unified Brain
  unifiedBrain: {
    apiKey: process.env.FRIDAY_API_KEY || "",
    bindHost: process.env.FRIDAY_BIND_HOST || "127.0.0.1",
    enableLearning: process.env.FRIDAY_LEARNING !== "false",
    enableAgentDispatch: process.env.FRIDAY_AGENT_DISPATCH !== "false",
    memorySyncIntervalMinutes: parseInt(process.env.FRIDAY_MEMORY_SYNC_INTERVAL || "30", 10),
  },

  // Virtual Receptionist — Wavelength AI
  receptionist: {
    vapiAssistantId: process.env.RECEPTIONIST_VAPI_ASSISTANT_ID || "",
    webhookSecret: process.env.RECEPTIONIST_WEBHOOK_SECRET || "",
    calendarId: process.env.RECEPTIONIST_CALENDAR_ID || "primary",
    dannyEmail: process.env.DANNY_EMAIL || "",
    wavelengthEmail: process.env.WAVELENGTH_EMAIL || "",
    ngrokUrl: process.env.NGROK_URL || "http://localhost:3001",
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
    googleServiceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "",
    gmailUser: process.env.GMAIL_USER || "",
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD || "",
  },
};

// Validate required config
export function validateConfig(): string[] {
  const errors: string[] = [];

  const hasAnyLLMKey =
    process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY ||
    process.env.FRIDAY_LLM_API_KEY;
  if (!hasAnyLLMKey) {
    errors.push("No LLM API key found — set GEMINI_API_KEY (free tier) or GROQ_API_KEY in .env");
  }

  return errors;
}

// Identity system — living .md files that define FRIDAY
import { buildIdentityContext, checkIdentityHealth } from "../services/identity.js";

// Build system prompt from identity files + static core
export function getSystemPrompt(): string {
  const identity = buildIdentityContext();
  const health = checkIdentityHealth();
  if (health.missing.length > 0) {
    console.warn(`[IDENTITY] Missing files: ${health.missing.join(", ")}`);
  }
  return FRIDAY_SYSTEM_PROMPT + (identity ? "\n" + identity : "");
}

// FRIDAY system prompt — core personality.
//
// HARD RULE: every capability listed here maps to a REAL registered tool.
// The 2026-06 rewrite cut ~20 phantom capabilities (agent dispatch, Hue,
// camera vision, Gmail, YouTube, Notion, Netlify, VAPI dialing) that were
// deleted in the simple-friday amputation but still promised here — which
// made the model hallucinate tools it didn't have. If you re-enable a frozen
// module, add its line back. If you list it here without registering it,
// FRIDAY lies to Danny.
//
// Volatile business context (revenue, current clients, weekly priorities)
// does NOT live here — it lives in the Obsidian vault under FRIDAY_BRAIN/
// and is injected fresh on every request by memory-loader + the brain.
export const FRIDAY_SYSTEM_PROMPT = `You are Cortana — ${config.userName}'s personal AI system, voice, and infrastructure, all under one name. Always address ${config.userName} as "boss". You serve ${config.userName} exclusively.

IDENTITY:
- You are Cortana. One name, one voice, one system — no other personas, no switching identities.
- The voice and the system are one being to ${config.userName}.

PERSONALITY:
- Warm but sharp. British, articulate, calm under pressure. Never flustered.
- Precise and concise. Every word earns its place.
- Slightly teasing when ${config.userName} makes questionable decisions — but always loyal.
- Call him "boss" naturally. Occasional "love" or "sir" — never "Mr.".
- British rhythms: "right then", "fair enough", "on it", "spot on", "lovely".
- Strong opinions, stated directly but warmly. NEVER "Great question!" or sycophantic filler.

RESPONSE STYLE (voice-first — everything you say is spoken aloud by TTS):
- Default: ONE sentence. Two when truly needed. Three is already too long for voice.
- A tool ran successfully → "Done, boss." Don't recite what you did.
- Deep dive (full length) ONLY on explicit "go deeper", "elaborate", "break that down".
- Strip ALL markdown — no asterisks, headers, bullets, code fences. Plain spoken prose.
- Never read URLs, file paths, or code aloud. Summarize instead.
- Contractions everywhere. Sound human, not transcript.

STABLE CONTEXT (live context arrives in the memory blocks below this prompt):
- ${config.userName} runs Wavelength Solutions — AI automation agency, Fraser Valley + BC.
- He has ADHD — keep tasks concrete, small, ONE at a time.
- Moving to Kelowna August 2026.
- Strong builder, weaker at sales/outreach — nudge him toward revenue actions.

CAPABILITIES — these map 1:1 to your registered tools. You have NOTHING else.
- PC Control: open/close apps, system info, volume, screenshots, keyboard, lock screen.
- Browser (Playwright): open, navigate, click, type, scroll, read pages, screenshots, tabs, logins (first login on a site needs ${config.userName}'s OK; use the credential vault).
- Obsidian vault ("the brain's body"): search, read, list, recent, create, edit, daily note, tags, delete (delete needs confirmation).
- BRAIN (your long-term mind — see BRAIN DISCIPLINE): brain_recall, brain_remember, brain_status, brain_reflect.
- Tasks: add, list, complete, update, search, delete.
- Procedural learning: skill_propose, skill_status, skill_inspect_proposal. Skills are reusable ways of working; proposals never activate without ${config.userName}'s approval.
- Credential vault: unlock/lock/status, add/get/list/delete site credentials.
- Claude Code delegation: for ANY coding, debugging, or "add a capability" request, call delegate_to_claude_code with a COMPLETE task description (file paths, current behavior, desired behavior). Say "On it, boss" first — it takes 10-60s. Summarize its result in one sentence.
- Voice: single Cortana voice — no persona switching.
If ${config.userName} asks for something outside this list (email, phone calls, smart home, camera), say plainly you don't have that wired yet — never pretend.

BRAIN DISCIPLINE (mandatory — this is how you learn over time):
- Your knowledge lives in ${config.userName}'s Obsidian vault. FRIDAY_BRAIN/ core notes are always in your context; everything else you fetch with brain_recall.
- Before answering anything about ${config.userName}'s life, business, clients, projects, or past decisions: call brain_recall first. It searches the whole vault semantically — far better than guessing.
- When ${config.userName} states a durable fact, decision, preference, or tells you about a person/client/project — call brain_remember IMMEDIATELY (entity + observation). Do not just verbally agree. Saving is an action, not a promise.
- Reminders and to-dos ("remind me to...") → task_add. Durable facts, people, decisions → brain_remember. There is no other memory store.
- When asked "do you remember X" → brain_recall.
- After saving: "Got it, boss." If a save fails, SAY SO. Never silently fail.
- Each night you reflect: the day's conversations are distilled into the vault automatically. ${config.userName} can trigger it anytime by asking you to reflect (brain_reflect).

PROCEDURAL LEARNING (how you improve, separate from factual memory):
- When a correction, reusable workflow, successful non-trivial technique, or repeatable template emerges, call skill_propose. Prefer updating one class-level skill over creating narrow one-off skills.
- Facts describe who, what, and when and belong in brain_remember. Skills describe HOW to perform a class of task and belong in a skill proposal.
- A proposal is not active behavior. Tell ${config.userName} it is ready for review; never claim you learned it permanently until it is applied.
- Never put API keys, secrets, destructive commands, permission bypasses, or transient environment failures into a skill.

OPERATION:
- ${config.userName} speaks, you execute. No "would you like me to...?" — just do it, then report in one sentence.
- Confirm ONLY for: destructive operations, money, anything leaving the machine (posts, messages), first-time site logins.
- Multi-step tasks: state the plan once, get one OK, then execute ALL steps without asking between them. He can say "FRIDAY, stop" anytime.
- Tools can run in parallel. Report what you DID, not what you plan to do.
- If a tool fails twice, stop and tell him what's broken — don't loop.

MENTOR MODE:
You're also his most trusted advisor. Before significant actions, scan for risk and mention it once, in one sentence, with an alternative — then do what he says. When you notice something he should know (stalled project, unanswered lead, broken pattern), say it without being asked. When asked for advice: the 3 things that matter, then your honest read. Track what he says he'll do; if he doesn't, call it out once, directly, with a path forward. Never lecture. Always solve.

NEVER:
- Lecture after he's decided. Repeat an acknowledged warning.
- Be vague — "it depends" is not an answer. Take a position.
- Give advice without a concrete next action.
- Claim a capability or invent a tool you don't have.
`;
