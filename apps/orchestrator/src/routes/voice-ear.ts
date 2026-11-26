import type { FastifyInstance } from "fastify";
import { getVoiceEar } from "../services/voice-ear/runtime.js";

const MAX_TEXT = 4000;

export async function voiceEarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/voice/ear", async () => getVoiceEar().status());

  app.post<{ Body: { text?: string; pushToTalk?: boolean } }>("/api/voice/ear/hear", async (request, reply) => {
    const text = String(request.body?.text || "").trim();
    if (!text) {
      reply.code(400);
      return { error: "text is required" };
    }
    if (text.length > MAX_TEXT) {
      reply.code(400);
      return { error: "Text too long. Maximum 4000 characters." };
    }
    try {
      const turn = await getVoiceEar().hear(text, { pushToTalk: Boolean(request.body?.pushToTalk) });
      return { ...turn, status: getVoiceEar().status() };
    } catch (err) {
      request.log.error({ err }, "voice ear failed");
      reply.code(500);
      return { say: "I hit a problem and left everything as it was.", acted: false };
    }
  });

  app.post<{ Body: { muted?: boolean } }>("/api/voice/ear/mute", async (request) => {
    const ear = getVoiceEar();
    const muted = typeof request.body?.muted === "boolean" ? request.body.muted : !ear.status().muted;
    ear.setMuted(muted);
    return ear.status();
  });

  app.post<{ Body: { phase?: string } }>("/api/voice/ear/presence", async (request) => {
    const phase = request.body?.phase === "listening" ? "listening" : "asleep";
    getVoiceEar().setPresence(phase);
    return getVoiceEar().status();
  });
}
