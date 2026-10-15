// Voice Registry — switchable JARVIS / FRIDAY spoken-voice personas (2026-07-09)
//
// Single source of truth for WHICH ElevenLabs voice FRIDAY speaks with.
// Consumers (tts.ts, voice-service.ts, /api/tts/status) must resolve the
// voice ID at CALL time via getActiveVoice() — never cache it in a
// module-load constant, or switching would need a restart.
//
// Voice ID resolution order (highest wins):
//   1. ELEVENLABS_VOICE_ID           — legacy GLOBAL override; if set it wins
//                                      for every persona (backward compat).
//   2. FRIDAY_VOICE_ID_JARVIS /      — per-persona overrides so Danny can
//      FRIDAY_VOICE_ID_FRIDAY          paste better voice IDs later (e.g. a
//                                      Voice Design JARVIS or Labhaoise)
//                                      without code changes.
//   3. Built-in defaults below.
//
// Active persona persists across restarts in data/voice-state.json — the
// same gitignored data/ dir + load/save pattern as day-store.ts and
// task-manager.ts. Default persona: jarvis (Danny wants JARVIS by default).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { DATA_DIR as CHECKOUT_DATA_DIR } from "./runtime-paths.js";

export type VoicePersona = "jarvis" | "friday";

interface PersonaDefinition {
  displayName: string;
  defaultVoiceId: string;
  envOverride: string;
  /** Free Edge/Windows neural voice used when ElevenLabs is not configured. */
  edgeVoice: string;
  edgeEnv: string;
  stability: number;
  similarityBoost: number;
  style: number;
  /** Greeting/delivery style — reference for prompts and future consumers. */
  styleNote: string;
}

const PERSONAS: Record<VoicePersona, PersonaDefinition> = {
  jarvis: {
    displayName: "JARVIS",
    // ElevenLabs "Daniel" — calm British male. Override with FRIDAY_VOICE_ID_JARVIS
    // or a designed voice id. Not a film clip.
    defaultVoiceId: "onwK4e9ZLuTAKqWW03F9",
    envOverride: "FRIDAY_VOICE_ID_JARVIS",
    edgeVoice: "en-GB-RyanNeural",
    edgeEnv: "EDGE_TTS_VOICE_JARVIS",
    stability: 0.68,
    similarityBoost: 0.75,
    style: 0.05,
    styleNote: "Measured British butler — calm, dry, precise. Slightly slow, low pitch.",
  },
  friday: {
    displayName: "FRIDAY",
    defaultVoiceId: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs "Rachel" — warm female
    envOverride: "FRIDAY_VOICE_ID_FRIDAY",
    edgeVoice: "en-GB-SoniaNeural",
    edgeEnv: "EDGE_TTS_VOICE_FRIDAY",
    stability: 0.45,
    similarityBoost: 0.8,
    style: 0.3,
    styleNote: "Warm assistant — bright, quick, loyal.",
  },
};

const DEFAULT_PERSONA: VoicePersona = "jarvis";

function voiceStateFile(): string {
  const dir = process.env.FRIDAY_DATA_DIR
    ? path.resolve(process.env.FRIDAY_DATA_DIR)
    : CHECKOUT_DATA_DIR;
  return path.join(dir, "voice-state.json");
}

export interface ActiveVoice {
  persona: VoicePersona;
  voiceId: string;
  displayName: string;
  edgeVoice: string;
  stability: number;
  similarityBoost: number;
  style: number;
}

function isPersona(v: unknown): v is VoicePersona {
  return v === "jarvis" || v === "friday";
}

// In-memory cache of the persisted persona; disk survives restarts.
let activePersona: VoicePersona | null = null;

function loadPersona(): VoicePersona {
  if (activePersona) return activePersona;
  try {
    if (existsSync(voiceStateFile())) {
      const parsed = JSON.parse(readFileSync(voiceStateFile(), "utf8"));
      if (parsed && isPersona(parsed.persona)) {
        activePersona = parsed.persona;
        return parsed.persona;
      }
    }
  } catch {
    // Corrupt/unreadable state file — fall through to default.
  }
  activePersona = DEFAULT_PERSONA;
  return activePersona;
}

/**
 * Resolve the currently active voice. Call this at TTS-request time —
 * the result must not be cached across requests.
 */
export function getActiveVoice(): ActiveVoice {
  const persona = loadPersona();
  const def = PERSONAS[persona];
  const voiceId =
    process.env.ELEVENLABS_VOICE_ID || // legacy global override — always wins if set
    process.env[def.envOverride] ||
    def.defaultVoiceId;
  const edgeVoice =
    process.env.EDGE_TTS_VOICE ||
    process.env[def.edgeEnv] ||
    def.edgeVoice;
  return {
    persona,
    voiceId,
    displayName: def.displayName,
    edgeVoice,
    stability: def.stability,
    similarityBoost: def.similarityBoost,
    style: def.style,
  };
}

/**
 * Switch the active persona and persist it. Takes effect on the very next
 * TTS call — no restart needed. Returns the newly active voice.
 */
export function setActivePersona(p: VoicePersona): ActiveVoice {
  activePersona = p;
  try {
    const file = voiceStateFile();
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({ persona: p, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch (err) {
    // Non-fatal: the switch still applies for this process lifetime.
    console.error(`[VoiceRegistry] Failed to persist voice state: ${(err as Error).message}`);
  }
  return getActiveVoice();
}
