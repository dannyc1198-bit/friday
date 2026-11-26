import test from "node:test";
import assert from "node:assert/strict";
import {
  applyApprovedChange,
  createDispatchCodingBackend,
  createOpenAiCompatibleBackend,
  selectCodingBackend,
  voiceBranchName,
} from "./coding.js";

test("auto prefers a local OpenAI-compatible endpoint when a base url is set", () => {
  const choice = selectCodingBackend({ VOICE_CODING_BASE_URL: "http://127.0.0.1:11434/v1" });
  assert.equal(choice.id, "openai-compatible");
  assert.equal(choice.baseUrl, "http://127.0.0.1:11434/v1");
});

test("ollama and lmstudio names pick their local defaults", () => {
  assert.equal(selectCodingBackend({ VOICE_CODING_BACKEND: "ollama" }).baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(selectCodingBackend({ VOICE_CODING_BACKEND: "lmstudio" }).baseUrl, "http://127.0.0.1:1234/v1");
});

test("auto uses codex when no local endpoint is configured", () => {
  assert.equal(selectCodingBackend({}).id, "codex");
});

test("an explicit grok backend wins over a local url", () => {
  const choice = selectCodingBackend({
    VOICE_CODING_BACKEND: "xai-grok",
    VOICE_CODING_BASE_URL: "http://127.0.0.1:11434/v1",
  });
  assert.equal(choice.id, "xai-grok");
});

test("a local backend reads the spoken summary and the diff", async () => {
  const backend = createOpenAiCompatibleBackend({
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local",
    fetchImpl: async (url) => {
      assert.match(String(url), /\/chat\/completions$/);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: "Add a health route.",
          diff: "diff --git a/a.ts b/a.ts\n",
        }) } }],
      }), { status: 200 });
    },
  });
  const proposal = await backend.propose("add a health endpoint");
  assert.equal(proposal.ok, true);
  assert.match(proposal.summary, /health route/i);
  assert.match(proposal.diff, /diff --git/);
});

test("a down local server is offline and does not throw", async () => {
  const backend = createOpenAiCompatibleBackend({
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen",
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  });
  const proposal = await backend.propose("add a health endpoint");
  assert.equal(proposal.ok, false);
  assert.match(proposal.detail, /ECONNREFUSED/);
});

test("HTTP 401 from a coding endpoint is needs key", async () => {
  const backend = createOpenAiCompatibleBackend({
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local",
    fetchImpl: async () => new Response("unauthorized", { status: 401 }),
  });
  const proposal = await backend.propose("add a health endpoint");
  assert.equal(proposal.needsKey, true);
  assert.match(proposal.detail, /needs key/i);
});

test("dispatch backends ask for a plan and do not treat a failure as success", async () => {
  let seen = "";
  const backend = createDispatchCodingBackend("codex", async (task) => {
    seen = task;
    return { ok: false, summary: "needs key — set OPENAI_API_KEY" };
  });
  const proposal = await backend.propose("sort the tasks");
  assert.match(seen, /Do not edit files/);
  assert.match(seen, /Do not push/);
  assert.equal(proposal.ok, false);
  assert.equal(proposal.needsKey, true);
});

test("voice branches are separate from main", () => {
  assert.equal(voiceBranchName("Add a health endpoint!", "1"), "voice/add-a-health-endpoint-1");
  assert.equal(voiceBranchName("...", "abc"), "voice/change-abc");
});

test("apply commits on a voice branch and does not push", async () => {
  const calls: string[] = [];
  const result = await applyApprovedChange({
    currentBranch: async () => "simple-friday",
    checkoutNew: async (branch) => { calls.push(`checkout ${branch}`); },
    applyDiff: async () => { calls.push("apply"); },
    commit: async (message) => { calls.push(`commit ${message}`); },
    push: async () => { calls.push("push"); },
  }, {
    branch: "voice/health-endpoint-1",
    diff: "diff --git a/a.ts b/a.ts\n",
    message: "Voice: add health",
  });
  assert.equal(result.ok, true);
  assert.equal(result.branch, "voice/health-endpoint-1");
  assert.deepEqual(calls, [
    "checkout voice/health-endpoint-1",
    "apply",
    "commit Voice: add health",
  ]);
});

test("apply refuses main and never checks out", async () => {
  let checkout = false;
  const result = await applyApprovedChange({
    currentBranch: async () => "main",
    checkoutNew: async () => { checkout = true; },
    applyDiff: async () => {},
    commit: async () => {},
  }, { branch: "main", diff: "diff --git a/a.ts b/a.ts\n", message: "nope" });
  assert.equal(result.ok, false);
  assert.equal(checkout, false);
  assert.match(result.say, /voice\//i);
});

test("an empty diff is not committed", async () => {
  let commit = false;
  const result = await applyApprovedChange({
    currentBranch: async () => "simple-friday",
    checkoutNew: async () => {},
    applyDiff: async () => {},
    commit: async () => { commit = true; },
  }, { branch: "voice/note-1", diff: "   ", message: "Voice: note" });
  assert.equal(result.ok, false);
  assert.equal(commit, false);
});
