import test from "node:test";
import assert from "node:assert/strict";
import { FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import { formatCoreProfile } from "./profile.js";
import { EVIDENCE_ORDER, bootstrapPaths, classifyBrainFile } from "./memory-order.js";

test("shared brain and the current audit outrank older notes", () => {
  assert.equal(classifyBrainFile("Agents/SHARED-AI-BRAIN.md"), "shared");
  assert.equal(classifyBrainFile("FRIDAY_BRAIN/current-audit.md"), "audit");
  assert.equal(classifyBrainFile("FRIDAY_BRAIN/old-note.md"), "older");
  const paths = bootstrapPaths("/vault", "/vault/FRIDAY_BRAIN");
  assert.ok(paths.some((item) => item.endsWith("Agents/SHARED-AI-BRAIN.md") || item.endsWith("Agents\\SHARED-AI-BRAIN.md")));
  assert.match(EVIDENCE_ORDER, /this conversation/);
  assert.match(formatCoreProfile({ found: true, relativePath: "FRIDAY_BRAIN/DANNY-PROFILE.md", text: "Wavelength" }), /background/);
  assert.doesNotMatch(FRIDAY_SYSTEM_PROMPT, /Moving to Kelowna August 2026/);
  assert.match(FRIDAY_SYSTEM_PROMPT, /text HUD/);
  assert.doesNotMatch(FRIDAY_SYSTEM_PROMPT, /Strip ALL markdown/);
});
