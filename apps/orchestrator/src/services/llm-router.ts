// FRIDAY LLM Router — Hybrid Provider
// Routes simple requests to Gemini (free) and complex ones to Claude (paid)
// Backward compatible: if GEMINI_API_KEY is not set, always uses Claude

import { streamChatCompletion } from "./openai.js";
import { streamGeminiCompletion } from "./gemini.js";
import { streamOllamaCompletion } from "./ollama.js";
import { config } from "../config/index.js";
import type { Message, StreamChunk } from "../types/index.js";

// ─── Provider Types ──────────────────────────────────────────
type Provider = "ollama" | "gemini" | "claude";

// ─── Trivial patterns — route to local Ollama (T0, free) ─────
// Only pure conversational filler with zero tool/reasoning needs.
const TRIVIAL_PATTERNS = [
  /^(hi|hello|hey|sup|yo|good\s+(morning|afternoon|evening|night))[\s!.?]*$/i,
  /^(thanks|thank\s+you|cheers|ty|thx|nice|cool|got\s+it|ok|okay|k)[\s!.?]*$/i,
  /^(how\s+are\s+you|how'?s\s+it\s+going|what'?s\s+up)[\s?!.]*$/i,
  /^(bye|goodbye|cya|later|talk\s+(to\s+you\s+)?later)[\s!.?]*$/i,
];

// ─── Tools that require Claude's superior reasoning ──────────
const COMPLEX_TOOLS = new Set([
  // Browser automation
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_scroll",
  "browser_screenshot",
  "browser_read_page",
  "browser_close",
  // Code generation / shell
  "execute_shell",
  "shell_execute",
  "claude_code",
  "run_command",
  // Agent dispatch
  "dispatch_agent",
  "agent_dispatch",
  // Screen / vision
  "screen_capture",
  "screen_read",
  "read_screen",
  // Vault / complex write operations
  "obsidian_create",
  "obsidian_edit",
  "obsidian_delete",
  // Complex analysis
  "web_search",
  "web_fetch",
  "tavily_search",
  // File operations (code files)
  "write_file",
  "edit_file",
]);

// ─── Keywords that signal complex reasoning ──────────────────
const COMPLEX_PATTERNS = [
  // Code / development
  /\b(write|build|create|generate|refactor|debug)\s+(code|function|component|api|endpoint|script|app|feature)/i,
  /\b(fix|patch|update)\s+(bug|error|issue|code)/i,
  /\bcode\s+review/i,
  // Multi-step / planning
  /\b(step[- ]by[- ]step|multi[- ]step|plan|strategy|analyze|research|investigate|deep dive)/i,
  /\b(compare|contrast|evaluate|assess|audit)\b/i,
  // Browser automation
  /\b(browse|navigate|open\s+(website|url|page)|go\s+to|scrape|log\s*in)/i,
  /\b(click|fill\s+(form|out)|screenshot)/i,
  // Agent dispatch
  /\b(dispatch|route\s+to|send\s+to)\s+(nexus|builder|creator|pulse|clawdy)/i,
  /\b(agent|specialist)/i,
  // Complex content
  /\b(write|draft|compose)\s+(email|proposal|report|document|article|post)/i,
  /\b(summarize|summarise)\s+(this|the|a)\s+(article|page|document|report)/i,
  // Shell / system
  /\b(run|execute)\s+(command|script|shell|powershell|bash)/i,
  /\bshell\b/i,
];

// ─── Keywords that signal simple tasks ───────────────────────
const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|sup|yo|what'?s\s+up)/i,
  /^(thanks|thank\s+you|cheers|nice|cool|got\s+it|ok|okay)/i,
  /\b(what\s+time|what\s+day|what'?s\s+the\s+date)/i,
  /\b(turn|set|change|dim|brighten)\s+(the\s+)?(lights?|lamp|bulb)/i,
  /\b(play|pause|stop|skip|next|previous)\s+(music|song|track|playlist)/i,
  /\b(add|create|remove|check|show|list)\s+(task|todo|reminder|to-do)/i,
  /\b(remind\s+me|set\s+(a\s+)?reminder|set\s+(a\s+)?timer)/i,
  /\b(remember\s+that|note\s+that|save\s+this)/i,
  /\b(how\s+are\s+you|tell\s+me\s+a\s+joke|who\s+are\s+you)/i,
  /\b(what\s+can\s+you\s+do|help|status)/i,
  /\b(weather|temperature|forecast)/i,
];

// ─── Routing Decision ────────────────────────────────────────
function classifyComplexity(
  message: string,
  messages: Message[]
): { provider: Provider; reason: string } {
  // No Gemini key → always Claude
  if (!config.gemini.apiKey) {
    return { provider: "claude", reason: "no GEMINI_API_KEY configured" };
  }

  const userMsg = message.toLowerCase().trim();

  // T0: trivial chatter → local Ollama (free, fast)
  // Only applies when there's no prior tool use in the conversation.
  const priorToolUse = messages.some((m) => m.toolCalls && m.toolCalls.length > 0);
  if (!priorToolUse && userMsg.length < 60) {
    for (const pattern of TRIVIAL_PATTERNS) {
      if (pattern.test(userMsg)) {
        return { provider: "ollama", reason: `trivial pattern: ${pattern.source.slice(0, 40)}` };
      }
    }
  }

  // Check if previous conversation rounds used complex tools
  const usedComplexTool = messages.some(
    (m) =>
      m.toolCalls?.some((tc) => COMPLEX_TOOLS.has(tc.toolName)) ||
      m.toolResults?.some((tr) => !tr.success) // Errors suggest complexity
  );
  if (usedComplexTool) {
    return { provider: "claude", reason: "conversation involves complex tools" };
  }

  // Check for explicit complex patterns
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(userMsg)) {
      return { provider: "claude", reason: `complex pattern: ${pattern.source.slice(0, 40)}` };
    }
  }

  // Check for simple patterns
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(userMsg)) {
      return { provider: "gemini", reason: `simple pattern: ${pattern.source.slice(0, 40)}` };
    }
  }

  // Message length heuristic: very long messages tend to be complex
  if (userMsg.length > 500) {
    return { provider: "claude", reason: "long message (>500 chars)" };
  }

  // Short conversational messages default to Gemini
  if (userMsg.length < 100 && !userMsg.includes("?")) {
    return { provider: "gemini", reason: "short non-question message" };
  }

  // Questions that aren't complex → Gemini
  if (userMsg.length < 200) {
    return { provider: "gemini", reason: "short/medium question" };
  }

  // Default to Claude for anything uncertain
  return { provider: "claude", reason: "default (uncertain complexity)" };
}

// ─── Main Router ─────────────────────────────────────────────
// Drop-in replacement for streamChatCompletion
// Same signature, same yield format, same SSE events
export async function* streamChatWithRouting(
  messages: Message[],
  signal?: AbortSignal,
  systemPromptExtras?: string
): AsyncGenerator<StreamChunk> {
  // Get the latest user message for classification
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const messageText = lastUserMsg?.content || "";

  const { provider, reason } = classifyComplexity(messageText, messages);
  console.log(`[LLM Router] Routing to ${provider.toUpperCase()} — ${reason}`);

  // Tier ladder: try primary, fall back through cheaper/local tiers.
  // Retryable errors only — bad-request style errors surface immediately.
  const claudeTier = { name: "Claude", run: () => streamChatCompletion(messages, signal, systemPromptExtras) };
  const geminiTier = { name: "Gemini", run: () => streamGeminiCompletion(messages, signal, systemPromptExtras) };
  const ollamaTier = { name: "Ollama", run: () => streamOllamaCompletion(messages, signal, systemPromptExtras) };

  const ladder: Array<{
    name: string;
    run: () => AsyncGenerator<StreamChunk>;
  }> =
    provider === "ollama"
      ? [ollamaTier, geminiTier, claudeTier]
      : provider === "gemini"
      ? [geminiTier, claudeTier, ollamaTier]
      : [claudeTier, geminiTier, ollamaTier];

  let lastError: unknown;
  for (let i = 0; i < ladder.length; i++) {
    const tier = ladder[i];
    try {
      yield* tier.run();
      return;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isLast = i === ladder.length - 1;
      if (isLast || !isRetryable(msg)) {
        throw error;
      }
      console.warn(`[LLM Router] ${tier.name} failed, falling back to ${ladder[i + 1].name}: ${msg.slice(0, 200)}`);
    }
  }
  if (lastError) throw lastError;
}

// ─── Fallback Policy ─────────────────────────────────────────
// Retryable: transient/provider-outage errors — fall back to next tier.
// Non-retryable: caller's prompt is the problem — surface immediately.
function isRetryable(errorMsg: string): boolean {
  // Provider-outage / billing / capacity — fall back.
  // Check these FIRST so credit errors (which Anthropic wraps as
  // invalid_request_error) still trigger fallback.
  if (
    /credit[_\s]?balance[_\s]?too[_\s]?low|credit balance is too low|insufficient_quota|rate[_\s]?limit|\bquota\b|overloaded|overloaded_error|\b429\b|\b5\d{2}\b|ECONNREFUSED|ETIMEDOUT|fetch failed|network error|model requires more system memory/i.test(
      errorMsg
    )
  ) {
    return true;
  }
  // Genuine prompt-is-broken errors — surface immediately.
  if (/authentication_error|permission_denied|invalid_api_key|invalid_request_error/i.test(errorMsg)) {
    return false;
  }
  return false;
}

// ─── Router Stats (for debugging) ────────────────────────────
export function getRouterDecision(
  message: string,
  messages: Message[] = []
): { provider: Provider; reason: string } {
  return classifyComplexity(message, messages);
}
