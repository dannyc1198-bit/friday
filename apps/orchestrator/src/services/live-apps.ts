// The local apps Friday oversees. Each probe reads a small live endpoint and
// reports up or down plus one headline figure. Nothing is invented: a failed
// read is "down", and a figure is only shown when the app returned it.

export interface LiveAppDef {
  id: "gods-eye" | "osiris" | "anatomy" | "sports" | "xrp-desk";
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
  { id: "xrp-desk", name: "XRP Desk", url: "http://127.0.0.1:8950", page: "/apps/xrp", probe: "http://127.0.0.1:8950/api/digest", source: "CoinGecko, Google News RSS, CoinDesk, Cointelegraph, Decrypt, Yahoo chart (keyless)" },
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
  if (id === "xrp-desk" && record.xrp && typeof record.xrp === "object") {
    const xrp = record.xrp as { price?: unknown; change24h?: unknown; stale?: unknown };
    if (typeof xrp.price !== "number") return null;
    const price = `XRP $${xrp.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    const change = typeof xrp.change24h === "number" ? ` (${xrp.change24h >= 0 ? "+" : ""}${xrp.change24h.toFixed(2)}% 24h)` : "";
    return `${price}${change}${xrp.stale ? ", stale" : ""}`;
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
const APP_WORDS: Array<[LiveAppDef["id"], RegExp]> = [
  ["gods-eye", /god'?s eye|gods eye|god eye/i],
  ["osiris", /osiris/i],
  ["anatomy", /anatomy|body atlas/i],
  ["sports", /sports?( dashboard| app)?\b/i],
  ["xrp-desk", /\bxrp( desk)?\b|\bripple\b/i],
];

// "Is God's Eye up?", "open anatomy", "status of the apps". Answered from the
// live probe, never from a model guess. Returns null for anything else.
export function appsQuestion(message: string): { ids: string[]; open: boolean } | null {
  const text = message.toLowerCase();
  const ids = APP_WORDS.filter(([, re]) => re.test(text)).map(([id]) => id);
  const allApps = /\b(the |my |all )?(live )?apps\b/.test(text);
  const open = /^\s*(friday,? )?(open|show( me)?|go to|bring up)\b/.test(text);
  const status = /\b(up|down|running|online|offline|working|status|live)\b/.test(text);
  if ((ids.length || allApps) && (open || status) && text.split(/\s+/).length <= 14) {
    return { ids: ids.length ? ids : LIVE_APPS.map((app) => app.id), open };
  }
  return null;
}

export function describeApps(apps: LiveAppStatus[], open: boolean): string {
  const lines = apps.map((app) => {
    const state = app.up ? `up${app.headline ? `, ${app.headline}` : ""}` : "down (not answering)";
    return open ? `${app.name} is ${state}. It's on the ${app.page} tab.` : `${app.name} is ${state}.`;
  });
  return lines.join(" ");
}

export async function liveAppsAnswer(message: string): Promise<string | null> {
  const question = appsQuestion(message);
  if (!question) return null;
  const apps = (await liveAppsStatus()).filter((app) => question.ids.includes(app.id));
  return describeApps(apps, question.open);
}
