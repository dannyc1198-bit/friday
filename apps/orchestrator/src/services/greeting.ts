// One spoken greeting per orchestrator boot. Later HUD mounts reuse the
// same audio until it has actually started playing, then it is closed.

import { randomUUID } from "crypto";
import { textToSpeech } from "./tts.js";
import { getActiveVoice } from "./voice-registry.js";

export const GREETING_TEXT = "Hey Daniel, how's it going boss? What do we need to do today?";

const bootId = randomUUID();
type GreetingStatus = "pending" | "delivered" | "heard";

let status: GreetingStatus = "pending";
let audio: Buffer | null = null;
let inflight: Promise<Buffer | null> | null = null;

export function getBootId(): string {
  return bootId;
}

export function getGreetingStatus(): { bootId: string; status: GreetingStatus; text: string } {
  return { bootId, status, text: GREETING_TEXT };
}

export async function claimGreeting(): Promise<{
  bootId: string;
  text: string;
  already: boolean;
  audio: Buffer | null;
}> {
  if (status === "heard") {
    return { bootId, text: GREETING_TEXT, already: true, audio: null };
  }
  if (!inflight) {
    inflight = textToSpeech(GREETING_TEXT).then((buf) => {
      audio = buf;
      status = "delivered";
      return buf;
    }).catch((err) => {
      console.warn("[Greeting] TTS failed:", (err as Error).message);
      status = "delivered";
      audio = null;
      return null;
    });
  }
  const buf = await inflight;
  return { bootId, text: GREETING_TEXT, already: false, audio: buf };
}

export function markGreetingHeard(): void {
  status = "heard";
}

export function greetingVoiceLabel(): string {
  const voice = getActiveVoice();
  return voice.voiceId;
}
