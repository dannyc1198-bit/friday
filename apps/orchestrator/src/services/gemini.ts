// FRIDAY LLM Service — Google Gemini (Free Tier)
// Used for simple/routine tasks to reduce API costs
// Complex tasks still route to Claude via openai.ts

import {
  GoogleGenerativeAI,
  type FunctionDeclaration,
  type Part,
  type Content,
  SchemaType,
} from "@google/generative-ai";
import { config, FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import type { Message, StreamChunk, ToolParameter } from "../types/index.js";
import { toolRegistry } from "../tools/registry.js";

// ─── Constants ───────────────────────────────────────────────
const MAX_TOOL_ROUNDS = 10;

// ─── Initialize Gemini client ────────────────────────────────
let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return genAI;
}

// ─── Type Mapping ────────────────────────────────────────────
// Maps our ToolParameter types to Gemini's SchemaType enum
function mapType(type: string): SchemaType {
  switch (type) {
    case "string":
      return SchemaType.STRING;
    case "number":
      return SchemaType.NUMBER;
    case "boolean":
      return SchemaType.BOOLEAN;
    case "array":
      return SchemaType.ARRAY;
    case "object":
      return SchemaType.OBJECT;
    default:
      return SchemaType.STRING;
  }
}

// ─── Tool Format Conversion ─────────────────────────────────
// Converts our tool registry to Gemini's functionDeclarations format
function getGeminiFunctionDeclarations(): FunctionDeclaration[] {
  return toolRegistry.getAllTools().map((tool) => {
    const params = tool.parameters as any;

    // Already in JSON Schema format (e.g., task-manager tools)
    if (params && !Array.isArray(params) && params.type === "object") {
      const properties: Record<string, any> = {};
      if (params.properties) {
        for (const [key, val] of Object.entries(params.properties as Record<string, any>)) {
          properties[key] = {
            type: mapType(val.type || "string"),
            description: val.description || key,
          };
        }
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties,
          required: params.required || [],
        },
      } as FunctionDeclaration;
    }

    // ToolParameter[] array format → Gemini schema
    const paramArray: ToolParameter[] = Array.isArray(params) ? params : [];
    const properties: Record<string, any> = {};
    for (const param of paramArray) {
      properties[param.name] = {
        type: mapType(param.type),
        description: param.description,
      };
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties,
        required: paramArray.filter((p) => p.required).map((p) => p.name),
      },
    } as FunctionDeclaration;
  });
}

// ─── Message Conversion ──────────────────────────────────────
// Convert our Message[] to Gemini Content[] format
function toGeminiContents(messages: Message[]): Content[] {
  const contents: Content[] = [];

  for (const msg of messages) {
    // Skip system messages — handled via systemInstruction
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: msg.content }],
      });
    } else if (msg.role === "assistant") {
      const parts: Part[] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.toolName,
              args: tc.parameters,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: "model", parts });
      }

      // Tool results go as a separate user turn with functionResponse parts
      if (msg.toolResults && msg.toolResults.length > 0) {
        const responseParts: Part[] = msg.toolResults.map((tr) => ({
          functionResponse: {
            name: msg.toolCalls?.find((tc) => tc.id === tr.toolCallId)?.toolName || "unknown",
            response: { result: tr.data ?? tr.error ?? "no result" },
          },
        }));
        contents.push({ role: "user", parts: responseParts });
      }
    }
  }

  // Gemini requires conversation to start with user role
  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Hello." }] });
  }

  // Gemini requires strictly alternating user/model turns — merge consecutive same-role
  const merged: Content[] = [contents[0]];
  for (let i = 1; i < contents.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = contents[i];
    if (prev.role === curr.role) {
      prev.parts = [...prev.parts, ...curr.parts];
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

// ─── Streaming Chat Completion with Agentic Tool Loop ────────
// Mirrors the interface of streamChatCompletion in openai.ts
// Yields identical StreamChunk events for SSE forwarding
export async function* streamGeminiCompletion(
  messages: Message[],
  signal?: AbortSignal,
  systemPromptExtras?: string
): AsyncGenerator<StreamChunk> {
  const tools = config.enableTools ? getGeminiFunctionDeclarations() : undefined;
  const fullSystemPrompt = FRIDAY_SYSTEM_PROMPT + (systemPromptExtras || "");
  const geminiContents = toGeminiContents(messages);

  // Build model with system instruction and tools
  const model = getClient().getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: fullSystemPrompt,
    tools: tools && tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
  });

  // Running conversation for the agentic loop
  const runningContents: Content[] = [...geminiContents];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) {
      yield { type: "text", content: "\n\n[Task cancelled by user.]" };
      break;
    }

    try {
      // Use streaming for text output
      const streamResult = await model.generateContentStream({
        contents: runningContents,
      });

      let fullText = "";
      const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

      // Stream text chunks as they arrive
      for await (const chunk of streamResult.stream) {
        const candidate = chunk.candidates?.[0];
        if (!candidate?.content?.parts) continue;

        for (const part of candidate.content.parts) {
          if (part.text) {
            fullText += part.text;
            yield { type: "text", content: part.text };
          }
          if (part.functionCall) {
            functionCalls.push({
              name: part.functionCall.name,
              args: (part.functionCall.args as Record<string, unknown>) || {},
            });
          }
        }
      }

      // Build model response content for conversation history
      const modelParts: Part[] = [];
      if (fullText) {
        modelParts.push({ text: fullText });
      }
      for (const fc of functionCalls) {
        modelParts.push({
          functionCall: { name: fc.name, args: fc.args },
        });
      }
      if (modelParts.length > 0) {
        runningContents.push({ role: "model", parts: modelParts });
      }

      // If no function calls, we're done
      if (functionCalls.length === 0) {
        break;
      }

      // ── Execute tools and feed results back ──
      const responseParts: Part[] = [];

      for (const fc of functionCalls) {
        if (signal?.aborted) {
          yield { type: "text", content: "\n\n[Task cancelled by user.]" };
          yield { type: "done" };
          return;
        }

        const toolCallId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Notify frontend about the tool call
        yield {
          type: "tool_call",
          toolCall: {
            id: toolCallId,
            toolName: fc.name,
            parameters: fc.args,
          },
        };

        // Execute
        try {
          const result = await toolRegistry.execute(fc.name, fc.args);

          yield {
            type: "tool_result",
            toolResult: {
              toolCallId,
              success: result.success,
              data: result.data,
              error: result.error,
            },
          };

          responseParts.push({
            functionResponse: {
              name: fc.name,
              response: { result: result.data ?? result.error ?? "completed" },
            },
          });
        } catch (toolError) {
          const errorMsg =
            toolError instanceof Error ? toolError.message : "Tool execution failed";

          yield {
            type: "tool_result",
            toolResult: {
              toolCallId,
              success: false,
              error: errorMsg,
            },
          };

          responseParts.push({
            functionResponse: {
              name: fc.name,
              response: { error: errorMsg },
            },
          });
        }
      }

      // Feed tool results back for the next round
      runningContents.push({ role: "user", parts: responseParts });
    } catch (error) {
      // On any Gemini error, yield error and let caller handle fallback
      const errorMsg = error instanceof Error ? error.message : "Gemini API error";
      console.error(`[FRIDAY/Gemini] Error in round ${round}:`, errorMsg);
      throw error; // Propagate so llm-router can fallback to Claude
    }
  }

  yield { type: "done" };
}

// ─── Health Check ────────────────────────────────────────────
export async function checkGemini(): Promise<boolean> {
  if (!config.gemini.apiKey) {
    return false;
  }

  try {
    const model = getClient().getGenerativeModel({ model: config.gemini.model });
    await model.generateContent("ping");
    return true;
  } catch {
    return false;
  }
}
