// The local apps Friday oversees. Each probe reads a small live endpoint and
// reports up or down plus one headline figure. Nothing is invented: a failed
// read is "down", and a figure is only shown when the app returned it.

export interface LiveAppDef {
  id: "gods-eye" | "osiris" | "anatomy" | "sports";
  name: string;
  url: string;
  page: string;
  probe: string;
  source: string;
}

export interface LiveAppStatus {
  id: string;
  name: string;
  url: string;
  page: string;
  up: boolean;
  headline: string | null;
  source: string;
  checkedAt: string;
}

export const LIVE_APPS: LiveAppDef[] = [
  { id: "gods-eye", name: "God's Eye", url: "http://127.0.0.1:5173", page: "/apps/gods-eye", probe: "http://127.0.0.1:5173/api/military", source: "OpenSky / adsb.lol, CelesTrak, USGS, NOAA (keyless)" },
  { id: "osiris", name: "Osiris", url: "http://127.0.0.1:3005", page: "/apps/gods-eye", probe: "http://127.0.0.1:3005/api/stats", source: "ADS-B, CelesTrak, USGS, NASA EONET, GDELT (keyless)" },
  { id: "anatomy", name: "Body Anatomy", url: "http://127.0.0.1:5180", page: "/apps/anatomy", probe: "http://127.0.0.1:5180/", source: "Local 3D atlas (no live feed)" },
  { id: "sports", name: "Sports", url: "http://127.0.0.1:8800", page: "/apps/sports", probe: "http://127.0.0.1:8800/api/games", source: "ESPN public scoreboard, Polymarket public odds (keyless)" },
];

export function headlineFor(id: string, body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (id === "sports" && Array.isArray(record.games)) {
    const games = record.games as Array<{ state?: string }>;
    const live = games.filter((game) => game.state === "live").length;
    return `${live} live of ${games.length} games`;
  }
  if (id === "osiris" && record.stats && typeof record.stats === "object") {
    const stats = record.stats as Record<string, number>;
    if (typeof stats.flights === "number") return `${stats.flights.toLocaleString("en-US")} flights tracked`;
  }
  if (id === "gods-eye" && Array.isArray(record.ac)) {
    return `${record.ac.length} military aircraft live`;
  }
  return null;
}

async function probeOne(app: LiveAppDef, fetchImpl: typeof fetch): Promise<LiveAppStatus> {
  const base = { id: app.id, name: app.name, url: app.url, page: app.page, source: app.source, checkedAt: new Date().toISOString() };
  try {
    const res = await fetchImpl(app.probe, { signal: AbortSignal.timeout(15_000), cache: "no-store" } as RequestInit);
    if (!res.ok) return { ...base, up: false, headline: null };
    const type = res.headers.get("content-type") || "";
    const body = type.includes("json") ? await res.json().catch(() => null) : null;
    return { ...base, up: true, headline: headlineFor(app.id, body) };
  } catch {
    return { ...base, up: false, headline: null };
  }
}

let cache: { at: number; apps: LiveAppStatus[] } | null = null;

export async function liveAppsStatus(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<LiveAppStatus[]> {
  if (cache && now - cache.at < 20_000) return cache.apps;
  const apps = await Promise.all(LIVE_APPS.map((app) => probeOne(app, fetchImpl)));
  cache = { at: now, apps };
  return apps;
}