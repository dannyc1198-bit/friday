// Proactive Alerts Routes — delivery surface for FRIDAY's nervous system
//
// GET  /api/proactive/alerts         → list unread alerts
// POST /api/proactive/alerts/:id/read  → mark alert read
// POST /api/proactive/alerts/:id/speak → speak alert via TTS + mark read
//
// Auth: global bearer middleware applied in index.ts covers these paths.

import type { FastifyPluginAsync } from "fastify";
import { proactiveMonitor } from "../services/proactive-monitor.js";
import { textToSpeech, isTTSAvailable, stripForTTS } from "../services/tts.js";

const proactiveAlertsRoutes: FastifyPluginAsync = async (app) => {
  // List unread alerts
  app.get("/api/proactive/alerts", async () => {
    const alerts = proactiveMonitor.getAlerts();
    return { alerts, count: alerts.length };
  });

  // Mark a single alert as read
  app.post<{ Params: { id: string } }>(
    "/api/proactive/alerts/:id/read",
    async (request, reply) => {
      const ok = proactiveMonitor.markRead(request.params.id);
      if (!ok) {
        reply.code(404);
        return { ok: false, error: "Alert not found" };
      }
      return { ok: true };
    }
  );

  // Speak an alert via TTS, then mark it read
  app.post<{ Params: { id: string } }>(
    "/api/proactive/alerts/:id/speak",
    async (request, reply) => {
      const { id } = request.params;
      const alert = proactiveMonitor
        .getAllAlerts()
        .find((a) => a.id === id);

      if (!alert) {
        reply.code(404);
        return { ok: false, error: "Alert not found" };
      }

      const spokenText = stripForTTS(alert.message);

      if (!isTTSAvailable()) {
        // Graceful degrade — queued, but not spoken
        proactiveMonitor.markRead(id);
        return {
          ok: true,
          spoken: false,
          spokenText,
          note: "TTS unavailable — alert marked read but not spoken",
        };
      }

      try {
        const audio = await textToSpeech(alert.message);
        proactiveMonitor.markRead(id);

        if (!audio) {
          return {
            ok: true,
            spoken: false,
            spokenText,
            note: "TTS generation returned null",
          };
        }

        reply.header("Content-Type", "audio/mpeg");
        reply.header("X-Alert-Id", id);
        reply.header("X-Spoken-Text", encodeURIComponent(spokenText).slice(0, 500));
        return reply.send(audio);
      } catch (err) {
        app.log.error({ err, id }, "Alert speak failed");
        reply.code(500);
        return { ok: false, error: "TTS failed", spokenText };
      }
    }
  );
};

export default proactiveAlertsRoutes;
