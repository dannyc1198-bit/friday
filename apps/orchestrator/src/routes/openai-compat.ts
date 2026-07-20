// OpenAI-compatible endpoint — the seam that lets OpenClaw (and any OpenAI
// SDK client) talk to FRIDAY. Translates OpenAI chat-completions format into
// the internal router, streams back OpenAI-shaped SSE.
//
// Routes:
//   GET  /v1/models                      — discovery, returns FRIDAY's catalog
//   POST /v1/chat/completions            — streaming + non-streaming
//
// Direct call into streamChatCompletion (Claude Haiku 4.5).
// Router layer was removed in the simple-friday amputation.

import type { FastifyInstance, FastifyReply } from "fastify";
import { streamChatCompletion } from "../services/openai.js";
import type { Message, StreamChunk } from "../types/index.js";

// ─── OpenAI request/response shapes (minimal) ─────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface ChatCompletionsRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  // Tools we ignore — FRIDAY has its own registry; OpenClaw doesn't need
  // to inject tool schemas through this endpoint.
  tools?: unknown;
  tool_choice?: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────

const MODEL_ID = "friday";
const SERVED_BY = "friday-orchestrator";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Extract system messages → extras string; convert remaining into FRIDAY's
// internal Message shape. Tool/assistant history is flattened into text so
// the router sees a coherent transcript without tool-call noise leaking in.
function convertMessages(openaiMessages: OpenAIMessage[]): {
  messages: Message[];
  systemExtras: string;
} {
  const systemParts: string[] = [];
  const messages: Message[] = [];

  for (const m of openaiMessages) {
    if (m.role === "system") {
      if (typeof m.content === "string" && m.content.trim()) {
        systemParts.push(m.content.trim());
      }
      continue;
    }

    if (m.role === "tool") {
      // Flatten tool outputs into assistant narration so the router has context
      const text = typeof m.content === "string" ? m.content : "";
      if (text.trim()) {
        messages.push({
          id: generateId("msg"),
          role: "assistant",
          content: `[tool result] ${text}`,
          timestamp: new Date(),
        });
      }
      continue;
    }

    if (m.role === "user" || m.role === "assistant") {
      const content = typeof m.content === "string" ? m.content : "";
      messages.push({
        id: generateId("msg"),
        role: m.role,
        content,
        timestamp: new Date(),
      });
    }
  }

  return {
    messages,
    systemExtras: systemParts.join("\n\n"),
  };
}

// OpenAI SSE chunk helpers — minimal surface, matches what clients expect

function sseDelta(reply: FastifyReply, id: string, created: number, delta: Record<string, unknown>, finishReason: string | null = null): void {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseDone(reply: FastifyReply): void {
  reply.raw.write("data: [DONE]\n\n");
}

// ─── Route plugin ─────────────────────────────────────────────

export async function openaiCompatRoutes(app: FastifyInstance): Promise<void> {
  // Model discovery — OpenClaw and other clients hit this to list models
  app.get("/v1/models", async () => ({
    object: "list",
    data: [
      {
        id: MODEL_ID,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: SERVED_BY,
      },
    ],
  }));

  // Chat completions — streaming and non-streaming
  app.post<{ Body: ChatCompletionsRequest }>(
    "/v1/chat/completions",
    async (request, reply) => {
      const body = request.body;

      if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
        reply.code(400);
        return { error: { message: "messages array is required", type: "invalid_request_error" } };
      }

      const { messages, systemExtras } = convertMessages(body.messages);
      if (messages.length === 0) {
        reply.code(400);
        return { error: { message: "no user/assistant messages provided", type: "invalid_request_error" } };
      }

      const stream = body.stream === true;
      const abortController = new AbortController();

      // Client disconnected mid-stream — cancel the tool loop. Only wire for
      // streaming: on non-streaming, request.raw "close" fires when the body
      // finishes parsing (Node quirk), which would abort before we respond.
      // For streaming we use reply.raw, which only fires on real socket close.
      if (stream) {
        const onClose = () => abortController.abort();
        reply.raw.on("close", onClose);
      }

      const id = generateId("chatcmpl");
      const created = Math.floor(Date.now() / 1000);

      // ── Streaming path ────────────────────────────────────
      if (stream) {
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        // First chunk: role announcement (OpenAI convention)
        sseDelta(reply, id, created, { role: "assistant", content: "" });

        try {
          for await (const chunk of streamChatCompletion(
            messages,
            abortController.signal,
            systemExtras || undefined
          )) {
            if (chunk.type === "text" && chunk.content) {
              sseDelta(reply, id, created, { content: chunk.content });
            }
            // tool_call / tool_result chunks are handled inside the agentic
            // loop in FRIDAY; we don't surface them through the OpenAI shim
            // because OpenClaw expects final text. Tools execute; only the
            // narrated result streams out as text.
            if (chunk.type === "error") {
              sseDelta(reply, id, created, { content: `\n[error: ${chunk.content || "unknown"}]` });
            }
          }
          sseDelta(reply, id, created, {}, "stop");
          sseDone(reply);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "stream failed";
          app.log.error({ error }, "openai-compat stream error");
          sseDelta(reply, id, created, { content: `\n[stream error: ${msg}]` }, "stop");
          sseDone(reply);
        } finally {
          reply.raw.end();
        }
        return;
      }

      // ── Non-streaming path ────────────────────────────────
      let fullText = "";
      try {
        for await (const chunk of streamChatCompletion(
          messages,
          abortController.signal,
          systemExtras || undefined
        )) {
          if (chunk.type === "text" && chunk.content) {
            fullText += chunk.content;
          }
        }
      } catch (error) {
        app.log.error({ error }, "openai-compat non-stream error");
        reply.code(500);
        return {
          error: {
            message: error instanceof Error ? error.message : "completion failed",
            type: "server_error",
          },
        };
      }

      return {
        id,
        object: "chat.completion",
        created,
        model: MODEL_ID,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: fullText },
            finish_reason: "stop",
          },
        ],
        usage: {
          // Token counts are handled internally by provider; we don't expose
          // them here because OpenClaw tracks its own usage separately.
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    }
  );
}

// Type guard kept for potential StreamChunk refinement elsewhere
export type { StreamChunk };
