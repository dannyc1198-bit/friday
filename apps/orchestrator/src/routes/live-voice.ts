// Live Talk. ElevenLabs owns the microphone when that agent is ready.
// OpenAI Realtime is the fallback. The browser never receives either API key.

import type { FastifyInstance } from "fastify";
import { toolRegistry } from "../tools/registry.js";
import { selectLiveVoice } from "../services/voice-plan.js";
import { parametersToJsonSchema } from "../services/tool-schema.js";
import { issueScopedToken } from "../services/access-gate.js";
import { getApiKey } from "../middleware/auth.js";

const BUTLER = [
  "You are Friday, Daniel's assistant.",
  "Speak as a refined British butler: calm, brief, and concrete.",
  "Use the provided tools for his vault, tasks, and drafts.",
  "Never send a message, spend money, or place a live trade.",
].join(" ");

export function realtimeClientSecretBody(input: {
  model: string;
  voice: string;
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}): Record<string, unknown> {
  return {
    session: {
      type: "realtime",
      model: input.model,
      instructions: BUTLER,
      audio: { output: { voice: input.voice } },
      tools: input.tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  };
}

export function realtimeTools() {
  return toolRegistry.getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: parametersToJsonSchema(tool.parameters),
  }));
}

export async function liveVoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/voice/live", async () => selectLiveVoice(process.env));

  app.post("/api/voice/session-token", async () => {
    const now = Date.now();
    const token = issueScopedToken({ scope: "voice", secret: getApiKey(), now, ttlMs: 5 * 60_000 });
    return { token, expiresAt: new Date(now + 5 * 60_000).toISOString() };
  });

  app.get("/api/voice/elevenlabs/token", async (_request, reply) => {
    const plan = selectLiveVoice(process.env);
    const key = process.env.ELEVENLABS_API_KEY || "";
    if (!plan.agentId || !key) {
      reply.code(503);
      return { error: "ElevenLabs agent needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID." };
    }
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(plan.agentId)}`,
      { headers: { "xi-api-key": key } }
    );
    if (!response.ok) {
      reply.code(502);
      return { error: "ElevenLabs did not issue a conversation token." };
    }
    const body = (await response.json()) as { token?: string };
    if (!body.token) {
      reply.code(502);
      return { error: "ElevenLabs token response had no token." };
    }
    return { token: body.token };
  });

  app.post("/api/voice/realtime/session", async (_request, reply) => {
    const plan = selectLiveVoice(process.env);
    const key = process.env.OPENAI_API_KEY || "";
    if (!key) {
      reply.code(503);
      return { error: "OpenAI Realtime needs OPENAI_API_KEY." };
    }
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(realtimeClientSecretBody({
        model: plan.realtimeModel,
        voice: plan.realtimeVoice,
        tools: realtimeTools(),
      })),
    });
    if (!response.ok) {
      reply.code(502);
      return { error: "OpenAI did not issue a realtime session." };
    }
    const body = (await response.json()) as { value?: string };
    if (!body.value) {
      reply.code(502);
      return { error: "OpenAI session response had no client secret." };
    }
    return { token: body.value, model: plan.realtimeModel, voice: plan.realtimeVoice };
  });

  app.post<{ Body: { name?: string; arguments?: string | Record<string, unknown> } }>(
    "/api/voice/realtime/tool",
    async (request) => {
      const name = request.body?.name || "";
      let parameters: Record<string, unknown> = {};
      const raw = request.body?.arguments;
      if (raw && typeof raw === "object") parameters = raw;
      else if (typeof raw === "string" && raw.trim()) {
        try {
          parameters = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          parameters = {};
        }
      }
      const result = await toolRegistry.execute(name, parameters);
      return { output: JSON.stringify(result.success ? (result.data ?? { ok: true }) : { error: result.error }) };
    }
  );
}
