import test from "node:test";
import assert from "node:assert/strict";
import { isPendingKnowledgePath, parseEvidence, rankBrainHits, type BrainHit } from "./brain.js";

test("pending proposals stay out of default recall and dates survive", () => {
  assert.equal(isPendingKnowledgePath("FRIDAY_BRAIN/proposals/DANNY-PROFILE.md"), true);
  assert.equal(isPendingKnowledgePath("FRIDAY_BRAIN/drafts/pending-approval.md"), true);
  const evidence = parseEvidence("---\ndate: 2026-10-01\nstatus: current\n---\n\nWavelength is the agency.");
  assert.equal(evidence.asOf, "2026-10-01");
  assert.equal(evidence.status, "current");
  const hits: BrainHit[] = [
    { notePath: "FRIDAY_BRAIN/proposals/DANNY-PROFILE.md", noteName: "DANNY-PROFILE", heading: "", snippet: "pending change", score: 10 },
    { notePath: "FRIDAY_BRAIN/entities/Wavelength.md", noteName: "Wavelength", heading: "", snippet: "dated", score: 3, asOf: "2026-10-01", status: "current" },
  ];
  const ranked = rankBrainHits(hits, "wavelength agency");
  assert.equal(ranked.some((hit) => hit.notePath.includes("proposals")), false);
  assert.equal(ranked[0].asOf, "2026-10-01");
  const review = rankBrainHits(hits, "pending approval profile proposal");
  assert.equal(review.some((hit) => hit.notePath.includes("proposals")), true);
});
