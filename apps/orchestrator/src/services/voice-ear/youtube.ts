// YouTube search for "play <song>". Uses the Data API when YOUTUBE_API_KEY
// is set, otherwise yt-dlp's keyless ytsearch1. A missing key or binary
// returns needsKey and never throws.

export interface YoutubeHit {
  title: string;
  videoId: string;
  url: string;
  embedUrl: string;
  source: "youtube-api" | "yt-dlp";
}

export type YoutubeResult =
  | { ok: true; hit: YoutubeHit }
  | { ok: false; needsKey: boolean; error: string };

export interface CommandOutput {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface YoutubeDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  run?: (cmd: string, args: string[]) => Promise<CommandOutput>;
}

const NEEDS_KEY = "needs key — set YOUTUBE_API_KEY, or install yt-dlp";

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function embedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
}

export async function resolveYouTube(query: string, deps: YoutubeDeps = {}): Promise<YoutubeResult> {
  const q = query.trim();
  if (!q) return { ok: false, needsKey: false, error: "Tell me what to play." };

  const apiKey = deps.apiKey?.trim();
  if (apiKey) {
    const hit = await fromApi(q, apiKey, deps.fetchImpl || fetch);
    if (hit) return { ok: true, hit };
  }

  if (!deps.run) {
    return { ok: false, needsKey: !apiKey, error: apiKey ? "YouTube search failed." : NEEDS_KEY };
  }

  let output: CommandOutput;
  try {
    output = await deps.run("yt-dlp", [
      "--flat-playlist",
      "--no-warnings",
      "--print",
      "%(id)s\t%(title)s",
      `ytsearch1:${q}`,
    ]);
  } catch (err) {
    output = { code: null, stdout: "", stderr: "", error: (err as Error).message };
  }

  const parsed = parseYtDlp(output.stdout, q);
  if (output.code === 0 && parsed) {
    return { ok: true, hit: { ...parsed, source: "yt-dlp" } };
  }

  const missing = output.code === null || /ENOENT|not found|not recognized/i.test(`${output.error || ""} ${output.stderr}`);
  if (!apiKey && missing) return { ok: false, needsKey: true, error: NEEDS_KEY };
  const detail = (output.error || output.stderr || "YouTube search failed.").trim().slice(0, 180);
  return { ok: false, needsKey: false, error: detail || "YouTube search failed." };
}

async function fromApi(query: string, apiKey: string, fetchImpl: typeof fetch): Promise<YoutubeHit | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = await response.json() as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string } }>;
    };
    const item = body.items?.[0];
    const videoId = item?.id?.videoId || "";
    if (!validId(videoId)) return null;
    return {
      title: item?.snippet?.title?.trim() || query,
      videoId,
      url: watchUrl(videoId),
      embedUrl: embedUrl(videoId),
      source: "youtube-api",
    };
  } catch {
    return null;
  }
}

function parseYtDlp(stdout: string, query: string): Omit<YoutubeHit, "source"> | null {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("WARNING")) continue;
    const [id, title] = trimmed.split("\t");
    const videoId = (id || "").trim();
    if (!validId(videoId)) continue;
    return {
      title: (title || query).trim(),
      videoId,
      url: watchUrl(videoId),
      embedUrl: embedUrl(videoId),
    };
  }
  return null;
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9_-]{6,20}$/.test(id);
}
