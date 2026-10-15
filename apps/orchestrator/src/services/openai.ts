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
import { parametersToJsonSchema } from "./tool-schema.js";
import {
  applyToolCallDelta,
  argumentsForTool,
  canonicalToolArguments,
  classifyIntent,
  resolveToolCall,
  type PartialToolCall,
} from "./intent-router.js";
import { redactSecrets } from "./redact.js";
import {
  activeEndpoint,
  describeChain,
  endpointClient,
  exhaustedBrainMessage,
  failoverReason,
  resolveLlmChain,
  shouldFailover,
  type LlmEndpoint,
} from "./llm-chain.js";

// Tool-argument assembly below is the reviewer's Gemini 400 fix.
// Provider choice sits outside that loop. A 400 does not fail over.

const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 5;

const bootChain = resolveLlmChain(process.env);
const bootHead = bootChain.endpoints[0];
console.log(
  `[FRIDAY LLM] provider=${bootHead?.label || "none"} model=${bootHead?.model || "none"} next=${bootChain.endpoints.slice(1).map((item) => `${item.label}:${item.model}`).join(",") || "none"}`
);

// ─── Tool schema conversion (FRIDAY registry → OpenAI function tools) ─

type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

function getOpenAITools(): ChatCompletionTool[] {
  return toolRegistry.getAllTools().map((tool) => {
    const parameters = parametersToJsonSchema(tool.parameters);

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
    const result = await toolRegistry.execute(intent.tool, intent.args, signal);
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

  const chain = resolveLlmChain(process.env);
  let cursor = 0;
  let endpoint: LlmEndpoint | null = chain.endpoints[0] || null;
  let active = endpoint ? endpointClient(endpoint) : null;
  const tried: Array<{ label: string; reason: string }> = [];

  if (!active || !endpoint) {
    const missing = chain.missing.map((item) => item.env).join(", ") || "OPENAI_API_KEY, XAI_API_KEY, or GEMINI_API_KEY";
    yield {
      type: "text",
      content: intentSummary
        ? `${intentSummary.replace(/\.$/, "")}. The language model is offline until ${missing} is set.`
        : `I'm offline at the moment, boss — set ${missing}.`,
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
      stream = await active.chat.completions.create(
        {
          model: endpoint.model,
          max_tokens: MAX_TOKENS,
          messages: openaiMessages,
          ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
          stream: true,
        },
        { signal }
      );
    } catch (err: any) {
      if (signal?.aborted || err?.name === "AbortError" || err?.name === "APIUserAbortError") {
        yield { type: "text", content: "\n\n[Task cancelled by user.]" };
        yield { type: "done" };
        return;
      }
      const status = err?.status ?? err?.response?.status;
      const msg = err?.message || "";
      const reason = failoverReason(status, msg);
      tried.push({ label: endpoint.label, reason });
      const next = chain.endpoints[cursor + 1];
      if (next && shouldFailover(status, msg)) {
        console.warn(`[FRIDAY LLM] ${endpoint.label} ${reason}. Using ${next.label}.`);
        cursor += 1;
        endpoint = next;
        active = endpointClient(endpoint);
        round -= 1;
        continue;
      }
      if (shouldFailover(status, msg)) {
        const notice = exhaustedBrainMessage(tried, chain.missing.map((item) => item.env));
        yield { type: "text", content: notice };
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

    try {
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
    } catch (err: any) {
      if (signal?.aborted || err?.name === "AbortError" || err?.name === "APIUserAbortError") {
        yield { type: "text", content: "\n\n[Task cancelled by user.]" };
        yield { type: "done" };
        return;
      }
      throw err;
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
        const result = await toolRegistry.execute(resolved.name, parsed.value, signal);
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
      const wrapUp = await active.chat.completions.create({
        model: endpoint.model,
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

async function completeOnce(
  client: OpenAI,
  endpoint: LlmEndpoint,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const res = await client.chat.completions.create({
    model: endpoint.model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function simpleCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048,
  options?: { model?: string; allowFailover?: boolean }
): Promise<string> {
  const chain = resolveLlmChain(process.env);
  if (!chain.endpoints.length) throw new Error("No LLM API key configured");
  const allowFailover = options?.allowFailover !== false && !options?.model;
  const list = allowFailover ? chain.endpoints : [chain.endpoints[0]];
  let lastError: unknown;
  for (const endpoint of list) {
    const target = options?.model ? { ...endpoint, model: options.model } : endpoint;
    try {
      return await completeOnce(endpointClient(target), target, systemPrompt, userPrompt, maxTokens);
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      const message = (err as Error).message || "";
      if (!shouldFailover(status, message)) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No LLM API key configured");
}

export function getLLMInfo(): {
  provider: string;
  model: string;
  hasKey: boolean;
  failover: string | null;
  failoverReady: boolean;
} {
  return describeChain(process.env);
}

export async function checkOpenAI(): Promise<boolean> {
  const picked = activeEndpoint(resolveLlmChain(process.env));
  if (!picked) return false;
  try {
    await endpointClient(picked.endpoint).chat.completions.create({
      model: picked.endpoint.model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch {
    return false;
  }
}
