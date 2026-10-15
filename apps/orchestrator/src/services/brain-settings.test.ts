import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { FRIDAY_SYSTEM_PROMPT } from "../config/index.js";
import { readBrainProvider, writeBrainProvider } from "./brain-settings.js";
import { resolveLlmChain } from "./llm-chain.js";

test("a saved provider overrides the environment and is not stored in .env", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "friday-settings-")), "settings.json");
  assert.equal(readBrainProvider(file), null);
  writeBrainProvider("xai", file);
  assert.equal(readBrainProvider(file), "xai");
  assert.equal(file.endsWith(".env"), false);

  const chain = resolveLlmChain(
    { OPENAI_API_KEY: "sk", XAI_API_KEY: "xai", GEMINI_API_KEY: "gem", FRIDAY_LLM_PROVIDER: "openai" },
    { settingsFile: file }
  );
  assert.deepEqual(chain.endpoints.map((item) => item.id), ["xai", "openai", "gemini"]);
  assert.equal(chain.preferred, "xai");
});

test("the prompt names Codex and the brain switch, and not Claude Code", () => {
  assert.match(FRIDAY_SYSTEM_PROMPT, /route_agent_task/);
  assert.match(FRIDAY_SYSTEM_PROMPT, /set_brain_provider/);
  assert.match(FRIDAY_SYSTEM_PROMPT, /xai-grok/);
  assert.doesNotMatch(FRIDAY_SYSTEM_PROMPT, /delegate_to_claude_code/);
  assert.doesNotMatch(FRIDAY_SYSTEM_PROMPT, /Claude Code/);
});
