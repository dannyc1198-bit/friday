import test from "node:test";
import assert from "node:assert/strict";
import { handsFreeStatus } from "./voice-status";

test("a failed realtime session is one status line and still names a speaker", () => {
  const line = handsFreeStatus({ connected: null, failed: "realtime", hasElevenKey: true });
  assert.match(line, /ElevenLabs voice/);
  assert.match(line, /Edge/);
  assert.doesNotMatch(line, /browser voice will speak/);
  assert.equal(line.includes("\n"), false);

  const edge = handsFreeStatus({ connected: null, failed: "realtime", hasElevenKey: false });
  assert.match(edge, /Edge voice/);
  assert.doesNotMatch(edge, /ElevenLabs voice is speaking/);
});
