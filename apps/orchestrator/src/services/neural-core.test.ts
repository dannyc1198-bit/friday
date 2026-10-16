import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { profileMentioned } from "./profile.js";
import { publishThought, recentThoughts, subscribeThoughts } from "./thought-bus.js";
import {
  THINKING_MAX_PER_DAY,
  applyThinkingOutput,
  decideThinking,
  parseThinkingJson,
  runThinkingPass,
  type ThinkingState,
} from "./thinking-loop.js";
import { localDateKey } from "./runtime-paths.js";

const off: ThinkingState = {
  enabled: false,
  lastRunAt: null,
  runsOnDate: null,
  runsToday: 0,
  lastReason: "",
  lastError: null,
};

test("the pinned profile is noticed without replacing vault ranking", () => {
  const profile = "Danny runs Wavelength Solutions and Ally Wellness Group. Drafts only.";
  assert.equal(profileMentioned("Tell me about Wavelength Solutions", profile), true);
  assert.equal(profileMentioned("open the garage", profile), false);
});

test("thought events reach a subscriber once", () => {
  const seen: string[] = [];
  const stop = subscribeThoughts((event) => {
    if (event.source === "vault-test" || event.source === "chat-test") seen.push(event.detail);
  });
  const first = publishThought({
    kind: "recall",
    label: "wavelength",
    detail: "FRIDAY_BRAIN/entities/wavelength.md",
    source: "vault-test",
  });
  publishThought({
    kind: "recall",
    label: "wavelength",
    detail: "FRIDAY_BRAIN/entities/wavelength.md",
    source: "vault-test",
  });
  const tool = publishThought({ kind: "tool", label: "brain_recall", detail: "wavelength", source: "chat-test" });
  stop();
  assert.ok(first);
  assert.ok(tool);
  assert.deepEqual(seen, ["FRIDAY_BRAIN/entities/wavelength.md", "wavelength"]);
  assert.equal(
    recentThoughts(80).filter((event) => event.source === "vault-test" && event.detail === "FRIDAY_BRAIN/entities/wavelength.md").length,
    1
  );
});

test("thinking stays off, rate-limited, and proposal-only", async () => {
  const now = new Date(2026, 9, 15, 12, 0, 0);
  assert.equal(decideThinking(now, off).run, false);
  assert.match(decideThinking(now, off).reason, /off/);

  const armed: ThinkingState = { ...off, enabled: true };
  assert.equal(decideThinking(now, armed).run, true);
  assert.equal(
    decideThinking(now, { ...armed, lastRunAt: new Date(now.getTime() - 10 * 60_000).toISOString(), runsOnDate: localDateKey(now), runsToday: 1 }).run,
    false
  );
  assert.equal(
    decideThinking(now, { ...armed, lastRunAt: new Date(now.getTime() - 31 * 60_000).toISOString(), runsOnDate: localDateKey(now), runsToday: 1 }).run,
    true
  );
  assert.equal(
    decideThinking(now, { ...armed, runsOnDate: localDateKey(now), runsToday: THINKING_MAX_PER_DAY }).run,
    false
  );
  assert.equal(
    decideThinking(now, { ...armed, runsOnDate: "2020-01-01", runsToday: THINKING_MAX_PER_DAY }).run,
    true
  );

  const dir = mkdtempSync(path.join(os.tmpdir(), "friday-insights-"));
  try {
    const applied = applyThinkingOutput(
      {
        insights: ["send the invoice email tomorrow", "Danny prefers short spoken answers in the lab."],
        profile_proposals: ["wire money to the vendor", "Business: Wavelength Solutions"],
      },
      dir,
      now
    );
    assert.deepEqual(applied.insights, ["Danny prefers short spoken answers in the lab."]);
    assert.deepEqual(applied.proposals, ["Business: Wavelength Solutions"]);
    assert.equal(applied.dropped, 2);
    assert.equal(existsSync(path.join(dir, "DANNY-PROFILE.md")), false);
    const proposal = readFileSync(path.join(dir, "proposals", "DANNY-PROFILE.md"), "utf8");
    assert.match(proposal, /Wavelength Solutions/);
    assert.match(proposal, /has been copied into DANNY-PROFILE/);
    const insight = readFileSync(path.join(dir, "insights", `${localDateKey(now)}.md`), "utf8");
    assert.match(insight, /short spoken answers/);
    assert.doesNotMatch(insight, /invoice email/);

    let calls = 0;
    const pass = await runThinkingPass({
      now,
      state: armed,
      brainDir: dir,
      gather: async () => ({
        chats: "Danny: Remember that the lab bench stays clear after every session so Friday can find the tools.",
        vaultNotes: ["FRIDAY_BRAIN/entities/wavelength.md"],
      }),
      complete: async () =>
        "```json\n" +
        JSON.stringify({
          insights: ["The lab bench should stay clear."],
          profile_proposals: ["Name: Danny"],
        }) +
        "\n```",
    });
    calls += 1;
    assert.equal(pass.ran, true);
    assert.equal(pass.state.runsToday, 1);
    assert.equal(existsSync(path.join(dir, "DANNY-PROFILE.md")), false);
    assert.match(readFileSync(path.join(dir, "proposals", "DANNY-PROFILE.md"), "utf8"), /Name: Danny/);

    const second = await runThinkingPass({
      now,
      state: pass.state,
      brainDir: dir,
      gather: async () => ({ chats: "x".repeat(100), vaultNotes: [] }),
      complete: async () => {
        calls += 1;
        return "{}";
      },
    });
    assert.equal(second.ran, false);
    assert.match(second.reason, /Cooling down/);
    assert.equal(calls, 1);

    const parsed = parseThinkingJson('```json\n{"insights":["A"],"profile_proposals":[]}\n```');
    assert.deepEqual(parsed.insights, ["A"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
