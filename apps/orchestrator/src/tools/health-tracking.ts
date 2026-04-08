// Health Tracking Tools — Phase 8.2
// Personal logging: weight, workouts, meals
// Stored in data/health.json
// Weekly Sunday summary fires automatically via proactive monitor

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

// ─── Storage ──────────────────────────────────────────────────────

const DATA_DIR = join(
  process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368",
  "jarvis", "apps", "orchestrator", "data"
);
const HEALTH_FILE = join(DATA_DIR, "health.json");

interface WeightEntry    { date: string; lbs: number; }
interface WorkoutEntry   { date: string; summary: string; duration?: number; }
interface MealEntry      { date: string; description: string; calories?: number; }

interface HealthStore {
  weight:   WeightEntry[];
  workouts: WorkoutEntry[];
  meals:    MealEntry[];
}

function loadStore(): HealthStore {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(HEALTH_FILE)) return { weight: [], workouts: [], meals: [] };
  try {
    return JSON.parse(readFileSync(HEALTH_FILE, "utf8"));
  } catch {
    return { weight: [], workouts: [], meals: [] };
  }
}

function saveStore(store: HealthStore): void {
  writeFileSync(HEALTH_FILE, JSON.stringify(store, null, 2));
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Tool Definitions ─────────────────────────────────────────────

const tools: Tool[] = [

  // ── Log weight ─────────────────────────────────────────────────
  {
    name: "health_log_weight",
    description: "Log Danny's weight in pounds. Use when he says 'I weighed X this morning' or 'log my weight as X lbs'.",
    category: "Health Tracking",
    parameters: [
      { name: "lbs", type: "number", description: "Weight in pounds", required: true },
      { name: "date", type: "string", description: "Date (YYYY-MM-DD). Defaults to today.", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const lbs = params.lbs as number;
      const date = (params.date as string | undefined) || today();
      if (lbs < 50 || lbs > 500) return { toolCallId: "", success: false, error: "Weight out of valid range (50–500 lbs)" };

      const store = loadStore();
      store.weight.push({ date, lbs });
      // Keep last 365 entries
      store.weight = store.weight.slice(-365);
      saveStore(store);

      // Calculate trend if enough data
      const recent = store.weight.slice(-7);
      let trendMsg = "";
      if (recent.length >= 2) {
        const diff = recent[recent.length - 1].lbs - recent[0].lbs;
        const direction = diff > 0 ? `up ${diff.toFixed(1)} lbs` : diff < 0 ? `down ${Math.abs(diff).toFixed(1)} lbs` : "steady";
        trendMsg = ` 7-day trend: ${direction}.`;
      }

      const goal = 170;
      const toGo = (goal - lbs).toFixed(1);
      return {
        toolCallId: "",
        success: true,
        data: `Logged ${lbs} lbs on ${date}.${trendMsg} ${Number(toGo) > 0 ? `${toGo} lbs to go until ${goal} lb goal.` : "Goal reached, sir."}`,
      };
    },
  },

  // ── Log workout ────────────────────────────────────────────────
  {
    name: "health_log_workout",
    description: "Log a workout. Use when Danny says 'just finished the gym', 'log my workout', etc.",
    category: "Health Tracking",
    parameters: [
      { name: "summary", type: "string", description: "Brief workout description (e.g. 'chest and shoulders, 1 hour')", required: true },
      { name: "duration_minutes", type: "number", description: "Duration in minutes", required: false },
      { name: "date", type: "string", description: "Date (YYYY-MM-DD). Defaults to today.", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const summary  = params.summary as string;
      const duration = params.duration_minutes as number | undefined;
      const date     = (params.date as string | undefined) || today();

      const store = loadStore();
      store.workouts.push({ date, summary, duration });
      store.workouts = store.workouts.slice(-365);
      saveStore(store);

      // Streak count
      const dates = [...new Set(store.workouts.map((w) => w.date))].sort().reverse();
      let streak = 0;
      const d = new Date();
      for (const dateStr of dates) {
        const expected = d.toISOString().split("T")[0];
        if (dateStr === expected) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }

      return {
        toolCallId: "",
        success: true,
        data: `Workout logged: ${summary}${duration ? ` (${duration} min)` : ""}.${streak > 1 ? ` ${streak}-day streak, sir.` : ""}`,
      };
    },
  },

  // ── Log meal ───────────────────────────────────────────────────
  {
    name: "health_log_meal",
    description: "Log a meal or food. Use when Danny says 'I just had X' or 'log my lunch'.",
    category: "Health Tracking",
    parameters: [
      { name: "description", type: "string", description: "What was eaten (e.g. 'chicken rice and broccoli')", required: true },
      { name: "calories", type: "number", description: "Estimated calories (optional)", required: false },
      { name: "date", type: "string", description: "Date (YYYY-MM-DD). Defaults to today.", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const description = params.description as string;
      const calories    = params.calories as number | undefined;
      const date        = (params.date as string | undefined) || today();

      const store = loadStore();
      store.meals.push({ date, description, calories });
      store.meals = store.meals.slice(-1000);
      saveStore(store);

      const todayMeals = store.meals.filter((m) => m.date === date);
      const totalCals  = todayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);

      return {
        toolCallId: "",
        success: true,
        data: `Meal logged: ${description}.${calories ? ` ${calories} kcal.` : ""}${totalCals > 0 ? ` Today's total: ~${totalCals} kcal.` : ""}`,
      };
    },
  },

  // ── Get progress ───────────────────────────────────────────────
  {
    name: "health_get_progress",
    description: "Get Danny's health progress — weight trend, workout frequency, recent meals.",
    category: "Health Tracking",
    parameters: [
      { name: "days", type: "number", description: "How many days to look back (default 7)", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const days  = (params.days as number | undefined) || 7;
      const store = loadStore();
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split("T")[0];

      const weights  = store.weight.filter((w) => w.date >= sinceStr);
      const workouts = store.workouts.filter((w) => w.date >= sinceStr);
      const meals    = store.meals.filter((m) => m.date >= sinceStr);

      const parts: string[] = [];

      // Weight
      if (weights.length >= 2) {
        const first = weights[0].lbs;
        const last  = weights[weights.length - 1].lbs;
        const diff  = last - first;
        parts.push(`Weight: ${last} lbs (${diff >= 0 ? "+" : ""}${diff.toFixed(1)} lbs over ${days} days, goal: 170 lbs)`);
      } else if (weights.length === 1) {
        parts.push(`Last logged weight: ${weights[0].lbs} lbs`);
      } else {
        parts.push("No weight logged this period");
      }

      // Workouts
      const uniqueWorkoutDays = new Set(workouts.map((w) => w.date)).size;
      parts.push(`Workouts: ${uniqueWorkoutDays} session${uniqueWorkoutDays !== 1 ? "s" : ""} in ${days} days`);
      if (workouts.length > 0) {
        parts.push(`Last session: ${workouts[workouts.length - 1].summary}`);
      }

      // Meals
      const totalCals = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
      if (totalCals > 0) {
        parts.push(`Avg calories: ~${Math.round(totalCals / days)} kcal/day`);
      }

      return { toolCallId: "", success: true, data: parts.join(". ") + "." };
    },
  },

  // ── Weekly summary ─────────────────────────────────────────────
  {
    name: "health_weekly_summary",
    description: "Get a full 7-day health summary. Called automatically on Sundays.",
    category: "Health Tracking",
    parameters: [],
    execute: async (): Promise<ToolResult> => {
      const store = loadStore();
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const sinceStr = since.toISOString().split("T")[0];

      const weights  = store.weight.filter((w) => w.date >= sinceStr);
      const workouts = store.workouts.filter((w) => w.date >= sinceStr);

      const lines: string[] = ["Weekly Health Summary:"];

      if (weights.length >= 2) {
        const diff = weights[weights.length - 1].lbs - weights[0].lbs;
        lines.push(`Weight: started ${weights[0].lbs} lbs, ended ${weights[weights.length - 1].lbs} lbs (${diff >= 0 ? "+" : ""}${diff.toFixed(1)} lbs)`);
      }

      const days = new Set(workouts.map((w) => w.date)).size;
      lines.push(`Training: ${days} day${days !== 1 ? "s" : ""} out of 7`);

      if (days >= 5) lines.push("Excellent consistency, sir.");
      else if (days >= 3) lines.push("Solid week. Push for one more session next week.");
      else lines.push("Below target. The gym does not build itself, sir.");

      return { toolCallId: "", success: true, data: lines.join(" ") };
    },
  },
];

export function registerHealthTrackingTools(): void {
  tools.forEach((t) => toolRegistry.register(t));
}
