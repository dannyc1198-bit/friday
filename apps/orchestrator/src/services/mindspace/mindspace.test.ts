import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { resetMindspaceActivity, mindspaceSnapshot } from "./activity.js";
import { readSpecialistMemory } from "./memory.js";
import { answerMindspace, type MindspaceDeps } from "./run.js";
import {
  addressed,
  clampToolCall,
  guardSpecialistText,
  parseClassifierReply,
  routeMindspace,
  shouldClassify,
  toolAllowed,
} from "./route.js";
import { specialistById, SPECIALISTS } from "./specialists.js";

test("a spoken name routes to that specialist and a bare you does not", () => {
  assert.equal(routeMindspace("Jarvis, are the keys healthy?").specialists[0], "jarvis");
  assert.equal(routeMindspace("Hey Edith draft a tiktok hook").specialists[0], "edith");
  assert.equal(routeMindspace("U, draft the Ally follow-up").specialists[0], "u");
  assert.equal(routeMindspace("hey you there").mode, "friday");
  assert.equal(addressed("the jarvis dashboard is down", specialistById("jarvis")!), false);
});

test("ask the team fans out and ultron stays last", () => {
  const team = routeMindspace("ask the team about the Kelowna move");
  assert.equal(team.mode, "team");
  assert.deepEqual(team.specialists, ["jarvis", "edith", "dume", "u", "vision", "ultron"]);
});

test("domain phrases pick one specialist without a model", () => {
  assert.equal(routeMindspace("plan my day around the refinery shift").specialists[0], "vision");
  assert.equal(routeMindspace("poke holes in this trade").specialists[0], "ultron");
  assert.equal(shouldClassify("hi"), false);
  assert.equal(shouldClassify("what should we do about the unpaid invoice sitting on the desk"), true);
});

test("the cheap classifier reply is one route token", () => {
  assert.equal(parseClassifierReply('{"route":"dume"}'), "dume");
  assert.equal(parseClassifierReply("team"), "team");
  assert.equal(parseClassifierReply("no idea"), null);
});

test("ultron cannot call an action tool and jarvis cannot pay", () => {
  const ultron = specialistById("ultron")!;
  const jarvis = specialistById("jarvis")!;
  assert.equal(toolAllowed(ultron, "route_agent_task"), false);
  assert.equal(toolAllowed(ultron, "brain_recall"), true);
  assert.equal(toolAllowed(jarvis, "vault_get"), false);
  const paid = clampToolCall(jarvis, "task_add", { text: "pay the hydro bill today" });
  assert.equal(paid.ok, false);
  assert.match(guardSpecialistText("jarvis", "I paid the invoice."), /does not pay/);
  assert.match(guardSpecialistText("u", "This machine cures cancer and guarantees income."), /removed health and income/);
  assert.match(guardSpecialistText("ultron", "The plan leaks the key."), /adversarial/);
});

test("a specialist answer is framed by Friday and remembered in its own folder", async () => {
  resetMindspaceActivity();
  const root = mkdtempSync(path.join(tmpdir(), "mindspace-"));
  const deps: MindspaceDeps = {
    complete: async () => ({ text: "Keys are locked. Nothing was paid.", toolCalls: [] }),
    executeTool: async () => { throw new Error("no tool"); },
    memoryRoot: root,
    now: () => new Date("2026-10-16T12:00:00Z"),
  };
  const answer = await answerMindspace("Jarvis, are the keys healthy?", { deps });
  assert.ok(answer);
  assert.match(answer!.text, /J\.A\.R\.V\.I\.S\./);
  assert.match(answer!.text, /Nothing was sent, spent, or traded/);
  assert.equal(answer!.voice?.edge, "en-GB-ThomasNeural");
  assert.match(readSpecialistMemory(path.join(root, "jarvis")), /Keys are locked/);
  assert.equal(mindspaceSnapshot().specialists.find((card) => card.id === "jarvis")?.status, "done");
});

test("ultron's action call is refused before the tool runs", async () => {
  const calls: string[] = [];
  let step = 0;
  const deps: MindspaceDeps = {
    complete: async () => {
      step += 1;
      if (step === 1) {
        return { text: "", toolCalls: [{ id: "1", name: "route_agent_task", arguments: "{\"task\":\"wire the money\"}" }] };
      }
      return { text: "The transfer is a bad idea.", toolCalls: [] };
    },
    executeTool: async (name) => {
      calls.push(name);
      return { success: true, data: {} };
    },
    memoryRoot: mkdtempSync(path.join(tmpdir(), "mindspace-")),
  };
  const answer = await answerMindspace("Ultron, review this plan", { deps });
  assert.deepEqual(calls, []);
  assert.match(answer!.text, /adversarial/);
});

test("every specialist has a distinct edge voice", () => {
  const voices = SPECIALISTS.map((spec) => spec.voice.edge);
  assert.equal(new Set(voices).size, voices.length);
});
