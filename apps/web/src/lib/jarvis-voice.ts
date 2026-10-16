// Browser fallback when the server has no ElevenLabs key and Edge audio
// didn't reach the page. Prefer a calm British male system voice
// (Ryan / George on Windows). Not a film recording.

export const JARVIS_SPEECH_RATE = 0.92;
export const JARVIS_SPEECH_PITCH = 0.82;

const MALE_HINTS = ["ryan", "george", "guy", "daniel", "thomas", "male"];
const FEMALE_HINTS = ["female", "sonia", "libby", "hazel", "susan", "zira", "lily", "olivia", "abby", "natasha", "emma"];

export interface VoiceLike {
  name: string;
  lang: string;
}

export function pickNamedVoice<T extends VoiceLike>(voices: T[], edgeVoice: string): T | undefined {
  const token = edgeVoice.toLowerCase().replace(/^en-[a-z]{2}-/, "").replace(/neural$/, "");
  if (token) {
    const named = voices.find((voice) => voice.name.toLowerCase().includes(token));
    if (named) return named;
  }
  return pickJarvisVoice(voices);
}

export function pickJarvisVoice<T extends VoiceLike>(voices: T[]): T | undefined {
  const normalized = (lang: string) => lang.toLowerCase().replace("_", "-");
  const british = voices.filter((v) => normalized(v.lang).startsWith("en-gb"));
  const pool = british.length > 0 ? british : voices.filter((v) => normalized(v.lang).startsWith("en"));
  const male = pool.find((v) => {
    const name = v.name.toLowerCase();
    if (FEMALE_HINTS.some((hint) => name.includes(hint))) return false;
    return MALE_HINTS.some((hint) => name.includes(hint));
  });
  return male || pool[0] || voices[0];
}
