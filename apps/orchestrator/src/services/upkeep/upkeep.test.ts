import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  canMergeInto,
  fixTaskPrompt,
  isFixBranch,
  isSecretPath,
  rateLimitDecision,
  repairBranchName,
} from "./guards.js";
import { noteIncident, shouldDiagnose } from "./journal.js";
import { createRepairService, type GitOps } from "./repairs.js";
import { healthCommands } from "./health-check.js";
import { extractLearnings, proposeProfileChange } from "../learning-writeback.js";
import { summarizeChecks } from "./health-check.js";

test("secrets, main, and the daily repair cap are refused", () => {
  assert.equal(isSecretPath("apps/orchestrator/.env"), true);
  assert.equal(isSecretPath("apps/orchestrator/.env.example"), true);
  assert.equal(isSecretPath("src/services/brain.ts"), false);
  assert.equal(canMergeInto("main").ok, false);
  assert.equal(canMergeInto("master").ok, false);
  assert.equal(canMergeInto("cursor/friday-hud").ok, true);
  assert.equal(rateLimitDecision({ attemptsToday: 3, inFlight: 0 }).ok, false);
  assert.equal(rateLimitDecision({ attemptsToday: 0, inFlight: 1 }).ok, false);
  assert.equal(rateLimitDecision({ attemptsToday: 1, inFlight: 0 }).ok, true);
  const branch = repairBranchName("Brain recall 400");
  assert.equal(isFixBranch(branch), true);
  assert.equal(isFixBranch("main"), false);
  assert.match(fixTaskPrompt(branch, "boom"), /Do not read, edit, or create \.env/);
  assert.match(fixTaskPrompt(branch, "boom"), /Do not checkout, push, merge/);
});

test("the third identical failure is the diagnosis point", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "friday-health-"));
  const first = noteIncident(dir, { kind: "tool", signature: "brain_recall", summary: "400" });
  const second = noteIncident(dir, { kind: "tool", signature: "brain_recall", summary: "400" });
  const third = noteIncident(dir, { kind: "tool", signature: "brain_recall", summary: "400" });
  assert.equal(shouldDiagnose(first.count), false);
  assert.equal(shouldDiagnose(second.count), false);
  assert.equal(shouldDiagnose(third.count), true);
  assert.match(readFileSync(third.file, "utf8"), /sig:brain_recall/);
});

test("profile changes are proposed and the profile file stays untouched", () => {
  const brain = mkdtempSync(path.join(tmpdir(), "friday-brain-"));
  const profile = path.join(brain, "DANNY-PROFILE.md");
  const learned = extractLearnings("My business is Wavelength Solutions, websites and receptionists.");
  assert.equal(learned[0]?.profile, true);
  proposeProfileChange(learned[0].observation, brain);
  assert.equal(existsSync(profile), false);
  const proposal = readFileSync(path.join(brain, "proposals", "DANNY-PROFILE.md"), "utf8");
  assert.match(proposal, /Wavelength Solutions/);
  assert.match(proposal, /has been copied into DANNY-PROFILE/);
});

test("a repair cannot push or merge until approval, and a bad health check rolls back", async () => {
  const store = path.join(mkdtempSync(path.join(tmpdir(), "friday-repairs-")), "repairs.json");
  const git = fakeGit();
  const service = createRepairService({
    storeFile: store,
    git,
    listAgents: async () => [{ id: "codex", canDispatch: true }],
    dispatch: async () => ({ ok: true, summary: "edited brain.ts" }),
    runTests: async () => ({ ok: true, summary: "tests passed" }),
    runHealth: async () => ({ ok: false, summary: "health endpoint failed" }),
  });

  const repair = await service.start("brain recall returns 400");
  assert.equal(repair.status, "needs_approval");
  assert.deepEqual(git.calls.filter((call) => call === "push" || call === "merge"), []);

  const merged = await service.approve(repair.id);
  assert.equal(merged.status, "rolled_back");
  assert.match(merged.detail, /was not reset/);
  assert.ok(git.calls.includes("push"));
  assert.ok(git.calls.includes("worktree-add"));
  assert.ok(git.calls.includes("merge-in"));
  assert.ok(git.calls.includes("worktree-remove"));
  assert.equal(git.calls.includes("merge"), false);
  assert.equal(git.calls.includes("reset"), false);
});

test("a base branch that moves during health is left unmerged", async () => {
  const git = fakeGit();
  let heads = 0;
  git.headSha = async () => {
    heads += 1;
    return heads >= 3 ? "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" : "abc1234def5678";
  };
  const service = createRepairService({
    storeFile: path.join(mkdtempSync(path.join(tmpdir(), "friday-repairs-")), "moved.json"),
    git,
    listAgents: async () => [{ id: "codex", canDispatch: true }],
    dispatch: async () => ({ ok: true, summary: "edited brain.ts" }),
    runTests: async () => ({ ok: true, summary: "tests passed" }),
    runHealth: async () => ({ ok: true, summary: "ok" }),
  });
  const repair = await service.start("brain recall returns 400");
  const result = await service.approve(repair.id);
  assert.equal(result.status, "failed");
  assert.match(result.detail, /moved/);
  assert.equal(git.calls.includes("merge"), false);
  assert.equal(git.calls.includes("reset"), false);
});

test("approval never merges into main, and a secret diff aborts before commit", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "friday-repairs-"));
  const mainGit = fakeGit("main");
  const mainService = createRepairService({
    storeFile: path.join(dir, "main.json"),
    git: mainGit,
    listAgents: async () => [{ id: "codex", canDispatch: true }],
    dispatch: async () => ({ ok: true, summary: "ok" }),
    runTests: async () => ({ ok: true, summary: "tests passed" }),
    runHealth: async () => ({ ok: true, summary: "ok" }),
  });
  const waiting = await mainService.start("quiet failure");
  const pushed = await mainService.approve(waiting.id);
  assert.equal(pushed.status, "pushed");
  assert.equal(mainGit.calls.includes("merge"), false);
  assert.ok(mainGit.calls.includes("push"));

  const secretGit = fakeGit("cursor/friday", [".env"]);
  const secretService = createRepairService({
    storeFile: path.join(dir, "secret.json"),
    git: secretGit,
    listAgents: async () => [{ id: "codex", canDispatch: true }],
    dispatch: async () => ({ ok: true, summary: "wrote .env" }),
    runTests: async () => ({ ok: true, summary: "should not run" }),
    runHealth: async () => ({ ok: true, summary: "ok" }),
  });
  const stopped = await secretService.start("leaked a key");
  assert.equal(stopped.status, "blocked");
  assert.match(stopped.detail, /\.env/);
  assert.equal(secretGit.calls.includes("commit"), false);
  assert.ok(secretGit.calls.includes("reset"));
});

test("reject leaves the branch unpushed", async () => {
  const git = fakeGit();
  const service = createRepairService({
    storeFile: path.join(mkdtempSync(path.join(tmpdir(), "friday-repairs-")), "repairs.json"),
    git,
    listAgents: async () => [{ id: "codex", canDispatch: true }],
    dispatch: async () => ({ ok: true, summary: "ok" }),
    runTests: async () => ({ ok: true, summary: "tests passed" }),
    runHealth: async () => ({ ok: true, summary: "ok" }),
  });
  const repair = await service.start("flaky tool");
  const rejected = service.reject(repair.id);
  assert.equal(rejected.status, "rejected");
  assert.equal(git.calls.includes("push"), false);
  assert.equal(git.calls.includes("merge"), false);
});

test("a skipped command list still produces an honest summary", async () => {
  const result = await summarizeChecks([]);
  assert.equal(result.ok, true);
  assert.match(result.summary, /FRIDAY_HEALTHCHECK/);
});

test("typecheck and tests stay off until the health flag is set", () => {
  assert.deepEqual(healthCommands({} as NodeJS.ProcessEnv), []);
  assert.equal(healthCommands({ FRIDAY_HEALTHCHECK: "1" } as NodeJS.ProcessEnv).length, 1);
  assert.equal(
    healthCommands({ FRIDAY_HEALTHCHECK: "1", FRIDAY_HEALTHCHECK_TESTS: "1" } as NodeJS.ProcessEnv).length,
    2
  );
});

function fakeGit(branch = "cursor/friday", changed: string[] = ["src/services/brain.ts"]): GitOps & { calls: string[] } {
  const calls: string[] = [];
  const git: GitOps & { calls: string[] } = {
    calls,
    statusPorcelain: async () => "",
    currentBranch: async () => branch,
    headSha: async () => "abc1234def5678",
    checkoutNew: async () => { calls.push("checkout-new"); },
    checkout: async () => { calls.push("checkout"); },
    diffNames: async () => changed,
    commitIfNeeded: async () => { calls.push("commit"); },
    merge: async () => { calls.push("merge"); },
    resetHard: async () => { calls.push("reset"); },
    push: async (name) => {
      calls.push("push");
      if (!name.startsWith("friday/fix-")) throw new Error("pushed the wrong branch");
    },
    isAncestor: async (ancestor, descendant) => ancestor === descendant || ancestor === "abc1234def5678",
    worktreeAdd: async () => {
      calls.push("worktree-add");
      return "/tmp/friday-repair-test";
    },
    worktreeRemove: async () => { calls.push("worktree-remove"); },
    mergeIn: async () => { calls.push("merge-in"); },
    revertMerge: async () => { calls.push("revert"); },
  };
  return git;
}
