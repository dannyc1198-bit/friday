import test from "node:test";
import assert from "node:assert/strict";
import { stopTargets } from "./run-control.js";

test("stop without a conversation id cancels nothing", () => {
  const decision = stopTargets(undefined, ["conv-a", "conv-b"]);
  assert.deepEqual(decision.ids, []);
  assert.match(decision.error || "", /conversationId/);
});

test("stop targets only the named run", () => {
  assert.deepEqual(stopTargets("conv-b", ["conv-a", "conv-b"]).ids, ["conv-b"]);
  assert.match(stopTargets("conv-missing", ["conv-a"]).error || "", /No active run/);
});
