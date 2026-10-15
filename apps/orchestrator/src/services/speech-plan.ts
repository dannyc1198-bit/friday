// Which TTS backend speaks. Credentials stay in env; a missing ElevenLabs key
// never throws — auto mode falls through to the free Edge neural voice.

export type SpeechProviderName = "elevenlabs" | "edge";

export interface SpeechPlan {
  /** First provider to try. */
  provider: SpeechProviderName;
  /** When ElevenLabs is selected but the request fails, try Edge. */
  fallbackEdge: boolean;
  edgeVoice: string;
  elevenLabsConfigured: boolean;
}

const DEFAULT_EDGE_VOICE = "en-GB-RyanNeural";

/**
 * TTS_PROVIDER=auto|elevenlabs|edge.
 * auto (default): ElevenLabs when ELEVENLABS_API_KEY is set, otherwise Edge.
 * elevenlabs without a key degrades to Edge instead of crashing.
 */
export function resolveSpeechPlan(
  env: NodeJS.ProcessEnv = process.env,
  personaEdgeVoice?: string
): SpeechPlan {
  const mode = (env.TTS_PROVIDER || "auto").trim().toLowerCase();
  const hasKey = Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_API_KEY.trim());
  const edgeVoice =
    (env.EDGE_TTS_VOICE || personaEdgeVoice || DEFAULT_EDGE_VOICE).trim() || DEFAULT_EDGE_VOICE;

  if (mode === "edge" || mode === "windows") {
    return { provider: "edge", fallbackEdge: false, edgeVoice, elevenLabsConfigured: hasKey };
  }
  if (mode === "elevenlabs") {
    if (!hasKey) {
      return { provider: "edge", fallbackEdge: false, edgeVoice, elevenLabsConfigured: false };
    }
    return { provider: "elevenlabs", fallbackEdge: true, edgeVoice, elevenLabsConfigured: true };
  }
  if (hasKey) {
    return { provider: "elevenlabs", fallbackEdge: true, edgeVoice, elevenLabsConfigured: true };
  }
  return { provider: "edge", fallbackEdge: false, edgeVoice, elevenLabsConfigured: false };
}

export function isServerTtsAvailable(plan: SpeechPlan = resolveSpeechPlan()): boolean {
  return plan.provider === "elevenlabs" || plan.provider === "edge";
}
