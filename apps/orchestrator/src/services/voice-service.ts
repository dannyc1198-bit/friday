// Voice Service — TTS pipeline for live voice chat.
//
// Delegates to tts.ts so the websocket path and /api/tts share one provider
// decision: ElevenLabs (JARVIS/Daniel by default) or the free Edge en-GB voice.

import { isTTSAvailable, textToSpeech } from "./tts.js";

export function isVoiceSynthAvailable(): boolean {
  return isTTSAvailable();
}

/**
 * Synthesize a complete utterance to MP3 bytes.
 * Returns null when every server provider fails — the client then uses browser speech.
 */
export async function synthesizeUtterance(text: string): Promise<Buffer | null> {
  return textToSpeech(text);
}
