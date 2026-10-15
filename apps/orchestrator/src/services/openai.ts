// FRIDAY LLM Service — provider-agnostic via OpenAI-compatible endpoints.
//
// Picks Gemini / OpenAI / Anthropic based on which API key has credits.
// Switch providers by setting FRIDAY_LLM_PROVIDER in .env to "gemini" (default),
// "openai", or "anthropic". Or set the explicit FRIDAY_LLM_* env vars.
//
// Free-tier survival: defaults to gemini-2.5-flash-lite (30 RPM / 1500 RPD —
// 3× the headroom of gemini-2.5-flash on free tier) and gracefully degrades on
// 429s so the user hears a spoken excuse instead of dead silence.
//
// Exports kept stable:
//   streamChatCompletion(messages, signal?, systemPromptExtras?) → AsyncGenerator<StreamChunk>
//   checkOpenAI() → Promise<boolean>

import OpenAI from "openai";
import { FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import type { Message, StreamChunk } from "../types/index.js";
import { toolRegistry } from "../tools/registry.js";
import {
  applyToolCallDelta,
  argumentsForTool,
  canonicalToolArguments,
  classifyIntent,
  resolveToolCall,
  type PartialToolCall,
} from "./intent-router.js";
import { redactSecrets } from "./redact.js";

// ─── Provider selection ─────────────────────────────────────────────
// Order of resolution:
// 1. Explicit FRIDAY_LLM_BASE_URL / FRIDAY_LLM_API_KEY / FRIDAY_LLM_MODEL
// 2. FRIDAY_LLM_PROVIDER hint → built-in preset
// 3. Default: Gemini if GEMINI_API_KEY present, else Anthropic, else OpenAI

type ProviderPreset = { baseURL: string; apiKeyEnv: string; defaultModel: string; label: string };

const PROVIDERS: Record<string, ProviderPreset> = {
  gemini:    { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", apiKeyEnv: "GEMINI_API_KEY",    defaultModel: "gemini-2.5-flash", label: "Gemini" },
  groq:      { baseURL: "https://api.groq.com/openai/v1",                           apiKeyEnv: "GROQ_API_KEY",      defaultModel: "llama-3.3-70b-versatile", label: "Groq" },
  openai:    { baseURL: "https://api.openai.com/v1",                                apiKeyEnv: "OPENAI_API_KEY",    defaultModel: "gpt-4o-mini",            label: "OpenAI" },
  anthropic: { baseURL: "https://api.anthropic.com/v1/",                            apiKeyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-haiku-4-5-20251001", label: "Anthropic" },
};

function resolveProvider() {
  const hint = (process.env.FRIDAY_LLM_PROVIDER || "").toLowerCase();
  const fromHint = PROVIDERS[hint];
  const fallback = process.env.GEMINI_API_KEY ? PROVIDERS.gemini
                 : process.env.ANTHROPIC_API_KEY ? PROVIDERS.anthropic
                 : PROVIDERS.openai;
  const p = fromHint ?? fallback;

  const baseURL = process.env.FRIDAY_LLM_BASE_URL || p.baseURL;
  const apiKey  = process.env.FRIDAY_LLM_API_KEY  || process.env[p.apiKeyEnv] || "";
  const model   = process.env.FRIDAY_LLM_MODEL    || p.defaultModel;
  return { baseURL, apiKey, model, label: p.label };
}

const { baseURL, apiKey, model: MODEL, label: PROVIDER_LABEL } = resolveProvider();
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 5; // was 10 — fewer tool rounds = less burst risk on free-tier rate limits

console.log(`[FRIDAY LLM] provider=${PROVIDER_LABEL} model=${MODEL}`);

// 90s hard timeout per request — a hung free-tier endpoint must never
// dead-air the chat path (the old FRIDAY hid a 400 behind a 126s hang).
const client = new OpenAI({ apiKey, baseURL, timeout: 90_000, maxRetries: 1 });

// ─── Tool schema conversion (FRIDAY registry → OpenAI function tools) ─

type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

function getOpenAITools(): ChatCompletionTool[] {
  return toolRegistry.getAllTools().map((tool) => {
    const params = tool.parameters as any;

    // FRIDAY tools may store params as a full JSON Schema object OR as a flat
    // array of ToolParameter descriptors. Normalize either to OpenAI's
    // function.parameters JSON Schema.
    let parameters: Record<string, unknown>;
    if (params && !Array.isArray(params) && params.type === "object") {
      parameters = params;
    } else {
      const paramArray = Array.isArray(params) ? params : [];
      parameters = {
        type: "object",
        properties: paramArray.reduce(
          (acc: Record<string, unknown>, p: any) => ({
            ...acc,
            [p.name]: {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {}),
              // Strict validators (Gemini) reject array schemas without items.
              ...(p.type === "array" ? { items: p.items ?? { type: "string" } } : {}),
            },
          }),
          {}
        ),
        required: paramArray.filter((p: any) => p.required).map((p: any) => p.name),
      };
    }

    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    };
  });
}

// ─── Message conversion (FRIDAY Message[] → OpenAI chat messages) ─

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function toOpenAIMessages(messages: Message[], systemPrompt: string): ChatMessage[] {
  const result: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  // Strip prior-turn tool calls and tool-result messages from history.
  //
  // Why: tool_calls/tool_results are intra-turn scratch-work. Once a turn ends,
  // the assistant's final text content is the canonical record. Replaying tool
  // call IDs from previous turns triggers strict validation in Anthropic's
  // OpenAI-compat layer ("tool_call_id not found in tool_calls of previous
  // message") because IDs are scoped to the turn that generated them.
  // Persisting them gave us garbage history and zero benefit.

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const isLast = i === messages.length - 1;
      // Only the in-flight (last) assistant message keeps tool_calls — that's
      // the live agentic loop. Anything earlier is collapsed to text only.
      if (isLast && msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.toolName,
              arguments: JSON.stringify(tc.parameters),
            },
          })),
        });
        if (msg.toolResults && msg.toolResults.length > 0) {
          for (const tr of msg.toolResults) {
            result.push({
              role: "tool",
              tool_call_id: tr.toolCallId,
              content: JSON.stringify(tr.data ?? tr.error ?? ""),
            });
          }
        }
      } else if (msg.content) {
        result.push({ role: "assistant", content: msg.content });
      }
    }
  }

  return result;
}

function publicLlmError(status: number | undefined, message: string): string {
  const clean = redactSecrets(message || "the model connection failed").slice(0, 180);
  return `I couldn't finish that${status ? ` (${status})` : ""}: ${clean}`;
}

function speechFromToolMessages(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "tool" || typeof msg.content !== "string") continue;
    try {
      const data = JSON.parse(msg.content) as {
        message?: string;
        error?: string;
        results?: Array<{ note?: string; text?: string }>;
      };
      const lines = (data.results || []).slice(0, 3).map((hit) => {
        const text = String(hit.text || "").replace(/\s+/g, " ").trim();
        return text ? `${hit.note || "Note"}: ${text}` : "";
      }).filter(Boolean);
      if (lines.length) return lines.join(" ");
      if (data.message) return String(data.message);
      if (data.error) return String(data.error);
    } catch {
      if (msg.content.trim()) return msg.content.trim().slice(0, 500);
    }
  }
  return null;
}

// ─── Streaming chat completion with agentic tool loop ─

export async function* streamChatCompletion(
  messages: Message[],
  signal?: AbortSignal,
  systemPromptExtras?: string
): AsyncGenerator<StreamChunk> {
  const systemPrompt =
    FRIDAY_SYSTEM_PROMPT +
    (systemPromptExtras && systemPromptExtras.trim() ? "\n\n" + systemPromptExtras : "");
  const openaiMessages = toOpenAIMessages(messages, systemPrompt);
  const tools = getOpenAITools();
  const knownTools = tools.map((tool) => tool.function.name);
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const intent = classifyIntent(typeof lastUser === "string" ? lastUser : "");
  let endedWantingTools = false;
  let intentSummary: string | null = null;

  if (intent.autoRun && intent.tool && knownTools.includes(intent.tool)) {
    const result = await toolRegistry.execute(intent.tool, intent.args);
    const data = result.data as { message?: string } | undefined;
    intentSummary = data?.message || result.error || "Done.";
    yield {
      type: "tool_call",
      toolCall: { id: "intent-0", toolName: intent.tool, parameters: intent.args },
    };
    yield {
      type: "tool_result",
      toolResult: { toolCallId: "intent-0", success: result.success, data: result.data, error: result.error },
    };
    openaiMessages.push({
      role: "system",
      content: `INTENT ROUTER already ran ${intent.tool}. ${JSON.stringify(result.data ?? result.error)}. Do not call it again. One sentence for Danny. Drafts only — do not send, spend, or trade.`,
    });
  }

  if (!apiKey) {
    yield {
      type: "text",
      content: intentSummary
        ? `${intentSummary.replace(/\.$/, "")}. The language model is offline until an API key is in apps/orchestrator/.env.`
        : "I'm offline at the moment, boss — no API key set. Add one to apps/orchestrator/.env.",
    };
    return;
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) {
      yield { type: "text", content: "\n\n[Task cancelled by user.]" };
      break;
    }

    let stream;
    try {
      stream = await client.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: openaiMessages,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
        stream: true,
      });
    } catch (err: any) {
      // Graceful degradation: don't dead-air on rate limits or auth errors.
      // The user hears Lily speak an excuse instead of silence.
      const status = err?.status ?? err?.response?.status;
      const msg = err?.message || "";
      if (status === 429 || /rate.?limit|quota/i.test(msg)) {
        yield { type: "text", content: "Hang on a tick, boss — I'm being rate-limited. Try me again in a few seconds." };
      } else if (status === 401 || status === 403 || /credit|billing|insufficient/i.test(msg)) {
        yield { type: "text", content: `My ${PROVIDER_LABEL} key's out of credits, boss. Top it up and I'm back.` };
      } else {
        if ((status === 400 || status === 422) && round > 0) {
          const spoken = speechFromToolMessages(openaiMessages);
          console.error("[FRIDAY LLM] provider rejected the tool follow-up:", status, redactSecrets(msg));
          if (spoken) {
            yield { type: "text", content: spoken };
            yield { type: "done" };
            return;
          }
        }
        const reason = publicLlmError(status, msg);
        yield { type: "error", content: reason };
        yield { type: "text", content: reason };
        console.error("[FRIDAY LLM] stream error:", status, redactSecrets(msg));
      }
      yield { type: "done" };
      return;
    }

    let accumulatedText = "";
    // Providers stream tool calls differently. Gemini 2.5 Flash often omits
    // index and sends `{}` plus the real arguments object. Replaying the raw
    // concatenation is invalid JSON and the next request comes back 400.
    const partialToolCalls: Record<number, PartialToolCall> = {};
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      if (signal?.aborted) {
        yield { type: "text", content: "\n\n[Task cancelled by user.]" };
        yield { type: "done" };
        return;
      }

      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta.content) {
        accumulatedText += delta.content;
        yield { type: "text", content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const raw = tc as typeof tc & { extra_content?: unknown; function?: { name?: string; arguments?: unknown } };
          applyToolCallDelta(partialToolCalls, {
            index: tc.index,
            id: tc.id,
            function: raw.function,
            extra_content: raw.extra_content,
          });
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const completedToolCalls = Object.values(partialToolCalls).filter((tc) => tc.name?.trim() || tc.argumentsJson.trim());
    for (let i = 0; i < completedToolCalls.length; i++) {
      if (!completedToolCalls[i].id) completedToolCalls[i].id = `call_${round}_${i}`;
    }

    // Record this round's assistant turn so the next round (if any) has it
    // in conversation history. Arguments are canonical JSON, never the raw stream.
    if (completedToolCalls.length > 0) {
      openaiMessages.push({
        role: "assistant",
        content: accumulatedText || null,
        tool_calls: completedToolCalls.map((tc) => ({
          id: tc.id!,
          type: "function" as const,
          function: {
            name: tc.name || "unnamed",
            arguments: canonicalToolArguments(tc.argumentsJson || "{}"),
          },
          ...(tc.extra ? { extra_content: tc.extra } : {}),
        })),
      } as ChatMessage);
    } else {
      openaiMessages.push({ role: "assistant", content: accumulatedText });
    }

    // If the model didn't request tools, we're done.
    if (finishReason !== "tool_calls" || completedToolCalls.length === 0) {
      endedWantingTools = false;
      break;
    }
    endedWantingTools = true;

    // Execute each tool call and feed results back for the next round.
    for (const tc of completedToolCalls) {
      if (signal?.aborted) {
        yield { type: "text", content: "\n\n[Task cancelled by user.]" };
        yield { type: "done" };
        return;
      }

      const resolved = resolveToolCall(tc.name, knownTools, intent);
      const visibleName = resolved.name || tc.name || "unnamed";
      const parsed = argumentsForTool(tc.argumentsJson || "{}", resolved.name, intent);
      const historyName = resolved.name || (knownTools.includes("brain_recall") ? "brain_recall" : knownTools[0] || "brain_recall");
      const assistantTurn = openaiMessages[openaiMessages.length - 1];
      if (assistantTurn && assistantTurn.role === "assistant" && "tool_calls" in assistantTurn && assistantTurn.tool_calls) {
        const recorded = assistantTurn.tool_calls.find((call) => call.id === tc.id);
        if (recorded && recorded.type === "function") {
          recorded.function.name = historyName;
          recorded.function.arguments = JSON.stringify(parsed.ok ? parsed.value : {});
        }
      }
      yield {
        type: "tool_call",
        toolCall: { id: tc.id!, toolName: visibleName, parameters: parsed.ok ? parsed.value : {} },
      };
      if (!parsed.ok || !resolved.name) {
        const error = !parsed.ok ? `${visibleName}: ${parsed.error}` : resolved.reason;
        console.error(`[FRIDAY] ${error}`);
        yield {
          type: "tool_result",
          toolResult: { toolCallId: tc.id!, success: false, error },
        };
        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id!,
          content: JSON.stringify({ error }),
        });
        continue;
      }

      try {
        const result = await toolRegistry.execute(resolved.name, parsed.value);
        yield {
          type: "tool_result",
          toolResult: {
            toolCallId: tc.id!,
            success: result.success,
            data: result.data,
            error: result.error,
          },
        };
        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id!,
          content: JSON.stringify(result.data ?? result.error ?? ""),
        });
      } catch (toolError) {
        const errorMsg =
          toolError instanceof Error ? toolError.message : "Tool execution failed";
        yield {
          type: "tool_result",
          toolResult: { toolCallId: tc.id!, success: false, error: errorMsg },
        };
        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id!,
          content: JSON.stringify({ error: errorMsg }),
        });
      }
    }
  }

  // Wrap-up: if the loop exhausted MAX_TOOL_ROUNDS while the model still
  // wanted tools, the last thing the user saw was raw tool results with no
  // closing answer. Force one final text-only completion so FRIDAY always
  // speaks a conclusion.
  if (endedWantingTools && !signal?.aborted) {
    try {
      const wrapUp = await client.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          ...openaiMessages,
          {
            role: "system",
            content:
              "Tool budget for this turn is spent. Summarize what you accomplished and answer the user now using the tool results above. Do not request more tools.",
          },
        ],
        stream: true,
      });
      for await (const chunk of wrapUp) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) yield { type: "text", content: delta.content };
      }
    } catch (err) {
      console.error("[FRIDAY LLM] wrap-up call failed:", (err as Error)?.message);
      yield { type: "text", content: "I ran out of tool budget mid-task, boss — here's where I got to. Ask me to continue if you want the rest." };
    }
  }

  yield { type: "done" };
}

// ─── One-shot completion (internal jobs: reflection, summarization) ─
// No tools, no streaming, no FRIDAY persona — callers supply the full
// system prompt. Used by the brain's nightly reflection.

export async function simpleCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048
): Promise<string> {
  if (!apiKey) throw new Error("No LLM API key configured");
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

export function getLLMInfo(): { provider: string; model: string; hasKey: boolean } {
  return { provider: PROVIDER_LABEL, model: MODEL, hasKey: Boolean(apiKey) };
}

// ─── Health check ─

export async function checkOpenAI(): Promise<boolean> {
  if (!apiKey) return false;
  try {
    await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch {
    return false;
  }
}
