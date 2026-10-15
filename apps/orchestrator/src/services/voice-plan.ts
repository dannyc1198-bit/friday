// Which live engine the Talk tab should start.
// ElevenLabs Agents when an agent id is set.
// OpenAI Realtime is the next try.
// If that cannot speak, hands-free uses ElevenLabs TTS, then the Edge voice.
// The plan returns one status line.

import { DANIEL_VOICE_ID } from "./elevenlabs-agent.js";
import { resolveModelRoles } from "./model-roles.js";

export type LiveVoiceMode = "elevenlabs" | "realtime" | "speak";

export interface LiveVoicePlan {
  mode: LiveVoiceMode;
  agentId: string;
  voiceId: string;
  realtimeModel: string;
  realtimeVoice: string;
  hasElevenKey: boolean;
  hasOpenAI: boolean;
  builtinLlm: string;
  note: string;
}

function speakNote(hasElevenKey: boolean): string {
  return hasElevenKey
    ? "ElevenLabs voice is speaking every reply, then Edge."
    : "The Edge voice is speaking every reply.";
}

export function selectLiveVoice(env: NodeJS.ProcessEnv = process.env): LiveVoicePlan {
  const requested = (env.FRIDAY_VOICE_MODE || "elevenlabs").trim().toLowerCase();
  const agentId = (env.ELEVENLABS_AGENT_ID || env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "").trim();
  const voiceId = (env.ELEVENLABS_VOICE_ID || env.FRIDAY_VOICE_ID_JARVIS || DANIEL_VOICE_ID).trim();
  const realtimeModel = resolveModelRoles(env).realtime;
  const realtimeVoice = (env.FRIDAY_REALTIME_VOICE || "cedar").trim();
  const hasElevenKey = Boolean(env.ELEVENLABS_API_KEY?.trim());
  const hasOpenAI = Boolean(env.OPENAI_API_KEY?.trim());
  const llm = (env.ELEVENLABS_AGENT_LLM || "").trim();
  const builtinLlm = llm && llm !== "custom-llm" ? llm : "";
  const hasAgent = Boolean(hasElevenKey && agentId);
  const base = { agentId, voiceId, realtimeModel, realtimeVoice, hasElevenKey, hasOpenAI, builtinLlm };

  if (requested === "speak" || requested === "browser") {
    return { ...base, mode: "speak", note: speakNote(hasElevenKey) };
  }
  if (requested === "realtime") {
    if (hasOpenAI) {
      return { ...base, mode: "realtime", note: "Trying OpenAI Realtime." };
    }
    return { ...base, mode: "speak", note: speakNote(hasElevenKey) };
  }
  if (hasAgent) {
    const brain = builtinLlm
      ? `ElevenLabs agent on its built-in model (${builtinLlm}). No public URL.`
      : "ElevenLabs Agents. Scribe v2 Realtime listens. eleven_v3_conversational speaks, with barge-in.";
    return { ...base, mode: "elevenlabs", note: brain };
  }
  if (hasOpenAI) {
    return { ...base, mode: "realtime", note: "No ElevenLabs agent. Trying OpenAI Realtime." };
  }
  return { ...base, mode: "speak", note: speakNote(hasElevenKey) };
}
