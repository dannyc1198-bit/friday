import test from "node:test";
import assert from "node:assert/strict";
import { resolveLlmChain, shouldFailover, xaiBaseUrl } from "./llm-chain.js";
import { buildElevenLabsAgentPatch, CONVERSATIONAL_TTS_MODEL, SCRIBE_V2_REALTIME_PROVIDER } from "./elevenlabs-agent.js";
import { selectLiveVoice } from "./voice-plan.js";
import { realtimeClientSecretBody } from "../routes/live-voice.js";
import { noticesFromRealtimeEvent } from "./realtime-events.js";

test("the default brain is OpenAI with an xAI fallback, and a 400 stays put", () => {
  const chain = resolveLlmChain({ OPENAI_API_KEY: "sk-test", XAI_API_KEY: "xai-test" });
  assert.equal(chain.primary.id, "openai");
  assert.equal(chain.primary.model, "gpt-6-astra");
  assert.equal(chain.fallback?.id, "xai");
  assert.equal(chain.fallback?.model, "grok-4.7");
  assert.equal(chain.fallback?.baseURL, "https://api.x.ai/v1");
  assert.equal(shouldFailover(400, "invalid json"), false);
  assert.equal(shouldFailover(422, "bad request"), false);
  assert.equal(shouldFailover(429, "insufficient_quota"), true);
  assert.equal(shouldFailover(503, "unavailable"), true);
  assert.equal(shouldFailover(undefined, "bad request 400"), false);

  const gemini = resolveLlmChain({ FRIDAY_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "gem" });
  assert.equal(gemini.primary.id, "gemini");
  assert.equal(gemini.fallback, null);
  assert.equal(xaiBaseUrl({ XAI_BASE_URL: "https://api.x.ai/v1/chat/completions" }), "https://api.x.ai/v1");
});

test("the ElevenLabs agent patch keeps Friday's brain and does not embed a key", () => {
  const patch = buildElevenLabsAgentPatch({
    voiceId: "onwK4e9ZLuTAKqWW03F9",
    customLlmUrl: "https://friday.example/v1/chat/completions",
    secretId: "secret_123",
  }) as {
    conversation_config: {
      asr: { provider: string };
      tts: { model_id: string; expressive_mode: boolean; voice_id: string };
      conversation: { text_only: boolean };
      agent: { prompt: { llm: string; custom_llm: { url: string; api_key: { secret_id: string } } } };
    };
  };
  const config = patch.conversation_config;
  assert.equal(config.tts.model_id, CONVERSATIONAL_TTS_MODEL);
  assert.equal(config.tts.expressive_mode, true);
  assert.equal(config.asr.provider, SCRIBE_V2_REALTIME_PROVIDER);
  assert.equal(config.conversation.text_only, false);
  assert.equal(config.agent.prompt.llm, "custom-llm");
  assert.equal(config.agent.prompt.custom_llm.url, "https://friday.example/v1/chat/completions");
  assert.equal(config.agent.prompt.custom_llm.api_key.secret_id, "secret_123");
  assert.equal(JSON.stringify(patch).includes("sk-"), false);
});

test("live voice prefers ElevenLabs and falls back to realtime, then the browser", () => {
  const eleven = selectLiveVoice({
    ELEVENLABS_API_KEY: "el",
    ELEVENLABS_AGENT_ID: "agent_1",
    OPENAI_API_KEY: "sk",
  });
  assert.equal(eleven.mode, "elevenlabs");
  assert.match(eleven.note, /Scribe v2 Realtime/);

  const realtime = selectLiveVoice({ FRIDAY_VOICE_MODE: "realtime", OPENAI_API_KEY: "sk" });
  assert.equal(realtime.mode, "realtime");
  assert.equal(realtime.realtimeModel, "gpt-realtime");
  assert.equal(realtime.realtimeVoice, "cedar");

  const browser = selectLiveVoice({});
  assert.equal(browser.mode, "browser");
  assert.match(browser.note, /speaks/);
});

test("realtime notices keep the transcript and the tool call, and the session asks for speech", () => {
  const user = noticesFromRealtimeEvent({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "What's the next task?",
  });
  assert.equal(user[0]?.kind, "user");
  const agent = noticesFromRealtimeEvent({
    type: "response.output_audio_transcript.done",
    transcript: "One task, boss.",
  });
  assert.equal(agent[0]?.kind, "agent");
  const tool = noticesFromRealtimeEvent({
    type: "response.function_call_arguments.done",
    name: "brain_recall",
    call_id: "call_1",
    arguments: "{\"query\":\"task\"}",
  });
  assert.equal(tool[0]?.name, "brain_recall");
  const body = realtimeClientSecretBody({
    model: "gpt-realtime",
    voice: "cedar",
    tools: [],
  }) as { session: { type: string; model: string; audio: { output: { voice: string } } } };
  assert.equal(body.session.type, "realtime");
  assert.equal(body.session.model, "gpt-realtime");
  assert.equal(body.session.audio.output.voice, "cedar");
});
