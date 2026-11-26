import { decisionFromBrain, routeVoiceIntent, type VoiceIntent } from "./intent.js";

export function planFromTranscript(transcript: string): VoiceIntent[] | null {
  const text = transcript.trim().replace(/^(?:hey|ok|okay)\s+jarvis\b[,!.:\s]*/i, "").trim();
  const parts = text
    .split(/\s+(?:and then|then)\s+|,\s*then\s+|\s+and\s+(?=(?:open|close|go|play|pause|lock|take)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const steps = parts.map((part) => routeVoiceIntent(part));
  if (steps.every((step) => step.kind === "general")) return null;
  return steps;
}

export function stepsFromBrain(raw: string): VoiceIntent[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: { steps?: unknown };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as { steps?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length < 2) return null;
  const steps: VoiceIntent[] = [];
  for (const step of parsed.steps) {
    const intent = decisionFromBrain(JSON.stringify(step));
    if (intent && intent.kind !== "general") steps.push(intent);
    else if (intent?.kind === "general" && intent.text) steps.push(intent);
  }
  return steps.length > 1 ? steps : null;
}

export function spokenSummary(lines: string[]): string {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return clean.slice(0, 3).join(" ");
}
