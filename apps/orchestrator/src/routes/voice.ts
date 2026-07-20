// Live Voice Chat — WebSocket route for the browser VoiceChat component.
//
// Protocol (lightweight — control via JSON, audio as binary frames):
//
//   Client → Server (JSON text frames):
//     { type: "transcript", text: "..." }   user's finalized utterance
//     { type: "interrupt" }                 user started talking again — cancel TTS
//     { type: "ping" }                      heartbeat
//
//   Server → Client:
//     { type: "ready" }                              connected & ready for transcripts
//     { type: "assistant_delta", text: "..." }       streaming LLM tokens
//     { type: "assistant_done",  text: "<full>" }    full response, post-stream
//     { type: "audio_start", mime: "audio/mpeg" }    next binary frame = MP3 utterance
//     <binary frame>                                 MP3 bytes (full utterance)
//     { type: "audio_end" }                          playback bytes complete
//     { type: "audio_unavailable" }                  TTS not configured / failed — client falls back
//     { type: "error", message: "..." }              soft error (session continues)
//     { type: "pong" }                               heartbeat reply
//
// Conversation history lives in-process per WS connection — drops on disconnect.
// That's deliberate: voice chat is ephemeral, not the journaled chat path.

import type { FastifyInstance } from "fastify";
import { streamChatCompletion } from "../services/openai.js";
import { synthesizeUtterance, isVoiceSynthAvailable } from "../services/voice-service.js";
import type { Message } from "../types/index.js";

const MAX_TRANSCRIPT_LEN = 4_000;
const MAX_HISTORY = 16; // last 8 turns — enough for short-context chat without runaway prompt size

type ControlFrame =
  | { type: "transcript"; text: string }
  | { type: "interrupt" }
  | { type: "ping" };

function isControlFrame(value: unknown): value is ControlFrame {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: unknown }).type;
  if (t === "transcript") {
    return typeof (value as { text?: unknown }).text === "string";
  }
  return t === "interrupt" || t === "ping";
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function voiceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/voice", { websocket: true }, (socket) => {
    const sessionId = genId("vs");
    const history: Message[] = [];
    // Each turn runs serially. If a new transcript arrives mid-turn we abort
    // the prior LLM call so FRIDAY doesn't keep talking after the user cut in.
    let currentAbort: AbortController | null = null;

    const sendJson = (payload: Record<string, unknown>): void => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify(payload));
    };

    const sendBinary = (data: Buffer): void => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(data);
    };

    app.log.info({ sessionId }, "[voice] session opened");
    sendJson({ type: "ready", sessionId, synthAvailable: isVoiceSynthAvailable() });

    async function handleTranscript(text: string): Promise<void> {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_TRANSCRIPT_LEN) {
        sendJson({ type: "error", message: `transcript exceeds ${MAX_TRANSCRIPT_LEN} chars` });
        return;
      }

      // Cancel any in-flight turn first — barge-in semantics.
      if (currentAbort) currentAbort.abort();
      currentAbort = new AbortController();
      const signal = currentAbort.signal;

      history.push({
        id: genId("msg"),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      });

      let assistantText = "";

      try {
        for await (const chunk of streamChatCompletion(history.slice(-MAX_HISTORY), signal)) {
          if (signal.aborted) return;

          if (chunk.type === "text" && chunk.content) {
            assistantText += chunk.content;
            sendJson({ type: "assistant_delta", text: chunk.content });
          } else if (chunk.type === "error") {
            sendJson({ type: "error", message: chunk.content || "stream error" });
          }
          // tool_call / tool_result frames are intentionally not surfaced —
          // the voice channel is text+audio only. Tools still execute inside
          // streamChatCompletion's loop; their narrated result reaches us as
          // subsequent "text" chunks.
        }
      } catch (err) {
        if (signal.aborted) {
          app.log.info({ sessionId }, "[voice] turn aborted (barge-in or disconnect)");
          return;
        }
        const msg = err instanceof Error ? err.message : "completion failed";
        app.log.error({ sessionId, err }, "[voice] streamChatCompletion failed");
        sendJson({ type: "error", message: msg });
        return;
      }

      if (signal.aborted) return;

      history.push({
        id: genId("msg"),
        role: "assistant",
        content: assistantText,
        timestamp: new Date(),
      });

      sendJson({ type: "assistant_done", text: assistantText });

      // Synthesize the full utterance. flash_v2_5 returns the whole MP3 fast
      // enough (~200-500ms for 1-2 sentences) that buffer-then-play meets the
      // <2s budget without the complexity of MediaSource-style chunk streaming.
      // If you need lower perceived latency on long responses, split the text
      // here on sentence boundaries and synthesize+send each piece in order.
      const audio = await synthesizeUtterance(assistantText);
      if (signal.aborted) return;

      if (audio) {
        sendJson({ type: "audio_start", mime: "audio/mpeg", bytes: audio.length });
        sendBinary(audio);
        sendJson({ type: "audio_end" });
      } else {
        // Soft fail: client falls back to browser speechSynthesis.
        sendJson({ type: "audio_unavailable" });
      }
    }

    socket.on("message", (raw: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // Reserved for future raw-audio upload path; ignored for now.
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf-8"));
      } catch {
        sendJson({ type: "error", message: "invalid JSON frame" });
        return;
      }

      if (!isControlFrame(parsed)) {
        sendJson({ type: "error", message: "unknown frame type" });
        return;
      }

      if (parsed.type === "ping") {
        sendJson({ type: "pong" });
        return;
      }

      if (parsed.type === "interrupt") {
        if (currentAbort) {
          currentAbort.abort();
          currentAbort = null;
        }
        return;
      }

      // transcript
      void handleTranscript(parsed.text);
    });

    socket.on("close", () => {
      if (currentAbort) currentAbort.abort();
      app.log.info({ sessionId }, "[voice] session closed");
    });

    socket.on("error", (err: Error) => {
      app.log.warn({ sessionId, err: err.message }, "[voice] socket error");
    });
  });
}
