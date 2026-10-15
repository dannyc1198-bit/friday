// ElevenAgents config for the Flight Deck.
// Checked against the agent update docs (elevenlabs.io/docs, 2026-10-15):
// - TTS model eleven_v3_conversational, expressive_mode default true on v3
// - ASR provider scribe_realtime is the Agents name for Scribe v2 Realtime
//   (changelog 2026-06-08: default moved off the deprecated elevenlabs provider)
// - turn_model turn_v3 is the built-in turn-taking / barge-in stack
// - Custom LLM is an OpenAI chat-completions URL, llm value custom-llm

export const CONVERSATIONAL_TTS_MODEL = "eleven_v3_conversational";
export const SCRIBE_V2_REALTIME_PROVIDER = "scribe_realtime";
export const DANIEL_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";

const BUTLER_PROMPT = [
  "You are Friday, Daniel's assistant.",
  "Speak as a refined British butler: calm, brief, and concrete.",
  "The custom model is Friday's own brain. Use its tools and its memory.",
  "Never send a message, spend money, or place a live trade. Those stay drafts.",
].join(" ");

export function buildElevenLabsAgentPatch(input: {
  voiceId: string;
  customLlmUrl: string;
  secretId?: string;
  modelId?: string;
}): Record<string, unknown> {
  const customLlm: Record<string, unknown> = {
    url: input.customLlmUrl,
    model_id: input.modelId || "friday",
    api_type: "chat_completions",
  };
  if (input.secretId) customLlm.api_key = { secret_id: input.secretId };

  return {
    conversation_config: {
      asr: {
        quality: "high",
        provider: SCRIBE_V2_REALTIME_PROVIDER,
      },
      turn: {
        turn_eagerness: "normal",
        turn_model: "turn_v3",
      },
      tts: {
        model_id: CONVERSATIONAL_TTS_MODEL,
        voice_id: input.voiceId,
        expressive_mode: true,
      },
      conversation: {
        text_only: false,
        client_events: [
          "user_transcript",
          "agent_response",
          "agent_response_correction",
          "interruption",
          "agent_chat_response_part",
        ],
      },
      agent: {
        first_message: "",
        language: "en",
        prompt: {
          prompt: BUTLER_PROMPT,
          llm: "custom-llm",
          custom_llm: customLlm,
        },
      },
    },
  };
}
