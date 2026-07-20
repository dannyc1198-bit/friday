// FRIDAY — Dashboard API
// ─────────────────────────────────────────────────────────────────────
// The life-dashboard backend: ingest from the phone, one-tap logs from the
// web app, and the read endpoint that returns today's data + score + coach.
// Mounted under /api/dashboard (see index.ts).
//
//   POST /api/dashboard/ingest           ← Apple Shortcut pushes HealthKit JSON
//   GET  /api/dashboard/today            → { day, score, coach, config }
//   GET  /api/dashboard/range?days=14    → DayData[] (+ score per day)
//   POST /api/dashboard/log/caffeine     ← { mg } or { preset }
//   POST /api/dashboard/log/supplements  ← { taken, planned }
//   POST /api/dashboard/log/manual       ← arbitrary DayData fields
//   POST /api/dashboard/coach            → (re)generate today's coach line
//
// Auth: all of these sit behind the orchestrator's Bearer middleware. The
// browser reaches them via Next.js proxy routes that inject FRIDAY_API_KEY
// server-side; the phone's ingest Shortcut sends the key directly.

import type { FastifyInstance } from "fastify";
import type { DayData } from "../services/daily-score.js";
import { scoreDay } from "../services/daily-score.js";
import {
  getDay, getRange, upsertDay, addCaffeine, setSupplements, todayStr,
} from "../services/day-store.js";
import { generateCoachLine } from "../services/daily-coach.js";
import { DEFAULT_SUPPLEMENTS, CAFFEINE_PRESETS } from "../config/dashboard-config.js";

// Numeric DayData fields the ingest + manual log accept. Anything else in the
// payload is ignored — keeps the bridge liberal but the store clean.
const NUMERIC_FIELDS: (keyof DayData)[] = [
  "sleepHours", "restingHeartRate", "hrv", "steps", "activeEnergyKcal",
  "workoutMinutes", "caloriesIn", "proteinG", "caffeineMg",
  "supplementsTaken", "supplementsPlanned", "weightLbs", "bodyFatPct",
  "netWorth", "cryptoValueUsd",
];

// Sanity bounds so a mis-mapped Shortcut field or fat-fingered entry can't
// poison the score (e.g. steps arriving as a UNIX timestamp).
const BOUNDS: Partial<Record<keyof DayData, [number, number]>> = {
  sleepHours: [0, 24],
  restingHeartRate: [20, 220],
  hrv: [0, 400],
  steps: [0, 100000],
  activeEnergyKcal: [0, 20000],
  workoutMinutes: [0, 1440],
  caloriesIn: [0, 20000],
  proteinG: [0, 1000],
  caffeineMg: [0, 5000],
  weightLbs: [50, 800],
  bodyFatPct: [1, 70],
};

function cleanNumericPayload(body: Record<string, unknown>): {
  patch: Partial<DayData>; accepted: string[]; ignored: string[];
} {
  const patch: Partial<DayData> = {};
  const accepted: string[] = [];
  const ignored: string[] = [];
  for (const field of NUMERIC_FIELDS) {
    const raw = body[field];
    if (raw == null) continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) { ignored.push(field); continue; }
    const b = BOUNDS[field];
    if (b && (n < b[0] || n > b[1])) { ignored.push(field); continue; }
    (patch as Record<string, number>)[field] = n;
    accepted.push(field);
  }
  if (typeof body.isRestDay === "boolean") { patch.isRestDay = body.isRestDay; accepted.push("isRestDay"); }
  return { patch, accepted, ignored };
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // ── Ingest from the phone (Apple Shortcut / Health Auto Export) ──
  app.post<{ Body: Record<string, unknown> }>("/ingest", async (request, reply) => {
    const body = request.body || {};
    const date = typeof body.date === "string" ? body.date : todayStr();
    const { patch, accepted, ignored } = cleanNumericPayload(body);
    if (accepted.length === 0) {
      reply.code(400);
      return { ok: false, error: "No recognised numeric fields in payload", ignored };
    }
    const day = upsertDay(date, patch);
    return { ok: true, date, accepted, ignored, day };
  });

  // ── Read: today's data + score + cached coach + UI config ──
  app.get("/today", async () => {
    const day = getDay();
    const score = scoreDay(day);
    return {
      day,
      score,
      coach: day.coachLine || null,
      config: { supplements: DEFAULT_SUPPLEMENTS, caffeinePresets: CAFFEINE_PRESETS },
    };
  });

  // ── Read: trailing range for trend charts ──
  app.get<{ Querystring: { days?: string } }>("/range", async (request) => {
    const days = Math.min(90, Math.max(1, parseInt(request.query.days || "14", 10) || 14));
    const range = getRange(days).map((d) => ({ ...d, score: scoreDay(d).score }));
    return { days, range };
  });

  // ── Log: caffeine (preset label or explicit mg, cumulative) ──
  app.post<{ Body: { mg?: number; preset?: string } }>("/log/caffeine", async (request, reply) => {
    const { mg, preset } = request.body || {};
    let add = 0;
    if (typeof mg === "number" && Number.isFinite(mg)) add = mg;
    else if (preset) add = CAFFEINE_PRESETS.find((p) => p.label === preset)?.mg || 0;
    if (add <= 0) { reply.code(400); return { ok: false, error: "Provide mg or a known preset" }; }
    const day = addCaffeine(todayStr(), add);
    return { ok: true, added: add, total: day.caffeineMg, day };
  });

  // ── Log: supplement adherence ──
  app.post<{ Body: { taken?: number; planned?: number } }>("/log/supplements", async (request, reply) => {
    const taken = Number(request.body?.taken);
    const planned = Number(request.body?.planned ?? DEFAULT_SUPPLEMENTS.length);
    if (!Number.isFinite(taken) || !Number.isFinite(planned) || planned <= 0) {
      reply.code(400); return { ok: false, error: "taken and planned must be numbers" };
    }
    const day = setSupplements(todayStr(), Math.max(0, Math.min(taken, planned)), planned);
    return { ok: true, day };
  });

  // ── Log: anything else manually (sleep, workout, macros, money) ──
  app.post<{ Body: Record<string, unknown> }>("/log/manual", async (request, reply) => {
    const { patch, accepted, ignored } = cleanNumericPayload(request.body || {});
    if (accepted.length === 0) { reply.code(400); return { ok: false, error: "No recognised fields", ignored }; }
    const day = upsertDay(todayStr(), patch);
    return { ok: true, accepted, ignored, day };
  });

  // ── (Re)generate today's coach line via the LLM, cache it on the day ──
  app.post("/coach", async () => {
    const day = getDay();
    const score = scoreDay(day);
    const { text, source } = await generateCoachLine(day, score);
    upsertDay(day.date, { coachLine: text });
    return { ok: true, coach: text, source, score: score.score };
  });
}
