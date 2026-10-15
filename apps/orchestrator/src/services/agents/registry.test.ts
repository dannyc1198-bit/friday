import test from "node:test";
import assert from "node:assert/strict";
import { createAgentService } from "./registry.js";
import { parseGrokBots } from "./grok-bots.js";
import type { CommandResult } from "./types.js";

const missing: CommandResult = { code: null, stdout: "", stderr: "", error: "spawn codex ENOENT" };

test("parseGrokBots ignores blank input and non-http URLs", () => {
  assert.deepEqual(parseGrokBots(""), []);
  assert.deepEqual(parseGrokBots("  "), []);
  const bots = parseGrokBots("NEXUS|http://127.0.0.1:7777/health|http://127.0.0.1:7777/dispatch, BUILDER|file:///tmp/x, CREATOR");
  assert.equal(bots.length, 3);
  assert.equal(bots[0].statusUrl, "http://127.0.0.1:7777/health");
  assert.equal(bots[0].dispatchUrl, "http://127.0.0.1:7777/dispatch");
  assert.equal(bots[1].statusUrl, undefined);
  assert.equal(bots[2].name, "CREATOR");
});

test("missing credentials and binaries are offline and do not throw", async () => {
  const service = createAgentService({
    env: {},
    fetchImpl: (async () => {
      throw new Error("network should not be called");
    }) as typeof fetch,
    run: async () => missing,
  });

  const agents = await service.list();
  const byId = Object.fromEntries(agents.map((agent) => [agent.id, agent]));
  assert.equal(byId["grok-bot"].state, "offline");
  assert.equal(byId["grok-bot"].render, "dot");
  assert.equal(byId["codex"].state, "offline");
  assert.equal(byId["claude-code"].state, "offline");
  assert.equal(byId["xai-grok"].state, "offline");
  assert.equal(byId["xai-grok"].detail.includes("XAI_API_KEY"), true);

  const dispatched = await service.dispatch("xai-grok", "summarise the vault");
  assert.equal(dispatched.ok, false);
  assert.match(dispatched.summary, /XAI_API_KEY/);

  const unknown = await service.dispatch("nope", "hello");
  assert.equal(unknown.ok, false);
});

test("grok bot dots follow the status URL and xAI stays offline without a key", async () => {
  const calls: string[] = [];
  const service = createAgentService({
    env: {
      GROK_BOTS: "NEXUS|http://127.0.0.1:9/health|http://127.0.0.1:9/dispatch",
      XAI_API_KEY: "",
    },
    fetchImpl: (async (url: string | URL) => {
      calls.push(String(url));
      return new Response("ok", { status: 200 });
    }) as typeof fetch,
    run: async () => missing,
  });

  const agents = await service.list();
  const nexus = agents.find((agent) => agent.name === "NEXUS");
  assert.ok(nexus);
  assert.equal(nexus?.render, "dot");
  assert.equal(nexus?.state, "online");
  assert.equal(nexus?.canDispatch, true);
  assert.deepEqual(calls, ["http://127.0.0.1:9/health"]);

  const sent = await service.dispatch("grok-bot:nexus", "check the lights");
  assert.equal(sent.ok, true);
  assert.equal(calls[1], "http://127.0.0.1:9/dispatch");
});

test("codex dispatch is refused outside the allowed roots", async () => {
  const service = createAgentService({
    env: { FRIDAY_ALLOWED_CODE_ROOTS: "/tmp/friday-allowed" },
    run: async () => ({ code: 0, stdout: "should not run", stderr: "" }),
  });
  const result = await service.dispatch("codex", "edit the repo", { workingDirectory: "/etc" });
  assert.equal(result.ok, false);
  assert.match(result.summary, /FRIDAY_ALLOWED_CODE_ROOTS/);
});
