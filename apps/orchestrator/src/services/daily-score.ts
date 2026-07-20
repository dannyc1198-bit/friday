// FRIDAY — Daily Life Score
// ─────────────────────────────────────────────────────────────────────
// Turns one day of multi-stream data (sleep, recovery, training, food,
// stimulants, supplements, activity) into a single 0–100 score plus the
// per-dimension breakdown the dashboard renders.
//
// DESIGN PRINCIPLE — the score grades BEHAVIOUR, not STATE.
//   Behaviour = what Danny controlled on the day (slept, trained, ate,
//               dosed caffeine, took supplements). These drive the grade.
//   State     = outcomes that move slowly or aren't his to control on the
//               day (net worth, body-fat %, crypto). These ride along as
//               CONTEXT on the dashboard but do NOT drag the grade up/down.
//   Rationale: a market dip isn't a "bad day" by Danny, and body comp can't
//   be judged in 24h. (Override this in computeDayScore if you disagree.)
//
// MISSING DATA IS NEVER PUNISHED. A day with 3 logged streams is graded on
// those 3 (re-normalised), not capped because 4 others were absent. The
// naive "start at 100 and subtract" approach does the opposite — a day you
// forget to log looks like a perfect day. We invert that.

export type Dimension =
  | "sleep"
  | "recovery"
  | "activity"
  | "training"
  | "nutrition"
  | "stimulants"
  | "supplements";

/** Everything we might know about one day. Every field is optional — the
 *  score adapts to whatever actually arrived from the phone bridge or manual logs. */
export interface DayData {
  date: string; // YYYY-MM-DD

  // —— Sleep & recovery (Apple Health bridge) ——
  sleepHours?: number;
  restingHeartRate?: number; // bpm — needs Apple Watch / chest strap
  hrv?: number;              // ms

  // —— Activity (iPhone motion coprocessor) ——
  steps?: number;
  activeEnergyKcal?: number;

  // —— Training (manual log / Apple workouts) ——
  workoutMinutes?: number;
  isRestDay?: boolean;       // a PLANNED rest day shouldn't tank the training score

  // —— Nutrition (manual) ——
  caloriesIn?: number;
  proteinG?: number;

  // —— Stimulants (manual) ——
  caffeineMg?: number;

  // —— Supplements (manual) ——
  supplementsTaken?: number;
  supplementsPlanned?: number;

  // —— STATE: context only, NOT in the grade by default ——
  weightLbs?: number;
  bodyFatPct?: number;
  netWorth?: number;
  cryptoValueUsd?: number;

  // —— meta ——
  coachLine?: string; // cached AI coaching line for the day
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Personal targets — sensible defaults. Tune later; for v1 the WEIGHTS in
// computeDayScore() matter far more than these exact thresholds.
const TARGETS = {
  sleepIdealLow: 7,
  sleepIdealHigh: 9,
  stepsGoal: 9000,
  trainingMinsGoal: 45,
  proteinGoalG: 180,   // ~1g per lb toward the 170 lb goal, with a buffer
  caffeineOkMg: 200,   // at/under this = clean
  caffeineMaxMg: 600,  // at/over this = 0
  hrvGood: 60,
  restingHrGood: 60,
};

/** Convert each PRESENT raw metric into a 0–100 sub-score.
 *  Absent metrics are simply omitted from the returned object. */
export function subScores(day: DayData): Partial<Record<Dimension, number>> {
  const s: Partial<Record<Dimension, number>> = {};

  // Sleep — full marks inside the 7–9h window, tapering off either side.
  if (day.sleepHours != null) {
    const h = day.sleepHours;
    if (h >= TARGETS.sleepIdealLow && h <= TARGETS.sleepIdealHigh) s.sleep = 100;
    else if (h < TARGETS.sleepIdealLow) s.sleep = clamp((h / TARGETS.sleepIdealLow) * 100);
    else s.sleep = clamp(100 - (h - TARGETS.sleepIdealHigh) * 15); // oversleep penalty
  }

  // Recovery — blend HRV (higher = better) and resting HR (lower = better).
  const rec: number[] = [];
  if (day.hrv != null) rec.push(clamp((day.hrv / TARGETS.hrvGood) * 100));
  if (day.restingHeartRate != null) rec.push(clamp(100 - (day.restingHeartRate - TARGETS.restingHrGood) * 3));
  if (rec.length) s.recovery = clamp(rec.reduce((a, b) => a + b, 0) / rec.length);

  // Activity — steps toward the daily goal.
  if (day.steps != null) s.activity = clamp((day.steps / TARGETS.stepsGoal) * 100);

  // Training — minutes toward goal; a planned rest day is a free 100.
  if (day.isRestDay) s.training = 100;
  else if (day.workoutMinutes != null) s.training = clamp((day.workoutMinutes / TARGETS.trainingMinsGoal) * 100);

  // Nutrition — protein hit is the v1 proxy (calories/macros can refine it later).
  if (day.proteinG != null) s.nutrition = clamp((day.proteinG / TARGETS.proteinGoalG) * 100);

  // Stimulants — clean at/under the OK line, scaling to 0 by the max line.
  if (day.caffeineMg != null) {
    if (day.caffeineMg <= TARGETS.caffeineOkMg) s.stimulants = 100;
    else s.stimulants = clamp(
      100 - ((day.caffeineMg - TARGETS.caffeineOkMg) / (TARGETS.caffeineMaxMg - TARGETS.caffeineOkMg)) * 100,
    );
  }

  // Supplements — adherence ratio.
  if (day.supplementsPlanned && day.supplementsPlanned > 0) {
    s.supplements = clamp(((day.supplementsTaken ?? 0) / day.supplementsPlanned) * 100);
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════
//  ⭐ DANNY'S FUNCTION — the soul of the dashboard.
// ═══════════════════════════════════════════════════════════════════════
//
//  `subs` contains ONLY the dimensions you have data for today (each 0–100).
//  Your job: collapse them into ONE 0–100 number that feels like a true
//  grade of your day. Three decisions are yours:
//
//   1. WEIGHTS — how much does each dimension matter to YOU? Sleep and
//      training probably dominate; supplements probably don't. Make them
//      sum to roughly 1.0 (they get re-normalised over present dims anyway).
//
//   2. MISSING DATA — the starter already re-normalises over only the
//      dimensions present, so a 3-stream day isn't capped vs a 7-stream day.
//      Keep that unless you want absent core streams (e.g. no sleep) to hurt.
//
//   3. NON-NEGOTIABLES (optional) — e.g. "if I slept < 5h, cap the whole
//      day at 60 no matter what else." Hard floors encode what you refuse
//      to let a good-looking number paper over.
//
//  The starter below is fully working — if you'd rather I pick, just say so
//  and I'll keep moving. But this is the one place your judgement > mine.
//
export function computeDayScore(subs: Partial<Record<Dimension, number>>): number {
  // TODO(Danny): make these weights yours. (~5–10 lines total.)
  const WEIGHTS: Record<Dimension, number> = {
    sleep:       0.25,
    training:    0.20,
    recovery:    0.15,
    nutrition:   0.15,
    activity:    0.10,
    stimulants:  0.10,
    supplements: 0.05,
  };

  let weighted = 0;
  let totalWeight = 0;
  for (const dim of Object.keys(subs) as Dimension[]) {
    const v = subs[dim];
    if (v == null) continue;
    weighted += v * WEIGHTS[dim];
    totalWeight += WEIGHTS[dim];
  }
  if (totalWeight === 0) return 0;

  // Re-normalise over the dimensions that were actually present.
  return Math.round(weighted / totalWeight);

  // Example non-negotiable you could add ABOVE the return:
  //   if ((subs.sleep ?? 100) < 40) return Math.min(60, Math.round(weighted / totalWeight));
}

// ─── Orchestration (this part is done — feeds the dashboard) ──────────────

export interface DayScore {
  score: number;                                  // 0–100
  label: string;                                  // Excellent / Good / Fair / Needs Attention
  subs: Partial<Record<Dimension, number>>;       // per-dimension breakdown for the cards
  present: Dimension[];                            // what we graded on
  missing: Dimension[];                            // what we're blind to today
}

const ALL_DIMENSIONS: Dimension[] = [
  "sleep", "recovery", "activity", "training", "nutrition", "stimulants", "supplements",
];

export function scoreDay(day: DayData): DayScore {
  const subs = subScores(day);
  const score = computeDayScore(subs);
  const present = ALL_DIMENSIONS.filter((d) => subs[d] != null);
  const missing = ALL_DIMENSIONS.filter((d) => subs[d] == null);
  return { score, label: labelFor(score), subs, present, missing };
}

function labelFor(score: number): string {
  return score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Attention";
}
