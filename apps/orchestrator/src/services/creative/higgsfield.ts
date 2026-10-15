// Higgsfield image and video. Official REST API:
//   Authorization: Key HF_API_KEY_ID:HF_API_KEY_SECRET
//   POST https://api.higgsfield.ai/<model>
//   poll status_url until completed | failed | nsfw | canceled
// HIGGSFIELD_API_KEY=id:secret is accepted as a single-line alias.
// Missing credentials return an offline job.

import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { higgsfieldCredentials } from "./credentials.js";
import { createMediaJob, findRecentJob, mediaDir, updateMediaJob, type MediaJob } from "../media-jobs.js";

const API = "https://api.higgsfield.ai";
const DEFAULT_IMAGE = "higgsfield-ai/soul/v2/standard";
const DEFAULT_VIDEO = "kling-video/v3.0/std/text-to-video";

export async function startHiggsfieldImage(prompt: string, env = process.env, fetchImpl = fetch): Promise<MediaJob> {
  return start("higgsfield-image", "Higgsfield image", prompt, env.HIGGSFIELD_IMAGE_MODEL?.trim() || DEFAULT_IMAGE, env, fetchImpl);
}

export async function startHiggsfieldVideo(prompt: string, env = process.env, fetchImpl = fetch): Promise<MediaJob> {
  return start("higgsfield-video", "Higgsfield video", prompt, env.HIGGSFIELD_VIDEO_MODEL?.trim() || DEFAULT_VIDEO, env, fetchImpl);
}

async function start(
  kind: string,
  title: string,
  prompt: string,
  modelPath: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch
): Promise<MediaJob> {
  const clean = prompt.trim().slice(0, 2500);
  if (!clean) return createMediaJob({ kind, title, prompt: "", detail: "A prompt is required.", status: "offline" });
  const existing = findRecentJob(kind, clean);
  if (existing) return existing;
  if (!higgsfieldCredentials(env)) {
    return createMediaJob({
      kind,
      title,
      prompt: clean,
      status: "offline",
      detail: "needs key — set HF_API_KEY_ID and HF_API_KEY_SECRET",
    });
  }
  const job = createMediaJob({ kind, title, prompt: clean, detail: "Submitting" });
  void run(job.id, clean, modelPath, env, fetchImpl);
  return job;
}

async function run(jobId: string, prompt: string, modelPath: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<void> {
  const creds = higgsfieldCredentials(env);
  if (!creds) return;
  const headers = {
    Authorization: `Key ${creds.id}:${creds.secret}`,
    "Content-Type": "application/json",
  };
  try {
    const response = await fetchImpl(`${API}/${modelPath.replace(/^\//, "")}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(60_000),
    });
    const created = await response.json().catch(() => ({})) as { request_id?: string; status_url?: string; detail?: string };
    if (!response.ok) {
      updateMediaJob(jobId, { status: response.status === 401 ? "offline" : "failed", detail: created.detail || `Higgsfield ${response.status}` });
      return;
    }
    const statusUrl = created.status_url || (created.request_id ? `${API}/requests/${created.request_id}/status` : "");
    if (!statusUrl) {
      updateMediaJob(jobId, { status: "failed", detail: "Higgsfield did not return a status url." });
      return;
    }
    let delayMs = 2_000;
    for (let attempt = 0; attempt < 90; attempt++) {
      await delay(delayMs);
      delayMs = Math.min(delayMs * 1.4, 10_000);
      const statusResponse = await fetchImpl(statusUrl, { headers, signal: AbortSignal.timeout(30_000) });
      const body = await statusResponse.json().catch(() => ({})) as {
        status?: string;
        images?: { url?: string }[];
        video?: { url?: string };
      };
      const state = body.status || "queued";
      if (state === "completed") {
        const files = await saveOutputs(jobId, body, fetchImpl);
        updateMediaJob(jobId, { status: "succeeded", progress: 100, detail: "Ready", files });
        return;
      }
      if (state === "failed" || state === "nsfw" || state === "canceled") {
        updateMediaJob(jobId, { status: "failed", detail: `Higgsfield ${state}` });
        return;
      }
      updateMediaJob(jobId, { status: "running", progress: Math.min(95, 10 + attempt), detail: state });
    }
    updateMediaJob(jobId, { status: "failed", detail: "Timed out waiting for Higgsfield." });
  } catch (err) {
    updateMediaJob(jobId, { status: "failed", detail: (err as Error).message.slice(0, 240) });
  }
}

async function saveOutputs(
  jobId: string,
  body: { images?: { url?: string }[]; video?: { url?: string } },
  fetchImpl: typeof fetch
): Promise<{ name: string; label: string }[]> {
  const files: { name: string; label: string }[] = [];
  const image = body.images?.find((item) => item.url)?.url;
  if (image) {
    const name = `${jobId.slice(0, 8)}.jpg`;
    await download(image, name, fetchImpl);
    files.push({ name, label: "Image" });
  }
  if (body.video?.url) {
    const name = `${jobId.slice(0, 8)}.mp4`;
    await download(body.video.url, name, fetchImpl);
    files.push({ name, label: "Video" });
  }
  return files;
}

async function download(url: string, name: string, fetchImpl: typeof fetch): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) return;
  await pipeline(
    Readable.fromWeb(response.body as import("stream/web").ReadableStream),
    createWriteStream(path.join(mediaDir(), name))
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
