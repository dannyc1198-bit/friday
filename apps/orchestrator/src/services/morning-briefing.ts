// Morning Briefing — FRIDAY speaks a daily summary after startup completes
//
// Pulls from: weather (Open-Meteo, free), tasks (local JSON),
//             crypto (CoinGecko, free), email count (OpenClaw if available)
//
// Returns a natural spoken script — concise, British-butler tone.
// The frontend calls /api/briefing/morning after the startup sequence finishes
// and passes the result straight to TTS.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../config/index.js";

// ─── Types ────────────────────────────────────────────────────────

interface WeatherResult {
  temp: number;
  condition: string;
  feelsLike: number;
}

interface CryptoResult {
  symbol: string;
  price: number;
  changePercent: number;
}

interface TaskSummary {
  total: number;
  highPriority: number;
  overdue: number;
  topTask: string | null;
}

export interface MorningBriefingResult {
  script: string;           // Full spoken text for TTS
  sections: {
    greeting: string;
    weather: string | null;
    crypto: string | null;
    tasks: string | null;
    emails: string | null;
    closing: string;
  };
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatChange(pct: number): string {
  const sign = pct >= 0 ? "up" : "down";
  return `${sign} ${Math.abs(pct).toFixed(1)} percent`;
}

// ─── Data Fetchers ────────────────────────────────────────────────

async function fetchWeather(): Promise<WeatherResult | null> {
  try {
    // Kelowna, BC coordinates — update via FRIDAY config if needed
    const lat = process.env.WEATHER_LAT || "49.8880";
    const lon = process.env.WEATHER_LON || "-119.4960";

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code` +
      `&temperature_unit=fahrenheit&timezone=auto`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;

    const data = await res.json() as {
      current?: {
        temperature_2m: number;
        apparent_temperature: number;
        weather_code: number;
      }
    };

    const current = data.current;
    if (!current) return null;

    const codeToCondition: Record<number, string> = {
      0: "clear skies", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
      45: "foggy", 48: "foggy",
      51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
      61: "light rain", 63: "rain", 65: "heavy rain",
      71: "light snow", 73: "snow", 75: "heavy snow",
      95: "thunderstorm",
    };

    return {
      temp: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      condition: codeToCondition[current.weather_code] ?? "variable conditions",
    };
  } catch {
    return null;
  }
}

async function fetchCrypto(): Promise<CryptoResult[]> {
  try {
    const watchlist = ["XRP", "XLM", "HBAR"];
    const idMap: Record<string, string> = {
      XRP: "ripple", XLM: "stellar", HBAR: "hedera-hashgraph",
    };
    const ids = watchlist.map((s) => idMap[s]).join(",");

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];

    const data = await res.json() as Record<string, { usd: number; usd_24h_change: number }>;

    return watchlist.map((symbol) => {
      const id = idMap[symbol];
      const coin = data[id];
      return {
        symbol,
        price: coin?.usd ?? 0,
        changePercent: coin?.usd_24h_change ?? 0,
      };
    }).filter((c) => c.price > 0);
  } catch {
    return [];
  }
}

function readTaskSummary(): TaskSummary {
  const DATA_DIR = join(
    process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368",
    "jarvis", "apps", "orchestrator", "data"
  );
  const tasksFile = join(DATA_DIR, "tasks.json");

  if (!existsSync(tasksFile)) {
    return { total: 0, highPriority: 0, overdue: 0, topTask: null };
  }

  try {
    const raw = JSON.parse(readFileSync(tasksFile, "utf8")) as
      | Array<{ text?: string; title?: string; priority?: string; completed?: boolean; due?: string; dueDate?: string }>
      | { tasks: Array<{ text?: string; title?: string; priority?: string; completed?: boolean; due?: string; dueDate?: string }> };
    const tasks = Array.isArray(raw) ? raw : raw.tasks ?? [];

    const pending = tasks.filter((t) => !t.completed);
    const highPriority = pending.filter((t) => t.priority === "high");
    const now = new Date();
    const overdue = pending.filter((t) => {
      const d = t.due ?? t.dueDate;
      return d && new Date(d) < now;
    });
    const label = (t: { text?: string; title?: string }) => t.text ?? t.title ?? null;
    const topTask = label(highPriority[0] ?? pending[0] ?? {});

    return {
      total: pending.length,
      highPriority: highPriority.length,
      overdue: overdue.length,
      topTask,
    };
  } catch {
    return { total: 0, highPriority: 0, overdue: 0, topTask: null };
  }
}

async function fetchEmailCount(): Promise<{ unread: number; important: number } | null> {
  if (!config.openclaw.token || !config.openclaw.baseUrl) return null;

  try {
    const res = await fetch(`${config.openclaw.baseUrl}/api/gmail/unread-count`, {
      headers: { Authorization: `Bearer ${config.openclaw.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { count?: number; important?: number };
    return { unread: data.count ?? 0, important: data.important ?? 0 };
  } catch {
    return null;
  }
}

// ─── Script Builder ───────────────────────────────────────────────

function buildScript(
  greeting: string,
  weather: WeatherResult | null,
  crypto: CryptoResult[],
  tasks: TaskSummary,
  emails: { unread: number; important: number } | null
): MorningBriefingResult {

  const sections: MorningBriefingResult["sections"] = {
    greeting: `${greeting}, Mr. ${config.userName}. Here is your briefing.`,
    weather: null,
    crypto: null,
    tasks: null,
    emails: null,
    closing: "That is your briefing, sir. What shall we begin with?",
  };

  // Weather section
  if (weather) {
    sections.weather = `Weather: ${weather.temp} degrees Fahrenheit, ${weather.condition}.`;
    if (Math.abs(weather.temp - weather.feelsLike) >= 5) {
      sections.weather += ` Feels like ${weather.feelsLike}.`;
    }
  }

  // Crypto section — only notable moves (>2%) or top 2
  if (crypto.length > 0) {
    const notable = crypto.filter((c) => Math.abs(c.changePercent) >= 2);
    const toReport = notable.length > 0 ? notable : crypto.slice(0, 2);

    const parts = toReport.map((c) =>
      `${c.symbol} at $${c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2)}, ${formatChange(c.changePercent)}`
    );
    sections.crypto = `Crypto: ${parts.join(". ")}.`;
  }

  // Tasks section
  if (tasks.total > 0) {
    if (tasks.overdue > 0) {
      sections.tasks = `Tasks: ${tasks.overdue} overdue and ${tasks.total} pending in total. I would address the overdue items first.`;
    } else if (tasks.highPriority > 0) {
      sections.tasks = `Tasks: ${tasks.highPriority} high-priority item${tasks.highPriority > 1 ? "s" : ""} pending.`;
      if (tasks.topTask) {
        sections.tasks += ` Top of the list: "${tasks.topTask}".`;
      }
    } else {
      sections.tasks = `Tasks: ${tasks.total} item${tasks.total > 1 ? "s" : ""} on your list today.`;
    }
  } else {
    sections.tasks = "Task list is clear. A clean slate.";
  }

  // Email section
  if (emails) {
    if (emails.important > 0) {
      sections.emails = `Email: ${emails.important} marked important out of ${emails.unread} unread. Worth a look.`;
    } else if (emails.unread > 0) {
      sections.emails = `Email: ${emails.unread} unread.`;
    } else {
      sections.emails = "Inbox is clear.";
    }
  }

  // Assemble full script
  const parts = [
    sections.greeting,
    sections.weather,
    sections.tasks,
    sections.emails,
    sections.crypto,
    sections.closing,
  ].filter(Boolean) as string[];

  return {
    script: parts.join(" "),
    sections,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Main Export ─────────────────────────────────────────────────

export async function getMorningBriefing(): Promise<MorningBriefingResult> {
  const greeting = getTimeOfDayGreeting();

  // Fetch all data in parallel — non-blocking, each has its own timeout
  const [weather, crypto, emails] = await Promise.all([
    fetchWeather().catch(() => null),
    fetchCrypto().catch(() => []),
    fetchEmailCount().catch(() => null),
  ]);

  const tasks = readTaskSummary();

  return buildScript(greeting, weather, crypto, tasks, emails);
}
