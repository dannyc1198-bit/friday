import type { FastifyInstance } from "fastify";
import { liveAppsStatus } from "../services/live-apps.js";

export async function liveAppsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/live-apps", async () => ({ apps: await liveAppsStatus() }));
}