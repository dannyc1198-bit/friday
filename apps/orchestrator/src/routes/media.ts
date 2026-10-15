import { createReadStream, existsSync } from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import { listMediaJobs, mediaDir } from "../services/media-jobs.js";

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/media", async () => ({ jobs: listMediaJobs() }));

  app.get<{ Querystring: { name?: string } }>("/api/media/file", async (request, reply) => {
    const name = path.basename(String(request.query.name || ""));
    if (!/^[\w.-]+\.(glb|fbx|png|jpe?g|mp4|webp)$/i.test(name)) {
      reply.code(400);
      return { error: "Unknown media file" };
    }
    const file = path.join(mediaDir(), name);
    if (!existsSync(file)) {
      reply.code(404);
      return { error: "Not found" };
    }
    const type = name.endsWith(".png") ? "image/png"
      : name.endsWith(".mp4") ? "video/mp4"
      : name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg"
      : "application/octet-stream";
    reply.header("Content-Type", type);
    return reply.send(createReadStream(file));
  });
}
