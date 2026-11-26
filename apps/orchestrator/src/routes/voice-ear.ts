import type { FastifyInstance } from "fastify";
import { getVoiceEar } from "../services/voice-ear/runtime.js";
import { addLiveClient, liveListenerCount, publishInterrupt } from "../services/voice-ear/live.js";

const MAX_TEXT = 4000;
const PHASES = new Set(["asleep", "listening", "thinking", "speaking", "alert"]);

export async function voiceEarRoutes(app: FastifyInstance): Promise<void> {
  const snapshot = () => ({ ...getVoiceEar().status(), rendererConnected: liveListenerCount() > 0 });

  app.get("/api/voice/ear", async () => snapshot());

  app.get("/api/voice/ear/live", { websocket: true }, (socket) => {
    const remove = addLiveClient(socket);
    socket.send(JSON.stringify({ type: "state", status: snapshot(), listeners: liveListenerCount() }));
    socket.on("close", () => remove());
    socket.on("message", (raw: Buffer | string) => {
      let body: { type?: string; id?: string; state?: string } = {};
      try {
        body = JSON.parse(String(raw)) as { type?: string; id?: string; state?: string };
      } catch {
        return;
      }
      if (body.type === "interrupt") {
        publishInterrupt();
        if (body.id) getVoiceEar().notePlayback(body.id, "done");
        return;
      }
      if (body.type === "playback" && body.id) {
        const playback = body.state === "playing" || body.state === "done" || body.state === "local" ? body.state : "done";
        getVoiceEar().notePlayback(body.id, playback);
      }
    });
  });

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
    const phase = String(request.body?.phase || "asleep");
    const next = PHASES.has(phase) ? phase as "asleep" | "listening" | "thinking" | "speaking" | "alert" : "asleep";
    getVoiceEar().setPresence(next);
    return getVoiceEar().status();
  });

  app.post<{ Body: { id?: string } }>("/api/voice/ear/interrupt", async (request) => {
    publishInterrupt();
    const id = String(request.body?.id || getVoiceEar().status().speech?.id || "");
    if (id) getVoiceEar().notePlayback(id, "done");
    return snapshot();
  });

  app.post<{ Body: { level?: number } }>("/api/voice/ear/level", async (request) => {
    const level = Number(request.body?.level);
    if (Number.isFinite(level)) getVoiceEar().setMicLevel(level);
    return getVoiceEar().status();
  });

  app.post<{ Body: { consume?: boolean } }>("/api/voice/ear/arm", async (request) => {
    if (request.body?.consume) getVoiceEar().consumeArm();
    else getVoiceEar().arm();
    return snapshot();
  });

  app.post<{ Body: { id?: string; state?: string } }>("/api/voice/ear/playback", async (request) => {
    const id = String(request.body?.id || "");
    const state = request.body?.state;
    const playback = state === "playing" || state === "done" || state === "local" ? state : "done";
    return getVoiceEar().notePlayback(id, playback);
  });
}
