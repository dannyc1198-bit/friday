import type { FastifyInstance } from "fastify";
import {
  applySkillProposal,
  getSkillProposal,
  listActiveSkills,
  listEvaluatedSkills,
  listSkillProposals,
  rejectSkillProposal,
  rollbackSkillProposal,
  type ProposalStatus,
} from "../services/procedural-skills.js";

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: ProposalStatus } }>("/proposals", async (request) => ({
    proposals: listSkillProposals(request.query.status),
  }));
  app.get<{ Params: { id: string } }>("/proposals/:id", async (request, reply) => {
    const proposal = getSkillProposal(request.params.id);
    if (!proposal) return reply.code(404).send({ error: "Proposal not found" });
    return proposal;
  });
  app.get("/active", async () => ({ active: listActiveSkills() }));
  app.get("/overview", async () => {
    const proposals = listSkillProposals();
    const skills = listEvaluatedSkills();
    const pending = proposals.filter((proposal) => proposal.status === "pending").length;
    const quarantined = proposals.filter((proposal) => proposal.status === "quarantined").length;
    const active = skills.filter((skill) => skill.status === "active").length;
    const retired = skills.filter((skill) => skill.status === "retired").length;
    const measured = skills.filter((skill) => skill.evaluation.score != null);
    const averageScore = measured.length
      ? Math.round(measured.reduce((sum, skill) => sum + (skill.evaluation.score || 0), 0) / measured.length)
      : null;
    return {
      summary: { pending, quarantined, active, retired, averageScore },
      proposals,
      skills,
    };
  });

  app.post<{ Params: { id: string }; Body: { approved?: boolean } }>("/proposals/:id/apply", async (request, reply) => {
    if (request.body?.approved !== true) return reply.code(400).send({ error: "approved=true is required" });
    try {
      return { ok: true, proposal: applySkillProposal(request.params.id) };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string }; Body: { approved?: boolean } }>("/proposals/:id/reject", async (request, reply) => {
    if (request.body?.approved !== true) return reply.code(400).send({ error: "approved=true is required" });
    try {
      return { ok: true, proposal: rejectSkillProposal(request.params.id) };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string }; Body: { approved?: boolean } }>("/proposals/:id/rollback", async (request, reply) => {
    if (request.body?.approved !== true) return reply.code(400).send({ error: "approved=true is required" });
    try {
      return { ok: true, proposal: rollbackSkillProposal(request.params.id) };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });
}
