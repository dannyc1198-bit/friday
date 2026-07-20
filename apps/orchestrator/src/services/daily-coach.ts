// FRIDAY — Daily Coach
// ─────────────────────────────────────────────────────────────────────
// Turns the day's data + score into ONE punchy coaching line in FRIDAY's
// voice ("what you can do best today"). Uses Groq (the simple-friday LLM).
// Falls back to a deterministic, data-aware nudge if the model is missing
// or slow — so the dashboard NEVER shows an empty coach card, and the UI
// can tell which one it got via the `source` field (not a silent swap).

import { config } from "../config/index.js";
import type { DayData, DayScore } from "./daily-score.js";

const VOICE =
  `You are FRIDAY — Danny's AI chief of staff. Voice: British, warm but sharp, ` +
  `direct, never sycophantic. You call him "boss". Give exactly ONE sentence: ` +
  `the single highest-leverage thing he can do RIGHT NOW based on today's data. ` +
  `Be specific to the numbers. No markdown, no lists, no preamble. If a key ` +
  `stream is missing, you may nudge him to log it.`;

function summarise(day: DayData, score: DayScore): string {
  const fmt = (n?: number) => (n == null ? "—" : Math.round(n).toString());
  const s = score.subs;
  const lines: string[] = [
    `Day score: ${score.score}/100 (${score.label}).`,
    `Sub-scores — sleep:${fmt(s.sleep)} recovery:${fmt(s.recovery)} ` +
      `training:${fmt(s.training)} nutrition:${fmt(s.nutrition)} activity:${fmt(s.activity)} ` +
      `stimulants:${fmt(s.stimulants)} supplements:${fmt(s.supplements)}.`,
  ];
  if (day.sleepHours != null) lines.push(`Slept ${day.sleepHours}h.`);
  if (day.restingHeartRate != null) lines.push(`Resting HR ${day.restingHeartRate} bpm.`);
  if (day.steps != null) lines.push(`${day.steps} steps.`);
  if (day.workoutMinutes != null) lines.push(`${day.workoutMinutes} min training.`);
  if (day.caffeineMg != null) lines.push(`${day.caffeineMg} mg caffeine.`);
  if (day.proteinG != null) lines.push(`${day.proteinG} g protein.`);
  if (day.weightLbs != null) lines.push(`Weight ${day.weightLbs} lbs (goal 170).`);
  if (score.missing.length) lines.push(`No data today for: ${score.missing.join(", ")}.`);
  return lines.join(" ");
}

function fallbackLine(day: DayData, score: DayScore): string {
  if (score.present.length === 0) {
    return "No reads yet today, boss — step on the Hume or log a coffee and I'll start coaching.";
  }
  // Attack the weakest present dimension.
  let weakest: string | null = null;
  let weakestVal = 101;
  for (const [dim, val] of Object.entries(score.subs)) {
    if (typeof val === "number" && val < weakestVal) { weakestVal = val; weakest = dim; }
  }
  const nudges: Record<string, string> = {
    sleep: "sleep's the weak link — protect tonight's wind-down and bank 7-plus hours.",
    recovery: "recovery's low — keep today easy, hydrate, and don't stack stress on a tired system.",
    training: "you haven't moved enough — get a session in, even twenty minutes counts.",
    nutrition: "protein's short — make the next meal a big hit to keep the bulk on track.",
    activity: "step count's low — a brisk walk would lift the whole day.",
    stimulants: "you're heavy on caffeine — cut the next one off before early afternoon.",
    supplements: "you're behind on your stack — knock out the ones you've missed.",
  };
  return weakest && nudges[weakest]
    ? `Score's ${score.score}, boss — ${nudges[weakest]}`
    : `Solid ${score.score} today, boss — hold the line and don't let the evening slip.`;
}

export async function generateCoachLine(
  day: DayData,
  score: DayScore,
): Promise<{ text: string; source: "ai" | "fallback" }> {
  if (!config.groq.apiKey) {
    return { text: fallbackLine(day, score), source: "fallback" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${config.groq.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groq.apiKey}`,
      },
      body: JSON.stringify({
        model: config.groq.model,
        temperature: 0.6,
        max_tokens: 80,
        messages: [
          { role: "system", content: VOICE },
          { role: "user", content: summarise(day, score) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { text: fallbackLine(day, score), source: "fallback" };
    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { text: fallbackLine(day, score), source: "fallback" };
    return { text, source: "ai" };
  } catch {
    return { text: fallbackLine(day, score), source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}
