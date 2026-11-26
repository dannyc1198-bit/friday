import test from "node:test";
import assert from "node:assert/strict";
import { planFromTranscript, stepsFromBrain } from "./voice-plan.js";

test("and-then splits into an app open and a site", () => {
  const steps = planFromTranscript("open chrome and then go to github.com");
  assert.equal(steps?.length, 2);
  assert.equal(steps?.[0].kind, "app");
  assert.equal(steps?.[1].kind, "website");
});

test("a song title with and is not split", () => {
  assert.equal(planFromTranscript("play me rock and roll"), null);
});

test("brain steps become a chain and a send stays gated", () => {
  const steps = stepsFromBrain(JSON.stringify({
    say: "Opening Chrome, then the page.",
    steps: [
      { tool: "open_app", args: { name: "chrome" }, say: "Opening Chrome." },
      { tool: "gmail_send", args: { to: "sam@example.com" }, say: "Sending." },
    ],
  }));
  assert.equal(steps?.[0].kind, "app");
  assert.equal(steps?.[1].kind, "destructive");
});
