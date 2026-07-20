// Voice Service — TTS pipeline for live voice chat.
//
// Separate from services/tts.ts (different timeout/error surface for the live
// path), but BOTH now resolve the voice per call from voice-registry.ts, so
// live voice and /api/tts always speak with the same active persona —
// JARVIS (Daniel) or FRIDAY (Rachel), switchable via the switch_voice tool.
// ELEVENLABS_VOICE_ID env still wins globally if set (legacy override).
//
// Reuses tts.ts's `stripForTTS` so markdown / URLs / paths never get spoken.

import { stripForTTS } from "./tts.js";
import { getActiveVoice } from "./voice-registry.js";

const MODEL_ID = "eleven_flash_v2_5"; // ~75ms TTFB — matches existing tts.ts choice
const STREAM_LATENCY = 4;             // most aggressive ElevenLabs streaming preset
const API_BASE = "https://api.elevenlabs.io/v1";
const SYNTH_TIMEOUT_MS = 15_000;
const MAX_TEXT_LEN = 5_000;

interface SynthOptions {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

const DEFAULT_OPTIONS: Required<SynthOptions> = {
  stability: 0.5,
  similarityBoost: 0.8,
  style: 0.0,
  useSpeakerBoost: true,
};

export function isVoiceSynthAvailable(): boolean {
  const key = process.env.ELEVENLABS_API_KEY;
  return !!key && key.length > 0;
}

/**
 * Synthesize a complete utterance to MP3 bytes using the active persona voice.
 * Returns null if the key is missing, the text strips to nothing,
 * or ElevenLabs errors out — caller decides whether to fall back.
 */
export async function synthesizeUtterance(
  text: string,
  options: SynthOptions = {}
): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const cleaned = stripForTTS(text);
  if (!cleaned || cleaned.length < 2) return null;

  const truncated = cleaned.length > MAX_TEXT_LEN ? cleaned.slice(0, MAX_TEXT_LEN) + "..." : cleaned;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { voiceId } = getActiveVoice(); // resolved per call — switchable at runtime

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNTH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_BASE}/text-to-speech/${voiceId}/stream?optimize_streaming_latency=${STREAM_LATENCY}&output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: truncated,
          model_id: MODEL_ID,
          voice_settings: {
            stability: opts.stability,
            similarity_boost: opts.similarityBoost,
            style: opts.style,
            use_speaker_boost: opts.useSpeakerBoost,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "<unreadable>");
      console.error(`[VoiceService] ElevenLabs ${response.status}: ${errorText.slice(0, 200)}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[VoiceService] synth failed: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
