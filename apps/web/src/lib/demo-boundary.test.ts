import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_THREAD, demoCookieEnabled, demoCookieValue } from "./demo-boundary.js";

test("the demo cookie is explicit and the sample thread has no personal note", () => {
  assert.match(demoCookieValue(true), /friday-demo=1/);
  assert.match(demoCookieValue(false), /Max-Age=0/);
  assert.equal(demoCookieEnabled("a=b; friday-demo=1; c=d"), true);
  assert.equal(demoCookieEnabled("friday-demo=0"), false);
  assert.match(SAMPLE_THREAD.map((item) => item.content).join(" "), /SAMPLE/);
  assert.doesNotMatch(SAMPLE_THREAD.map((item) => item.content).join(" "), /DANNY-PROFILE/);
});
