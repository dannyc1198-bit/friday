// FRIDAY LLM Service — Groq via OpenAI SDK (free-tier rewrite, 2026-04-27)
//
// Filename kept as openai.ts to minimize import churn. Two exports used:
// streamChatCompletion (agentic tool loop) and checkOpenAI (health).
//
// Provider swap from Anthropic → Groq is intentional: free tier, OpenAI-shaped
// API, Llama 3.3 70B supports tool calling well enough for FRIDAY's 50-tool
// registry. Prompt caching is dropped — Groq doesn't support it, and at free-tier
// pricing the lever doesn't matter.
//
// One model, one path. Do NOT add fallback routing without re-reading CLAUDE.md
// "Don't re-introduce tier routing" — credit-balance failures should surface
// loud, not get swallowed by a 126s failover.

import OpenAI from "openai";
import { config, FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import type { Message, StreamChunk } from "../types/index.js";
import { toolRegistry } from "../tools/registry.js";

// ─── Tunables (Danny owns this block) ────────────────────────
//
// Model choice: Groq currently exposes several Llama and Mixtral variants.
//   - llama-3.3-70b-versatile  : smartest, ~30 RPM, tool-calling reliable
//   - llama-3.1-8b-instant     : fastest, ~30 RPM, tool-calling shakier with 50 tools
//   - llama-3.1-70b-versatile  : older 70B, similar to 3.3, slightly worse
// Default below picks 70B versatile. Override per-deployment via GROQ_MODEL env var.
//
// MAX_TOKENS: response length cap. 4096 leaves headroom; bump only if FRIDAY
// truncates mid-answer on long tasks.
//
// MAX_TOOL_ROUNDS: hard ceiling on agentic loop iterations per request. 10 is
// generous — most flows finish in 1-3 rounds. Lower it if Danny sees runaway loops.
//
// TEMPERATURE: 0.7 keeps FRIDAY's voice warm. 0 = deterministic but flat.

const MODEL = config.groq.model;
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 10;
const TEMPERATURE = 0.7;

// ─────────────────────────────────────────────────────────────

const client = new OpenAI({
  apiKey: config.groq.apiKey,
  baseURL: config.groq.baseUrl,
});

// ─── Tool schema conversion (registry → OpenAI function) ─────

type FunctionTool = OpenAI.Chat.Completions.ChatCompletionTool;

function getOpenAITools(): FunctionTool[] {
  return toolRegistry.getAllTools().map((tool) => {
    const params = tool.parameters as any;

    // Already a JSON Schema object
    if (params && !Array.isArray(params) && params.type === "object") {
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: params,
        },
      };
    }

    // Array of ToolParameter — convert to JSON Schema
    const paramArray = Array.isArray(params) ? params : [];
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: paramArray.reduce(
            (acc: Record<string, unknown>, param: any) => ({
              ...acc,
              [param.name]: {
                type: param.type,
                description: param.description,
                ...(param.enum ? { enum: param.enum } : {}),
              },
            }),
            {}
          ),
          required: paramArray.filter((p: any) => p.required).map((p: any) => p.name),
        },
      },
    };
  });
}

// ─── Message helpers ─────────────────────────────────────────

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ToolCallParam = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

function toOpenAIMessages(messages: Message[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue; // system handled separately

    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const toolCalls: ToolCallParam[] = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.toolName,
            arguments: JSON.stringify(tc.parameters ?? {}),
          },
        }));
        result.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: toolCalls,
        });
      } else {
        result.push({ role: "assistant", content: msg.content });
      }
    }

    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const tr of msg.toolResults) {
        result.push({
          role: "tool",
          tool_call_id: tr.toolCallId,
          content: JSON.stringify(tr.data ?? tr.error ?? ""),
        });
      }
    }
  }

  return result;
}

function buildSystemMessage(extras?: string): ChatMessage {
  const text = extras && extras.trim()
    ? `${FRIDAY_SYSTEM_PROMPT}\n\n${extras}`
    : FRIDAY_SYSTEM_PROMPT;
  return { role: "system", content: text };
}

// ─── Streaming chat completion with agentic tool loop ────────

export async function* streamChatCompletion(
  messages: Message[],
  signal?: AbortSignal,
  systemPromptExtras?: string
): AsyncGenerator<StreamChunk> {
  const tools = config.enableTools ? getOpenAITools() : undefined;
  const openaiMessages: ChatMessage[] = [
    buildSystemMessage(systemPromptExtras),
    ...toOpenAIMessages(messages),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) {
      yield { type: "text", content: "\n\n[Task cancelled by user.]" };
      break;
    }

    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: openaiMessages,
      stream: true,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    });

    let textAccumulator = "";
    // Streamed tool calls arrive as deltas indexed by position; accumulate by index.
    const toolCallAccumulator: Record<number, { id: string; name: string; args: string }> = {};
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta.content) {
        textAccumulator += delta.content;
        yield { type: "text", content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          const idx = tcDelta.index;
          if (!toolCallAccumulator[idx]) {
            toolCallAccumulator[idx] = { id: "", name: "", args: "" };
          }
          const slot = toolCallAccumulator[idx];
          if (tcDelta.id) slot.id = tcDelta.id;
          if (tcDelta.function?.name) slot.name = tcDelta.function.name;
          if (tcDelta.function?.arguments) slot.args += tcDelta.function.arguments;
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const toolCalls = Object.values(toolCallAccumulator).filter((tc) => tc.id && tc.name);

    // Push assistant turn into history
    if (toolCalls.length > 0) {
      openaiMessages.push({
        role: "assistant",
        content: textAccumulator || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args || "{}" },
        })),
      });
    } else {
      openaiMessages.push({ role: "assistant", content: textAccumulator });
    }

    // Done if model didn't request tools
    if (finishReason !== "tool_calls" || toolCalls.length === 0) break;

    // Execute each tool, append results, loop
    for (const tc of toolCalls) {
      if (signal?.aborted) {
        yield { type: "text", content: "\n\n[Task cancelled by user.]" };
        yield { type: "done" };
        return;
      }

      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(tc.args || "{}");
      } catch {
        console.error("[FRIDAY] Malformed tool input JSON, skipping tool call", tc.name);
        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: "malformed tool arguments" }),
        });
        continue;
      }

      yield {
        type: "tool_call",
        toolCall: { id: tc.id, toolName: tc.name, parameters: parsedInput },
      };

      try {
        const result = await toolRegistry.execute(tc.name, parsedInput);

        yield {
          type: "tool_result",
          toolResult: {
            toolCallId: tc.id,
            success: result.success,
            data: result.data,
            error: result.error,
          },
        };

        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result.data ?? result.error ?? ""),
        });
      } catch (toolError) {
        const errorMsg = toolError instanceof Error ? toolError.message : "Tool execution failed";

        yield {
          type: "tool_result",
          toolResult: { toolCallId: tc.id, success: false, error: errorMsg },
        };

        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: errorMsg }),
        });
      }
    }
  }

  yield { type: "done" };
}

// ─── Health check ────────────────────────────────────────────

export async function checkOpenAI(): Promise<boolean> {
  if (!config.groq.apiKey) return false;
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
