// Meshy text-to-3D and image-to-3D. Tasks are polled in the background and
// GLB/FBX files land in the media folder. No key → offline job, no throw.

import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import { meshyKey } from "./credentials.js";
import { createMediaJob, findRecentJob, mediaDir, updateMediaJob, type MediaJob } from "../media-jobs.js";

const API = "https://api.meshy.ai";

interface MeshyTask {
  status?: string;
  progress?: number;
  model_urls?: { glb?: string; fbx?: string };
  task_error?: { message?: string };
}

export async function startMeshyTextTo3D(prompt: string, env = process.env, fetchImpl = fetch): Promise<MediaJob> {
  const clean = prompt.trim().slice(0, 800);
  if (!clean) return offline("meshy-text", "3D model", "A prompt is required.");
  const existing = findRecentJob("meshy-text", clean);
  if (existing) return existing;
  if (!meshyKey(env)) return offline("meshy-text", clean, "needs key — set MESHY_API_KEY");
  const job = createMediaJob({ kind: "meshy-text", title: "Meshy 3D", prompt: clean, detail: "Submitting preview" });
  void runText(job.id, clean, env, fetchImpl);
  return job;
}

export async function startMeshyImageTo3D(imageUrl: string, env = process.env, fetchImpl = fetch): Promise<MediaJob> {
  const url = imageUrl.trim();
  if (!/^https?:\/\//i.test(url)) return offline("meshy-image", "Image to 3D", "image_url must be an http(s) URL.");
  if (!meshyKey(env)) return offline("meshy-image", url, "needs key — set MESHY_API_KEY");
  const job = createMediaJob({ kind: "meshy-image", title: "Meshy image to 3D", prompt: url, detail: "Submitting image" });
  void runImage(job.id, url, env, fetchImpl);
  return job;
}

function offline(kind: string, prompt: string, detail: string): MediaJob {
  return createMediaJob({ kind, title: "Meshy", prompt, detail, status: "offline" });
}

async function runText(jobId: string, prompt: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<void> {
  try {
    const created = await postMeshy("/openapi/v2/text-to-3d", { mode: "preview", prompt }, env, fetchImpl);
    if (!created) return fail(jobId, "Meshy did not return a task id.");
    const preview = await poll(`/openapi/v2/text-to-3d/${created}`, env, fetchImpl, jobId);
    if (preview.status !== "SUCCEEDED") return fail(jobId, preview.task_error?.message || preview.status || "preview failed");
    const refined = await postMeshy("/openapi/v2/text-to-3d", { mode: "refine", preview_task_id: created }, env, fetchImpl);
    const finalTask = refined
      ? await poll(`/openapi/v2/text-to-3d/${refined}`, env, fetchImpl, jobId)
      : preview;
    if (finalTask.status !== "SUCCEEDED") return fail(jobId, finalTask.task_error?.message || "refine failed");
    await downloadModels(jobId, finalTask, fetchImpl);
  } catch (err) {
    fail(jobId, (err as Error).message);
  }
}

async function runImage(jobId: string, imageUrl: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<void> {
  try {
    const created = await postMeshy("/openapi/v1/image-to-3d", { image_url: imageUrl }, env, fetchImpl);
    if (!created) return fail(jobId, "Meshy did not return a task id.");
    const task = await poll(`/openapi/v1/image-to-3d/${created}`, env, fetchImpl, jobId);
    if (task.status !== "SUCCEEDED") return fail(jobId, task.task_error?.message || task.status || "image-to-3d failed");
    await downloadModels(jobId, task, fetchImpl);
  } catch (err) {
    fail(jobId, (err as Error).message);
  }
}

async function postMeshy(pathname: string, body: Record<string, unknown>, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<string | null> {
  const key = meshyKey(env);
  if (!key) return null;
  const response = await fetchImpl(`${API}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => ({})) as { result?: string };
  if (!response.ok) throw new Error(`Meshy ${response.status}`);
  return payload.result || null;
}

async function poll(pathname: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch, jobId: string): Promise<MeshyTask> {
  const key = meshyKey(env);
  for (let attempt = 0; attempt < 80; attempt++) {
    const response = await fetchImpl(`${API}${pathname}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });
    const task = await response.json().catch(() => ({})) as MeshyTask;
    const progress = typeof task.progress === "number" ? task.progress : 0;
    updateMediaJob(jobId, { status: "running", progress, detail: task.status || "working" });
    if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELED") return task;
    await delay(5_000);
  }
  return { status: "FAILED", task_error: { message: "Timed out waiting for Meshy." } };
}

async function downloadModels(jobId: string, task: MeshyTask, fetchImpl: typeof fetch): Promise<void> {
  const files: { name: string; label: string }[] = [];
  for (const [label, url] of Object.entries(task.model_urls || {})) {
    if ((label !== "glb" && label !== "fbx") || !url) continue;
    const name = `${jobId.slice(0, 8)}.${label}`;
    await downloadToMedia(url, name, fetchImpl);
    files.push({ name, label: label.toUpperCase() });
  }
  updateMediaJob(jobId, {
    status: "succeeded",
    progress: 100,
    detail: files.length ? "Model saved" : "Meshy finished without a GLB or FBX url",
    files,
  });
}

async function downloadToMedia(url: string, name: string, fetchImpl: typeof fetch): Promise<void> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Refusing a non-http model url");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  const destination = path.join(mediaDir(), name);
  await pipeline(Readable.fromWeb(response.body as import("stream/web").ReadableStream), createWriteStream(destination));
}

function fail(jobId: string, detail: string): void {
  updateMediaJob(jobId, { status: "failed", detail: detail.slice(0, 240) });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
