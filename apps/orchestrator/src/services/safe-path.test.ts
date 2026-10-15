import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import os from "os";
import { conversationTranscriptPath, isInsideRoot } from "./safe-path.js";

test("a sibling directory is outside the vault root", () => {
  const root = path.join(os.tmpdir(), "vault");
  assert.equal(isInsideRoot(root, path.join(root, "FRIDAY_BRAIN", "DANNY-PROFILE.md")), true);
  assert.equal(isInsideRoot(root, path.join(root + "-evil", "note.md")), false);
  assert.equal(isInsideRoot(root, path.resolve(root, "../etc/passwd")), false);
});

test("conversation transcripts only accept uuid file names", () => {
  const dir = path.join(os.tmpdir(), "friday-convos");
  const id = "6e7e0392-bedc-688f-25bc-7a7858bcd09a";
  assert.equal(conversationTranscriptPath(dir, id), path.join(dir, `${id}.jsonl`));
  assert.equal(conversationTranscriptPath(dir, "../.env"), null);
  assert.equal(conversationTranscriptPath(dir, "..\\..\\apps\\orchestrator\\.env"), null);
});
