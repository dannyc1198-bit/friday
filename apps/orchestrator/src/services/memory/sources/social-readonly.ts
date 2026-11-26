import { requireGrantedOutgoing } from "../../effect-gate.js";
import { isPlaceholder, redactIngest, redactSecrets } from "../redact.js";
import type { PortItemInput } from "../port-db.js";

export interface SocialAccount {
  platform: string;
  configured: boolean;
  missing: string[];
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

function envValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim() || "";
  return isPlaceholder(value) ? "" : value;
}

export function socialAccounts(env: NodeJS.ProcessEnv = process.env): SocialAccount[] {
  const need = (names: string[]) => names.filter((name) => !envValue(env, name));
  return [
    { platform: "youtube", configured: need(["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"]).length === 0, missing: need(["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"]) },
    { platform: "x", configured: need(["X_BEARER_TOKEN"]).length === 0 && Boolean(envValue(env, "X_USERNAME") || envValue(env, "X_USER_ID")), missing: need(["X_BEARER_TOKEN"]).concat(envValue(env, "X_USERNAME") || envValue(env, "X_USER_ID") ? [] : ["X_USERNAME"]) },
    { platform: "instagram", configured: need(["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"]).length === 0, missing: need(["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"]) },
    { platform: "tiktok", configured: need(["TIKTOK_ACCESS_TOKEN"]).length === 0, missing: need(["TIKTOK_ACCESS_TOKEN"]) },
  ];
}

async function readJson(
  fetchImpl: FetchLike,
  url: string,
  secrets: string[],
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<unknown> {
  const method = (init?.method || "GET").toUpperCase();
  // TikTok's video list is a POST that only reads. Publish endpoints are not called.
  const effect = method === "GET" || url === "https://open.tiktokapis.com/v2/video/list/" ? "get" : method.toLowerCase();
  requireGrantedOutgoing(effect, "social-api", "");
  try {
    const response = await fetchImpl(url, init);
    if (!response.ok) throw new Error(`status ${response.status}`);
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new Error(redactSecrets(`Social read failed: ${message}`, secrets).slice(0, 200));
  }
}

export async function collectSocial(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
} = {}): Promise<{ items: PortItemInput[]; accounts: SocialAccount[]; errors: string[] }> {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || (fetch as unknown as FetchLike);
  const accounts = socialAccounts(env);
  const items: PortItemInput[] = [];
  const errors: string[] = [];

  const youtube = accounts.find((account) => account.platform === "youtube");
  if (youtube?.configured) {
    try {
      items.push(...(await pullYouTube(env, fetchImpl)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "YouTube read failed");
    }
  }
  const x = accounts.find((account) => account.platform === "x");
  if (x?.configured) {
    try {
      items.push(...(await pullX(env, fetchImpl)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "X read failed");
    }
  }
  const instagram = accounts.find((account) => account.platform === "instagram");
  if (instagram?.configured) {
    try {
      items.push(...(await pullInstagram(env, fetchImpl)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Instagram read failed");
    }
  }
  const tiktok = accounts.find((account) => account.platform === "tiktok");
  if (tiktok?.configured) {
    try {
      items.push(...(await pullTikTok(env, fetchImpl)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "TikTok read failed");
    }
  }
  return { items, accounts, errors };
}

function asItem(platform: string, id: string, title: string, body: string, stats: Record<string, unknown>): PortItemInput {
  const clean = redactIngest(`${title}\n${body}`).text;
  return {
    source: "social",
    externalId: `${platform}:${id}`,
    title: title.slice(0, 180) || platform,
    content: clean,
    kind: "episode",
    path: "",
    metadata: { platform, stats },
  };
}

async function pullYouTube(env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<PortItemInput[]> {
  const key = envValue(env, "YOUTUBE_API_KEY");
  const channel = envValue(env, "YOUTUBE_CHANNEL_ID");
  const search = (await readJson(
    fetchImpl,
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channel)}&maxResults=10&order=date&type=video&key=${encodeURIComponent(key)}`,
    [key]
  )) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; description?: string; publishedAt?: string } }> };
  return (search.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => asItem("youtube", item.id!.videoId!, item.snippet?.title || "video", item.snippet?.description || "", {
      publishedAt: item.snippet?.publishedAt || "",
    }));
}

async function pullX(env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<PortItemInput[]> {
  const token = envValue(env, "X_BEARER_TOKEN");
  const headers = { Authorization: `Bearer ${token}` };
  let userId = envValue(env, "X_USER_ID");
  if (!userId) {
    const username = envValue(env, "X_USERNAME");
    const user = (await readJson(fetchImpl, `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, [token], { headers })) as {
      data?: { id?: string };
    };
    userId = user.data?.id || "";
  }
  if (!userId) return [];
  const tweets = (await readJson(
    fetchImpl,
    `https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets?max_results=10&tweet.fields=created_at,public_metrics`,
    [token],
    { headers }
  )) as { data?: Array<{ id: string; text?: string; public_metrics?: Record<string, number> }> };
  return (tweets.data || []).map((tweet) => asItem("x", tweet.id, "post", tweet.text || "", tweet.public_metrics || {}));
}

async function pullInstagram(env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<PortItemInput[]> {
  const token = envValue(env, "INSTAGRAM_ACCESS_TOKEN");
  const userId = envValue(env, "INSTAGRAM_USER_ID");
  const media = (await readJson(
    fetchImpl,
    `https://graph.facebook.com/v21.0/${encodeURIComponent(userId)}/media?fields=id,caption,timestamp,like_count,comments_count,permalink&access_token=${encodeURIComponent(token)}`,
    [token]
  )) as { data?: Array<{ id: string; caption?: string; like_count?: number; comments_count?: number }> };
  return (media.data || []).map((item) => asItem("instagram", item.id, "post", item.caption || "", {
    likes: item.like_count || 0,
    comments: item.comments_count || 0,
  }));
}

async function pullTikTok(env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<PortItemInput[]> {
  const token = envValue(env, "TIKTOK_ACCESS_TOKEN");
  const body = (await readJson(fetchImpl, "https://open.tiktokapis.com/v2/video/list/", [token], {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_count: 10 }),
  })) as { data?: { videos?: Array<{ id: string; title?: string; video_description?: string; view_count?: number }> } };
  return (body.data?.videos || []).map((video) => asItem("tiktok", video.id, video.title || "video", video.video_description || "", {
    views: video.view_count || 0,
  }));
}
