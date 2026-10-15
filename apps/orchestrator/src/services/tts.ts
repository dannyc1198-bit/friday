/**
 * Text-to-Speech Service
 *
 * Voice id and delivery come from services/voice-registry.ts at call time
 * (JARVIS by default: calm British male). Provider is chosen by speech-plan.ts:
 * ElevenLabs when ELEVENLABS_API_KEY is set, otherwise Microsoft Edge's free
 * en-GB neural voice. A missing key never throws. If both fail, this returns
 * null and the browser speaks with an en-GB male voice.
 */

import { getActiveVoice } from "./voice-registry.js";
import { isServerTtsAvailable, resolveSpeechPlan } from "./speech-plan.js";
import { synthesizeEdge } from "./edge-tts.js";
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
 * True when a server-side voice can be attempted (ElevenLabs or Edge).
 * Edge needs no key. The browser is the last resort when this still returns null audio.
 */
export function isTTSAvailable(): boolean {
  return isServerTtsAvailable();
}

async function elevenLabsSpeech(
  text: string,
  voiceId: string,
  opts: Required<TTSOptions>
): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

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
          text,
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
      console.error(`[TTS] ElevenLabs API error ${response.status}: ${errorText.slice(0, 200)}`);
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
 * Convert text to speech. Returns MP3 bytes or null if every configured
 * provider failed. Never throws.
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer | null> {
  const cleaned = stripForTTS(text);

  if (!cleaned || cleaned.length < 2) {
    console.warn("[TTS] Text too short after stripping, skipping");
    return null;
  }

  const truncated = cleaned.length > 5000 ? cleaned.slice(0, 5000) + "..." : cleaned;
  const active = getActiveVoice();
  const plan = resolveSpeechPlan(process.env, active.edgeVoice);
  const opts: Required<TTSOptions> = {
    stability: options.stability ?? active.stability,
    similarityBoost: options.similarityBoost ?? active.similarityBoost,
    style: options.style ?? active.style,
    useSpeakerBoost: options.useSpeakerBoost ?? DEFAULT_OPTIONS.useSpeakerBoost ?? true,
  };

  if (plan.provider === "elevenlabs") {
    const audio = await elevenLabsSpeech(truncated, active.voiceId, opts);
    if (audio) return audio;
    if (plan.fallbackEdge) {
      console.warn("[TTS] ElevenLabs failed — falling back to Edge en-GB");
      return synthesizeEdge(truncated, plan.edgeVoice);
    }
    return null;
  }

  return synthesizeEdge(truncated, plan.edgeVoice);
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
  const active = getActiveVoice();
  const plan = resolveSpeechPlan(process.env, active.edgeVoice);
  if (plan.provider !== "elevenlabs") return null;
  const opts: Required<TTSOptions> = {
    stability: options.stability ?? active.stability,
    similarityBoost: options.similarityBoost ?? active.similarityBoost,
    style: options.style ?? active.style,
    useSpeakerBoost: options.useSpeakerBoost ?? true,
  };
  const voiceId = active.voiceId;

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
