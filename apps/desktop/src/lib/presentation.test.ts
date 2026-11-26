import test from "node:test";
import assert from "node:assert/strict";
import { deriveMode, isFollowUp, modeLabel, parseShot, shouldShrink, THEMES } from "./presentation.js";

test("confirming is its own state and speaking wins while audio is queued", () => {
  assert.equal(deriveMode({ phase: "confirming" }), "confirming");
  assert.equal(deriveMode({ phase: "asleep", playback: "playing" }), "speaking");
  assert.equal(deriveMode({ phase: "listening" }), "listening");
  assert.equal(modeLabel("confirming", false), "Say yes");
  assert.equal(modeLabel("idle", false), "IDLE");
});

test("follow-up glow is listening that has not expired", () => {
  assert.equal(isFollowUp("listening", 2_000, 1_000), true);
  assert.equal(isFollowUp("listening", 500, 1_000), false);
  assert.equal(isFollowUp("speaking", 2_000, 1_000), false);
});

test("the centre shrinks only after five idle seconds", () => {
  assert.equal(shouldShrink("idle", 4999, false), false);
  assert.equal(shouldShrink("idle", 5000, false), true);
  assert.equal(shouldShrink("listening", 9000, false), false);
  assert.equal(shouldShrink("idle", 9000, true), false);
});

test("shot query can pin confirming or the ultron palette", () => {
  assert.equal(parseShot("?shot=confirming").mode, "confirming");
  assert.equal(parseShot("?shot=ultron").theme, "ultron");
  assert.notEqual(THEMES.jarvis.mid, THEMES.ultron.mid);
});
