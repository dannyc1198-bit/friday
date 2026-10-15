import type { FastifyInstance } from "fastify";
import { claimGreeting, getGreetingStatus, markGreetingHeard } from "../services/greeting.js";

export async function greetingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/greeting", async () => getGreetingStatus());

  app.post("/api/greeting", async (_request, reply) => {
    const claimed = await claimGreeting();
    reply.header("X-Greeting-Boot", claimed.bootId);
    reply.header("X-Greeting-Text", claimed.text);
    if (claimed.already || !claimed.audio) {
      reply.header("X-Greeting-Already", claimed.already ? "1" : "0");
      if (claimed.already) {
        reply.code(204);
        return reply.send();
      }
      return { bootId: claimed.bootId, text: claimed.text, audio: false };
    }
    reply.header("Content-Type", "audio/mpeg");
    reply.header("X-Greeting-Already", "0");
    return reply.send(claimed.audio);
  });

  app.post("/api/greeting/heard", async () => {
    markGreetingHeard();
    return { ok: true };
  });
}
