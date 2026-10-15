// Which live engine the Talk tab should start.
// ElevenLabs Agents is the voice. OpenAI Realtime is the fallback.
// The browser voice is the last resort so a live turn is never text-only.

import { DANIEL_VOICE_ID } from "./elevenlabs-agent.js";
import { resolveModelRoles } from "./model-roles.js";

export type LiveVoiceMode = "elevenlabs" | "realtime" | "browser";

export interface LiveVoicePlan {
  mode: LiveVoiceMode;
  agentId: string;
  voiceId: string;
  realtimeModel: string;
  realtimeVoice: string;
  note: string;
}

export function selectLiveVoice(env: NodeJS.ProcessEnv = process.env): LiveVoicePlan {
  const requested = (env.FRIDAY_VOICE_MODE || "elevenlabs").trim().toLowerCase();
  const agentId = (env.ELEVENLABS_AGENT_ID || env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "").trim();
  const voiceId = (env.ELEVENLABS_VOICE_ID || env.FRIDAY_VOICE_ID_JARVIS || DANIEL_VOICE_ID).trim();
  const realtimeModel = resolveModelRoles(env).realtime;
  const realtimeVoice = (env.FRIDAY_REALTIME_VOICE || "cedar").trim();
  const hasAgent = Boolean(env.ELEVENLABS_API_KEY && agentId);
  const hasOpenAI = Boolean(env.OPENAI_API_KEY);
  const base = { agentId, voiceId, realtimeModel, realtimeVoice };

  if (requested === "browser") {
    return { ...base, mode: "browser", note: "Browser voice. Every live reply is spoken." };
  }
  if (requested === "realtime") {
    if (hasOpenAI) {
      return { ...base, mode: "realtime", note: "OpenAI Realtime is the selected voice. ElevenLabs stays available for typed chat." };
    }
    return { ...base, mode: "browser", note: "Realtime was requested. OPENAI_API_KEY is missing, so the browser voice speaks." };
  }
  if (hasAgent) {
    return {
      ...base,
      mode: "elevenlabs",
      note: "ElevenLabs Agents. Scribe v2 Realtime listens. eleven_v3_conversational speaks, with barge-in.",
    };
  }
  if (hasOpenAI) {
    return {
      ...base,
      mode: "realtime",
      note: "ElevenLabs agent is not ready. OpenAI Realtime is speaking instead.",
    };
  }
  return {
    ...base,
    mode: "browser",
    note: "No ElevenLabs agent and no OpenAI key. The browser voice speaks every live reply.",
  };
}
