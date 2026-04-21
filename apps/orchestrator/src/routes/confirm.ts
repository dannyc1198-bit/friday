// Permission confirmation routes
//
// POST /api/confirm/:token   { approved: boolean }  -> resolves pending gate
// GET  /api/confirm/pending                         -> lists pending prompts
//
// These are consumed by the FRIDAY web UI (and any remote client) to respond
// to `confirm_action` chunks emitted during streaming tool execution.

import type { FastifyPluginAsync } from "fastify";
import {
  confirmAction,
  listPendingConfirmations,
} from "../services/permission-gate.js";

export const confirmRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Params: { token: string };
    Body: { approved: boolean };
  }>("/:token", async (req, reply) => {
    const { token } = req.params;
    const body = (req.body ?? {}) as { approved?: unknown };
    const approved = body.approved === true;

    if (!token || typeof token !== "string" || token.length < 4) {
      return reply.code(400).send({ ok: false, error: "invalid token" });
    }

    const matched = confirmAction(token, approved);
    if (!matched) {
      return reply
        .code(404)
        .send({ ok: false, error: "unknown or expired token" });
    }
    return reply.send({ ok: true, approved });
  });

  app.get("/pending", async (_req, reply) => {
    return reply.send({ ok: true, pending: listPendingConfirmations() });
  });
};

export default confirmRoutes;
