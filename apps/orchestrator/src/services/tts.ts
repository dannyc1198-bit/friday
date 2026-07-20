/**
 * Text-to-Speech Service — ElevenLabs Integration
 *
 * Voice: resolved per call from services/voice-registry.ts — switchable
 * between JARVIS (Daniel) and FRIDAY (Rachel) via the switch_voice tool.
 * ELEVENLABS_VOICE_ID env still wins globally if set (legacy override).
 * Model: eleven_flash_v2_5
 * Fallback: returns null → frontend uses browser speechSynthesis
 */

import { getActiveVoice } from "./voice-registry.js";
// Flash v2.5 generates audio at ~75ms time-to-first-byte vs eleven_v3's
// ~800ms+. This is the ChatGPT-Advanced-Voice-class model for latency.
// optimize_streaming_latency=4 is the most aggressive streaming preset.
const MODEL_ID = "eleven_flash_v2_5";
const API_BASE = "https://api.elevenlabs.io/v1";
const STREAM_LATENCY = 4;
const TTS_TIMEOUT = 15_000;

interface TTSOptions {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

const DEFAULT_OPTIONS: TTSOptions = {
  stability: 0.5,
  similarityBoost: 0.8,
  style: 0.0,
  useSpeakerBoost: true,
};

/**
 * Strip content that shouldn't be spoken aloud.
 * Removes markdown, URLs, code blocks, file paths, and sensitive data patterns.
 */
export function stripForTTS(text: string): string {
  return text
    // Remove code blocks first (```...```)
    .replace(/```[\s\S]*?```/g, "code block omitted")
    // Remove inline code (`...`)
    .replace(/`[^`]+`/g, "")
    // Remove URLs
    .replace(/https?:\/\/\S+/g, "")
    // Remove file paths (C:\... or /usr/...)
    .replace(/[A-Z]:\\[\w\\.-]+/g, "")
    .replace(/\/[\w/.-]{3,}/g, "")
    // Remove markdown formatting
    .replace(/[*_#>\[\]()]/g, "")
    // Remove emoji shortcodes
    .replace(/:[a-z_]+:/g, "")
    // Strip anything that looks like an API key or secret
    .replace(/\b(sk-|api[-_]?key|token|secret|password|credential)\S+/gi, "sensitive data redacted")
    // Collapse whitespace
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Check if ElevenLabs TTS is available (API key present)
 */
export function isTTSAvailable(): boolean {
  const key = process.env.ELEVENLABS_API_KEY;
  return !!key && key.length > 0;
}

/**
 * Convert text to speech using ElevenLabs API.
 * Returns audio buffer (mp3) or null if unavailable/failed.
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.warn("[TTS] No ELEVENLABS_API_KEY — frontend will use browser fallback");
    return null;
  }

  const cleaned = stripForTTS(text);

  if (!cleaned || cleaned.length < 2) {
    console.warn("[TTS] Text too short after stripping, skipping");
    return null;
  }

  // Truncate very long text (ElevenLabs has limits)
  const truncated = cleaned.length > 5000 ? cleaned.slice(0, 5000) + "..." : cleaned;

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { voiceId } = getActiveVoice(); // resolved per call — switchable at runtime

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT);

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

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      console.error(`[TTS] ElevenLabs API error ${response.status}: ${errorText}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error("[TTS] ElevenLabs request timed out (15s)");
    } else {
      console.error("[TTS] ElevenLabs request failed:", err.message);
    }
    return null;
  }
}

/**
 * Stream TTS audio directly (for large responses).
 * Returns a ReadableStream or null.
 */
export async function streamTextToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<ReadableStream<Uint8Array> | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) return null;

  const cleaned = stripForTTS(text);
  if (!cleaned || cleaned.length < 2) return null;

  const truncated = cleaned.length > 5000 ? cleaned.slice(0, 5000) + "..." : cleaned;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { voiceId } = getActiveVoice(); // resolved per call — switchable at runtime

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT);

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

    clearTimeout(timeout);

    if (!response.ok || !response.body) return null;

    return response.body as ReadableStream<Uint8Array>;
  } catch {
    return null;
  }
}
