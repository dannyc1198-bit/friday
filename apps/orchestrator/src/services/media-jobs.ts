// Media jobs the HUD polls. Long Meshy / Higgsfield / Blender work updates these
// in place. Missing credentials never throw.

import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import path from "path";
import { DATA_DIR } from "./runtime-paths.js";

export type MediaJobStatus = "queued" | "running" | "succeeded" | "failed" | "offline";

export interface MediaFile {
  name: string;
  label: string;
}

export interface MediaJob {
  id: string;
  kind: string;
  title: string;
  prompt: string;
  status: MediaJobStatus;
  progress: number;
  detail: string;
  files: MediaFile[];
  createdAt: string;
  updatedAt: string;
}

const jobs: MediaJob[] = [];

export function mediaDir(): string {
  const dir = process.env.FRIDAY_MEDIA_DIR?.trim()
    ? path.resolve(process.env.FRIDAY_MEDIA_DIR)
    : path.join(DATA_DIR, "media");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function listMediaJobs(): MediaJob[] {
  return jobs.slice(-40).reverse();
}

export function createMediaJob(input: { kind: string; title: string; prompt: string; detail?: string; status?: MediaJobStatus; progress?: number }): MediaJob {
  const now = new Date().toISOString();
  const job: MediaJob = {
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    prompt: input.prompt,
    status: input.status || "queued",
    progress: input.progress ?? (input.status === "offline" ? 0 : 1),
    detail: input.detail || "Queued",
    files: [],
    createdAt: now,
    updatedAt: now,
  };
  jobs.push(job);
  if (jobs.length > 40) jobs.splice(0, jobs.length - 40);
  return job;
}

export function updateMediaJob(id: string, patch: Partial<Pick<MediaJob, "status" | "progress" | "detail" | "files">>): MediaJob | null {
  const job = jobs.find((item) => item.id === id);
  if (!job) return null;
  if (patch.status) job.status = patch.status;
  if (typeof patch.progress === "number") job.progress = patch.progress;
  if (patch.detail) job.detail = patch.detail;
  if (patch.files) job.files = patch.files;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function findRecentJob(kind: string, prompt: string): MediaJob | undefined {
  const needle = prompt.trim().toLowerCase();
  return [...jobs].reverse().find((job) =>
    job.kind === kind &&
    job.prompt.trim().toLowerCase() === needle &&
    (job.status === "queued" || job.status === "running" || job.status === "succeeded" || job.status === "offline") &&
    Date.now() - new Date(job.createdAt).getTime() < 10 * 60_000
  );
}

export function latestModelFile(): string | null {
  for (const job of [...jobs].reverse()) {
    const model = job.files.find((file) => /\.(glb|fbx)$/i.test(file.name));
    if (model && (job.status === "succeeded")) return model.name;
  }
  return null;
}
