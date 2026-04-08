// FRIDAY LLM Service — Anthropic Claude
// Migrated from OpenAI GPT-4o → Anthropic Claude Sonnet 4
// Filename kept as openai.ts to minimize import churn (3 files import from here)

import Anthropic from "@anthropic-ai/sdk";
import { config, FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import type {
  Message,
  StreamChunk,
  ToolCall,
} from "../types/index.js";
import { toolRegistry } from "../tools/registry.js";

// ─── Constants ───────────────────────────────────────────────
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2000;
const MAX_TOOL_ROUNDS = 10;

// ─── Initialize Anthropic client ─────────────────────────────
const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
});

// ─── Tool Format Conversion ─────────────────────────────────
// Converts our tool registry to Anthropic's input_schema format
// Handles both ToolParameter[] arrays and raw JSON Schema objects
function getAnthropicTools(): Anthropic.Tool[] {
  return toolRegistry.getAllTools().map((tool) => {
    const params = tool.parameters as any;

    // Already in JSON Schema format (e.g., task-manager tools)
    if (params && !Array.isArray(params) && params.type === "object") {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: params as Anthropic.Tool.InputSchema,
      };
    }

    // ToolParameter[] array format → JSON Schema
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
        required: paramArray
          .filter((p: any) => p.required)
          .map((p: any) => p.name),
      } as Anthropic.Tool.InputSchema,
    };
  });
}

// ─── Message Helpers ─────────────────────────────────────────
type AnthropicMessage = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;

/**
 * Merge consecutive messages with the same role.
 * Anthropic requires strictly alternating user/assistant turns.
 * When two same-role messages collide (e.g., tool_result user + follow-up user),
 * their content is concatenated into a single message.
 */
function mergeConsecutiveMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  if (messages.length === 0) return [];

  const merged: AnthropicMessage[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = messages[i];

    if (prev.role === curr.role) {
      // Convert both to content block arrays, then concatenate
      const prevBlocks = toContentBlocks(prev.content);
      const currBlocks = toContentBlocks(curr.content);
      merged[merged.length - 1] = {
        role: prev.role,
        content: [...prevBlocks, ...currBlocks],
      };
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

/** Normalize message content to an array of content blocks */
function toContentBlocks(
  content: string | ContentBlockParam[]
): ContentBlockParam[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

/**
 * Convert our Message[] to Anthropic message format.
 * - System messages are skipped (handled via separate `system` parameter)
 * - Assistant messages with tool calls become content block arrays
 * - Tool results become user messages with tool_result blocks
 * - Consecutive same-role messages are merged at the end
 */
function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    // Skip system messages — handled via separate `system` parameter
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Build content blocks: text (if any) + tool_use blocks
        const blocks: ContentBlockParam[] = [];

        if (msg.content) {
          blocks.push({ type: "text", text: msg.content });
        }

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

    // Tool results become a user message with tool_result content blocks
    if (msg.toolResults && msg.toolResults.length > 0) {
      const resultBlocks: Anthropic.ToolResultBlockParam[] = msg.toolResults.map(
        (tr) => ({
          type: "tool_result" as const,
          tool_use_id: tr.toolCallId,
          content: JSON.stringify(tr.data ?? tr.error),
          is_error: !tr.success,
        })
      );

      result.push({ role: "user", content: resultBlocks });
    }
  }

  return mergeConsecutiveMessages(result);
}

// ─── Non-streaming Chat Completion ───────────────────────────
export async function chatCompletion(messages: Message[]): Promise<{
  content: string;
  toolCalls?: ToolCall[];
}> {
  const tools = config.enableTools ? getAnthropicTools() : undefined;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: FRIDAY_SYSTEM_PROMPT,
    messages: toAnthropicMessages(messages),
    ...(tools && tools.length > 0 ? { tools } : {}),
  });

  let textContent = "";
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        toolName: block.name,
        parameters: block.input as Record<string, unknown>,
      });
    }
  }

  return {
    content: textContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// ─── Streaming Chat Completion with Agentic Tool Loop ────────
// The entire tool execution cycle lives here:
//   1. Stream response from Claude
//   2. If Claude requests tools → execute them → feed results back → repeat
//   3. Yield text/tool_call/tool_result events for SSE forwarding
//   4. Loop up to MAX_TOOL_ROUNDS then stop
export async function* streamChatCompletion(
  messages: Message[],
  signal?: AbortSignal,
  systemPromptExtras?: string
): AsyncGenerator<StreamChunk> {
  const tools = config.enableTools ? getAnthropicTools() : undefined;
  const anthropicMessages = toAnthropicMessages(messages);
  const fullSystemPrompt = FRIDAY_SYSTEM_PROMPT + (systemPromptExtras || "");

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Check cancellation before each round
    if (signal?.aborted) {
      yield { type: "text", content: "\n\n[Task cancelled by user.]" };
      break;
    }
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: fullSystemPrompt,
      messages: anthropicMessages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    // Accumulate assistant content blocks for the agentic loop
    const assistantBlocks: ContentBlockParam[] = [];
    let currentBlockType: string | null = null;
    let currentToolUse: { id: string; name: string; inputJson: string } | null =
      null;
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
              console.error("[JARVIS] Malformed tool input JSON, skipping tool call");
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

    // Get final message to check stop_reason
    const finalMessage = await stream.finalMessage();

    // Append assistant turn to the running conversation
    anthropicMessages.push({ role: "assistant", content: assistantBlocks });

    // If Claude didn't request tools, we're done
    if (finalMessage.stop_reason !== "tool_use") {
      break;
    }

    // ── Execute tools and feed results back ──
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantBlocks) {
      if (block.type !== "tool_use") continue;

      // Check cancellation before each tool execution
      if (signal?.aborted) {
        yield { type: "text", content: "\n\n[Task cancelled by user.]" };
        yield { type: "done" };
        return;
      }

      const toolUseBlock = block as Anthropic.ToolUseBlockParam;

      // Notify frontend about the tool call
      yield {
        type: "tool_call",
        toolCall: {
          id: toolUseBlock.id,
          toolName: toolUseBlock.name,
          parameters: (toolUseBlock.input as Record<string, unknown>) || {},
        },
      };

      // Execute
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
        const errorMsg =
          toolError instanceof Error ? toolError.message : "Tool execution failed";

        yield {
          type: "tool_result",
          toolResult: {
            toolCallId: toolUseBlock.id,
            success: false,
            error: errorMsg,
          },
        };

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify({ error: errorMsg }),
          is_error: true,
        });
      }
    }

    // Feed tool results back for the next round
    anthropicMessages.push({ role: "user", content: toolResultBlocks });
  }

  yield { type: "done" };
}

// ─── Health Check ────────────────────────────────────────────
// Export name kept as checkOpenAI to avoid breaking imports
export async function checkOpenAI(): Promise<boolean> {
  if (!config.anthropicApiKey) {
    return false;
  }

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

// ─── Simple Message Type (used by ralph-loop.ts) ─────────────
export interface SimpleMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ─── Raw Streaming Completion (for Ralph Loop & direct uses) ─
// Accepts SimpleMessage[] — extracts system messages into the
// system parameter and runs the same agentic tool loop.
export async function* streamRawCompletion(
  messages: SimpleMessage[]
): AsyncGenerator<StreamChunk> {
  const tools = config.enableTools ? getAnthropicTools() : undefined;

  // Extract system messages → separate `system` parameter
  const systemParts = messages.filter((m) => m.role === "system");
  const systemPrompt =
    systemParts.length > 0
      ? systemParts.map((m) => m.content).join("\n\n")
      : undefined;

  // Build Anthropic messages (skip system role, merge consecutive)
  const nonSystem: AnthropicMessage[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const anthropicMessages = mergeConsecutiveMessages(nonSystem);

  // Anthropic requires the conversation to start with a user message
  if (anthropicMessages.length === 0 || anthropicMessages[0].role !== "user") {
    anthropicMessages.unshift({ role: "user", content: "Continue." });
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: anthropicMessages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    const assistantBlocks: ContentBlockParam[] = [];
    let currentBlockType: string | null = null;
    let currentToolUse: { id: string; name: string; inputJson: string } | null =
      null;
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
              console.error("[JARVIS] Malformed tool input JSON, skipping tool call");
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
    anthropicMessages.push({ role: "assistant", content: assistantBlocks });

    if (finalMessage.stop_reason !== "tool_use") {
      break;
    }

    // Execute tools
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantBlocks) {
      if (block.type !== "tool_use") continue;

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
        const errorMsg =
          toolError instanceof Error ? toolError.message : "Tool execution failed";

        yield {
          type: "tool_result",
          toolResult: {
            toolCallId: toolUseBlock.id,
            success: false,
            error: errorMsg,
          },
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
