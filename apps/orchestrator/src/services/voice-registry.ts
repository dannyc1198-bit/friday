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
import { join } from "path";

export type VoicePersona = "jarvis" | "friday";

interface PersonaDefinition {
  displayName: string;
  defaultVoiceId: string;
  envOverride: string;
  /** Greeting/delivery style — reference for prompts and future consumers. */
  styleNote: string;
}

const PERSONAS: Record<VoicePersona, PersonaDefinition> = {
  jarvis: {
    displayName: "JARVIS",
    defaultVoiceId: "onwK4e9ZLuTAKqWW03F9", // ElevenLabs "Daniel" — British, calm, authoritative
    envOverride: "FRIDAY_VOICE_ID_JARVIS",
    styleNote: "Measured British butler AI — calm, dry, precise. Greets like 'At your service, boss.'",
  },
  friday: {
    displayName: "FRIDAY",
    defaultVoiceId: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs "Rachel" — warm female
    envOverride: "FRIDAY_VOICE_ID_FRIDAY",
    styleNote: "Warm Irish-leaning assistant — bright, quick, loyal. Greets like 'Right here, boss.'",
  },
};

const DEFAULT_PERSONA: VoicePersona = "jarvis";

// Same data-dir convention as day-store.ts / task-manager.ts — stable whether
// running from src (tsx) or compiled dist. Repo-root .gitignore covers data/.
const DATA_DIR = join(
  process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368",
  "jarvis", "apps", "orchestrator", "data",
);
const STATE_FILE = join(DATA_DIR, "voice-state.json");

export interface ActiveVoice {
  persona: VoicePersona;
  voiceId: string;
  displayName: string;
}

function isPersona(v: unknown): v is VoicePersona {
  return v === "jarvis" || v === "friday";
}

// In-memory cache of the persisted persona; disk survives restarts.
let activePersona: VoicePersona | null = null;

function loadPersona(): VoicePersona {
  if (activePersona) return activePersona;
  try {
    if (existsSync(STATE_FILE)) {
      const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8"));
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
  return { persona, voiceId, displayName: def.displayName };
}

/**
 * Switch the active persona and persist it. Takes effect on the very next
 * TTS call — no restart needed. Returns the newly active voice.
 */
export function setActivePersona(p: VoicePersona): ActiveVoice {
  activePersona = p;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ persona: p, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch (err) {
    // Non-fatal: the switch still applies for this process lifetime.
    console.error(`[VoiceRegistry] Failed to persist voice state: ${(err as Error).message}`);
  }
  return getActiveVoice();
}
