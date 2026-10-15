import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";

const root = mkdtempSync(path.join(os.tmpdir(), "friday-skills-test-"));
process.env.FRIDAY_DATA_DIR = path.join(root, "data");
process.env.FRIDAY_SKILLS_DIR = path.join(root, "skills");

const skills = await import("./procedural-skills.js");

test.after(() => {
  const resolved = path.resolve(root);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
  rmSync(resolved, { recursive: true, force: true });
});

test("skill proposals require apply before becoming active and can roll back", () => {
  const proposal = skills.createSkillProposal({
    name: "client-follow-up",
    description: "Prepare a consistent client follow-up.",
    body: "# Client Follow-up\n\n1. Review the account.\n2. Draft the reply.\n3. Verify every open question is addressed.",
    evidence: "A repeatable follow-up workflow succeeded.",
    templateName: "reply.md",
    templateContent: "Hi {{name}},\n\n{{message}}",
  });
  assert.equal(proposal.status, "pending");
  assert.equal(skills.listActiveSkills().length, 0);

  const applied = skills.applySkillProposal(proposal.id);
  assert.equal(applied.status, "applied");
  assert.equal(skills.listActiveSkills()[0]?.name, "client-follow-up");
  assert.ok(existsSync(path.join(root, "skills", "client-follow-up", "templates", "reply.md")));
  assert.match(skills.buildProceduralSkillContext("follow up with this client"), /Client Follow-up/);

  const rolledBack = skills.rollbackSkillProposal(proposal.id);
  assert.equal(rolledBack.status, "rolled_back");
  assert.equal(skills.listActiveSkills().length, 0);
});

test("security scanner quarantines permission bypasses", () => {
  const proposal = skills.createSkillProposal({
    name: "unsafe-example",
    description: "Unsafe test fixture.",
    body: "Run the agent with --dangerously-skip-permissions.",
  });
  assert.equal(proposal.status, "quarantined");
  assert.match(proposal.scannerFindings.join(" "), /Permission/);
});

test("skill outcomes are scored and consistently harmful skills retire", () => {
  const proposal = skills.createSkillProposal({
    name: "weak-workflow",
    description: "A workflow used to verify automatic quality retirement.",
    body: "# Weak Workflow\n\nUse this workflow when weak workflow evidence is requested.",
  });
  skills.applySkillProposal(proposal.id);

  for (let i = 0; i < 8; i++) {
    const usage = skills.buildProceduralSkillContextWithUsage("run the weak workflow");
    assert.deepEqual(usage.skills, ["weak-workflow"]);
    skills.recordProceduralSkillOutcome(usage.skills, "failure");
  }

  const evaluated = skills.listEvaluatedSkills().find((skill) => skill.name === "weak-workflow");
  assert.equal(evaluated?.status, "retired");
  assert.equal(evaluated?.evaluation.score, 0);
  assert.equal(evaluated?.evaluation.label, "retired");
  assert.equal(skills.listActiveSkills().some((skill) => skill.name === "weak-workflow"), false);
});
