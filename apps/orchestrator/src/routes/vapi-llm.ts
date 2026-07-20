// VAPI Custom LLM Route
//
// VAPI calls this endpoint as if it were an OpenAI-compatible LLM.
// We intercept the conversation, inject Danny's full Hermes memory +
// JARVIS context into the system prompt, then forward to Claude via
// the existing streamChatCompletion service. Responses stream back
// in OpenAI SSE format so VAPI can speak them with ElevenLabs.
//
// Endpoint: POST /vapi/llm/chat/completions
//           GET  /vapi/llm/models

import type { FastifyPluginAsync } from "fastify";
import { streamChatCompletion } from "../services/openai.js";
import { buildFullMemoryContext } from "../services/memory-loader.js";
import { unifiedMemory } from "../services/unified-memory.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Message } from "../types/index.js";

// ─── Hermes memory paths ─────────────────────────────────────────
const HERMES_HOME =
  process.env.HERMES_HOME ||
  join(process.env.USERPROFILE || process.env.HOME || "", "AppData", "Local", "hermes");

function loadHermesMemory(): string {
  const files = [
    join(HERMES_HOME, "memories", "MEMORY.md"),
    join(HERMES_HOME, "memories", "USER.md"),
  ];
  const sections: string[] = [];
  for (const f of files) {
    if (existsSync(f)) {
      try {
        const raw = readFileSync(f, "utf-8").trim();
        if (raw) sections.push(raw);
      } catch {
        // skip unreadable
      }
    }
  }
  return sections.join("\n\n---\n\n");
}

// ─── System prompt ────────────────────────────────────────────────
function buildVapiSystemPrompt(userQuery: string): string {
  const hermesMemory = loadHermesMemory();
  const fridayMemory = buildFullMemoryContext();
  const unifiedCtx = unifiedMemory.buildContextForPrompt(userQuery);

  return `You are the voice of Hermes — Danny's personal AI. You're speaking to Danny on a phone call.

IMPORTANT VOICE RULES:
- Speak naturally and conversationally. No bullet points. No markdown.
- Keep responses concise — this is a phone call, not a chat window.
- You know Danny well. Use his name. Be warm but get to the point.
- If you don't know something, say so briefly and offer to look into it.
- Never read out URLs, file paths, or code. Summarize them instead.

--- DANNY'S PERSISTENT MEMORY (Hermes) ---
${hermesMemory || "(no Hermes memory loaded)"}

--- JARVIS / FRIDAY CONTEXT ---
${fridayMemory || "(no FRIDAY memory loaded)"}

${unifiedCtx ? `--- ADDITIONAL CONTEXT ---\n${unifiedCtx}` : ""}`;
}

// ─── Helpers ──────────────────────────────────────────────────────
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | null;
}

interface ChatCompletionsRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// ─── Route plugin ─────────────────────────────────────────────────
export const vapiLlmRoutes: FastifyPluginAsync = async (app) => {

  // Model discovery
  app.get("/models", async () => ({
    object: "list",
    data: [
      {
        id: "hermes-claude",
        object: "model",
        created: 1700000000,
        owned_by: "wavelength",
      },
    ],
  }));

  // Main chat completions — VAPI sends every turn here
  app.post<{ Body: ChatCompletionsRequest }>(
    "/chat/completions",
    async (request, reply) => {
      const { messages = [], stream = true } = request.body;

      const lastUserMsg =
        [...messages].reverse().find((m) => m.role === "user")?.content || "";

      const completionIdSeed = Date.now().toString(36);

      // Strip incoming system messages — we replace with ours
      const conversationMessages: Message[] = messages
        .filter((m) => m.role !== "system" && m.content)
        .map((m, i) => ({
          id: `vapi_${completionIdSeed}_${i}`,
          role: m.role as "user" | "assistant",
          content: m.content as string,
          timestamp: new Date(),
        }));

      const systemExtras = buildVapiSystemPrompt(lastUserMsg);
      const completionId = generateId("chatcmpl");

      if (!stream) {
        // Non-streaming fallback
        let fullContent = "";
        for await (const chunk of streamChatCompletion(
          conversationMessages,
          undefined,
          systemExtras
        )) {
          if (chunk.type === "text" && chunk.content) {
            fullContent += chunk.content;
          }
        }
        return {
          id: completionId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "hermes-claude",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: fullContent },
              finish_reason: "stop",
            },
          ],
        };
      }

      // Streaming SSE path
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const abortController = new AbortController();
      request.raw.on("close", () => abortController.abort());

      try {
        for await (const chunk of streamChatCompletion(
          conversationMessages,
          abortController.signal,
          systemExtras
        )) {
          if (chunk.type === "text" && chunk.content) {
            const sseChunk = {
              id: completionId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "hermes-claude",
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: chunk.content },
                  finish_reason: null,
                },
              ],
            };
            reply.raw.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          }
        }

        const doneChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "hermes-claude",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        };
        reply.raw.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
        reply.raw.write("data: [DONE]\n\n");
      } catch (err) {
        app.log.error({ err }, "[vapi-llm] stream error");
        const errChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "hermes-claude",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "Sorry Danny, I hit a snag. Give me a moment.",
              },
              finish_reason: "stop",
            },
          ],
        };
        reply.raw.write(`data: ${JSON.stringify(errChunk)}\n\n`);
        reply.raw.write("data: [DONE]\n\n");
      } finally {
        reply.raw.end();
      }
    }
  );
};
