// FRIDAY LLM Service — Anthropic Claude (simple edition, amputated 2026-04-20)
//
// Filename kept as openai.ts to minimize import churn. Only two exports are
// used: streamChatCompletion (agentic tool loop) and checkOpenAI (health).
// chatCompletion / streamRawCompletion / SimpleMessage were removed with
// ralph-loop + agent-dispatch.
//
// Prompt caching: the stable FRIDAY_SYSTEM_PROMPT + tool schemas are marked
// with `cache_control: ephemeral`. Volatile per-turn memory context is
// appended as a second, uncached system block so it doesn't invalidate the
// cached prefix. Expect ~90% cache-read ratio on repeated requests within
// the 5-minute TTL — roughly 10× cheaper than uncached.

import Anthropic from "@anthropic-ai/sdk";
import { config, FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import type { Message, StreamChunk } from "../types/index.js";
import { toolRegistry } from "../tools/registry.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 10;

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

// ─── Tool schema conversion (tool registry → Anthropic.Tool) ─

function getAnthropicTools(): Anthropic.Tool[] {
  return toolRegistry.getAllTools().map((tool) => {
    const params = tool.parameters as any;

    if (params && !Array.isArray(params) && params.type === "object") {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: params as Anthropic.Tool.InputSchema,
      };
    }

    const paramArray = Array.isArray(params) ? params : [];
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
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
      } as Anthropic.Tool.InputSchema,
    };
  });
}

// ─── Message helpers ─────────────────────────────────────────

type AnthropicMessage = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;

function toContentBlocks(content: string | ContentBlockParam[]): ContentBlockParam[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

function mergeConsecutiveMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  if (messages.length === 0) return [];
  const merged: AnthropicMessage[] = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = messages[i];
    if (prev.role === curr.role) {
      merged[merged.length - 1] = {
        role: prev.role,
        content: [...toContentBlocks(prev.content), ...toContentBlocks(curr.content)],
      };
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const blocks: ContentBlockParam[] = [];
        if (msg.content) blocks.push({ type: "text", text: msg.content });
        for (const tc of msg.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.toolName,
            input: tc.parameters,
          });
        }
        result.push({ role: "assistant", content: blocks });
      } else {
        result.push({ role: "assistant", content: msg.content });
      }
    }

    if (msg.toolResults && msg.toolResults.length > 0) {
      const resultBlocks: Anthropic.ToolResultBlockParam[] = msg.toolResults.map((tr) => ({
        type: "tool_result" as const,
        tool_use_id: tr.toolCallId,
        content: JSON.stringify(tr.data ?? tr.error),
        is_error: !tr.success,
      }));
      result.push({ role: "user", content: resultBlocks });
    }
  }
  return mergeConsecutiveMessages(result);
}

// ─── System prompt builder with cache breakpoint ─────────────
//
// Render order is tools → system → messages. A cache_control breakpoint on
// the last system block caches tools + that block together. We put the
// stable FRIDAY_SYSTEM_PROMPT block FIRST with cache_control on it, then
// append the volatile per-turn memory context as a second block with NO
// cache_control — so changes to the memory context only invalidate the
// downstream messages cache, never the system/tools prefix.
//
// If there are no extras, the first block IS the last block and still
// carries the breakpoint — cache still works.

function buildSystemBlocks(extras?: string): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: FRIDAY_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (extras && extras.trim()) {
    blocks.push({ type: "text", text: extras });
  }
  return blocks;
}

// ─── Streaming chat completion with agentic tool loop ────────

export async function* streamChatCompletion(
  messages: Message[],
  signal?: AbortSignal,
  systemPromptExtras?: string
): AsyncGenerator<StreamChunk> {
  const tools = config.enableTools ? getAnthropicTools() : undefined;
  const anthropicMessages = toAnthropicMessages(messages);
  const systemBlocks = buildSystemBlocks(systemPromptExtras);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) {
      yield { type: "text", content: "\n\n[Task cancelled by user.]" };
      break;
    }

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: anthropicMessages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    const assistantBlocks: ContentBlockParam[] = [];
    let currentBlockType: string | null = null;
    let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
    let textAccumulator = "";

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "text") {
            currentBlockType = "text";
          } else if (block.type === "tool_use") {
            currentBlockType = "tool_use";
            currentToolUse = { id: block.id, name: block.name, inputJson: "" };
          }
          break;
        }
        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            textAccumulator += delta.text;
            yield { type: "text", content: delta.text };
          } else if (delta.type === "input_json_delta" && currentToolUse) {
            currentToolUse.inputJson += delta.partial_json;
          }
          break;
        }
        case "content_block_stop": {
          if (currentBlockType === "text" && textAccumulator) {
            assistantBlocks.push({ type: "text", text: textAccumulator });
            textAccumulator = "";
          } else if (currentBlockType === "tool_use" && currentToolUse) {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = JSON.parse(currentToolUse.inputJson || "{}");
            } catch {
              console.error("[FRIDAY] Malformed tool input JSON, skipping tool call");
              currentToolUse = null;
              currentBlockType = null;
              continue;
            }
            assistantBlocks.push({
              type: "tool_use",
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: parsedInput,
            });
            currentToolUse = null;
          }
          currentBlockType = null;
          break;
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    // Log cache hit stats on the first round — helps verify caching works
    if (round === 0 && finalMessage.usage) {
      const u = finalMessage.usage;
      const cacheRead = u.cache_read_input_tokens ?? 0;
      const cacheWrite = u.cache_creation_input_tokens ?? 0;
      if (cacheRead > 0 || cacheWrite > 0) {
        console.log(`[FRIDAY] cache read=${cacheRead} write=${cacheWrite} uncached=${u.input_tokens}`);
      }
    }

    anthropicMessages.push({ role: "assistant", content: assistantBlocks });

    if (finalMessage.stop_reason !== "tool_use") break;

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantBlocks) {
      if (block.type !== "tool_use") continue;

      if (signal?.aborted) {
        yield { type: "text", content: "\n\n[Task cancelled by user.]" };
        yield { type: "done" };
        return;
      }

      const toolUseBlock = block as Anthropic.ToolUseBlockParam;

      yield {
        type: "tool_call",
        toolCall: {
          id: toolUseBlock.id,
          toolName: toolUseBlock.name,
          parameters: (toolUseBlock.input as Record<string, unknown>) || {},
        },
      };

      try {
        const result = await toolRegistry.execute(
          toolUseBlock.name,
          (toolUseBlock.input as Record<string, unknown>) || {}
        );

        yield {
          type: "tool_result",
          toolResult: {
            toolCallId: toolUseBlock.id,
            success: result.success,
            data: result.data,
            error: result.error,
          },
        };

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(result.data ?? result.error),
          is_error: !result.success,
        });
      } catch (toolError) {
        const errorMsg = toolError instanceof Error ? toolError.message : "Tool execution failed";

        yield {
          type: "tool_result",
          toolResult: { toolCallId: toolUseBlock.id, success: false, error: errorMsg },
        };

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify({ error: errorMsg }),
          is_error: true,
        });
      }
    }

    anthropicMessages.push({ role: "user", content: toolResultBlocks });
  }

  yield { type: "done" };
}

// ─── Health check ────────────────────────────────────────────

export async function checkOpenAI(): Promise<boolean> {
  if (!config.anthropicApiKey) return false;
  try {
    await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch {
    return false;
  }
}
