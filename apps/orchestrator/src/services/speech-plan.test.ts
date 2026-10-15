import test from "node:test";
import assert from "node:assert/strict";
import { resolveSpeechPlan } from "./speech-plan.js";
import { buildJarvisSsml, escapeSsml } from "./edge-tts.js";

test("auto mode uses ElevenLabs only when a key is present", () => {
  const withKey = resolveSpeechPlan({ TTS_PROVIDER: "auto", ELEVENLABS_API_KEY: "sk-test" });
  assert.equal(withKey.provider, "elevenlabs");
  assert.equal(withKey.fallbackEdge, true);
  assert.equal(withKey.elevenLabsConfigured, true);

  const noKey = resolveSpeechPlan({ TTS_PROVIDER: "auto" });
  assert.equal(noKey.provider, "edge");
  assert.equal(noKey.elevenLabsConfigured, false);
  assert.equal(noKey.edgeVoice, "en-GB-RyanNeural");
});

test("elevenlabs mode without a key degrades to Edge instead of failing", () => {
  const plan = resolveSpeechPlan({ TTS_PROVIDER: "elevenlabs", EDGE_TTS_VOICE: "en-GB-ThomasNeural" });
  assert.equal(plan.provider, "edge");
  assert.equal(plan.edgeVoice, "en-GB-ThomasNeural");
});

test("JARVIS SSML is escaped and uses a calm British prosody", () => {
  const ssml = buildJarvisSsml(`At your service, <boss> & "sir".`, "en-GB-RyanNeural");
  assert.match(ssml, /en-GB-RyanNeural/);
  assert.match(ssml, /rate="-8%"/);
  assert.match(ssml, /pitch="-6%"/);
  assert.equal(escapeSsml(`<>&"'`), "&lt;&gt;&amp;&quot;&apos;");
  assert.doesNotMatch(ssml, /<boss>/);
});
