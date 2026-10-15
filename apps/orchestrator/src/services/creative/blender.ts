// Headless Blender 5.0. Missing executable is offline, never a throw.
// Preview script: apps/orchestrator/scripts/blender_preview.py

import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { blenderPath } from "./credentials.js";
import { isInsideRoot } from "../safe-path.js";
import { createMediaJob, latestModelFile, mediaDir, updateMediaJob, type MediaJob } from "../media-jobs.js";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "scripts", "blender_preview.py");

export function startBlenderRender(fileName?: string, env = process.env): MediaJob {
  const exe = blenderPath(env);
  if (unsafeExecutable(exe)) {
    return createMediaJob({
      kind: "blender-render",
      title: "Blender preview",
      prompt: fileName || "",
      status: "offline",
      detail: "BLENDER_PATH contains characters that are not allowed in an executable path.",
    });
  }
  if (!existsSync(exe)) {
    return createMediaJob({
      kind: "blender-render",
      title: "Blender preview",
      prompt: fileName || "",
      status: "offline",
      detail: `Blender not found at ${exe}. Set BLENDER_PATH.`,
    });
  }
  const name = safeMediaName(fileName) || latestModelFile();
  if (!name) {
    return createMediaJob({
      kind: "blender-render",
      title: "Blender preview",
      prompt: "",
      status: "failed",
      detail: "No GLB or FBX in the media folder yet.",
    });
  }
  const source = path.resolve(mediaDir(), name);
  const pngPath = path.resolve(mediaDir(), `${path.parse(name).name}-preview.png`);
  if (!isInsideRoot(mediaDir(), source) || !isInsideRoot(mediaDir(), pngPath)) {
    return createMediaJob({
      kind: "blender-render",
      title: "Blender preview",
      prompt: name,
      status: "failed",
      detail: "Model path is outside the media folder.",
    });
  }
  if (!existsSync(source)) {
    return createMediaJob({ kind: "blender-render", title: "Blender preview", prompt: name, status: "failed", detail: "That model file is not in the media folder." });
  }
  const png = path.basename(pngPath);
  const job = createMediaJob({ kind: "blender-render", title: "Blender preview", prompt: name, detail: "Rendering" });
  const child = spawn(exe, ["-b", "--python", SCRIPT, "--", source, pngPath], {
    shell: false,
    windowsHide: true,
    env: blenderEnv(env),
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-500);
  });
  child.on("error", (err) => updateMediaJob(job.id, { status: "failed", detail: err.message }));
  child.on("close", (code) => {
    if (code === 0 && existsSync(pngPath)) {
      updateMediaJob(job.id, { status: "succeeded", progress: 100, detail: "Preview rendered", files: [{ name: png, label: "Preview" }] });
    } else {
      updateMediaJob(job.id, { status: "failed", detail: stderr || `Blender exited ${code}` });
    }
  });
  return job;
}

export function startBlenderOpen(fileName?: string, env = process.env): MediaJob {
  const exe = blenderPath(env);
  if (unsafeExecutable(exe)) {
    return createMediaJob({
      kind: "blender-open",
      title: "Blender",
      prompt: fileName || "",
      status: "offline",
      detail: "BLENDER_PATH contains characters that are not allowed in an executable path.",
    });
  }
  if (!existsSync(exe)) {
    return createMediaJob({
      kind: "blender-open",
      title: "Blender",
      prompt: fileName || "",
      status: "offline",
      detail: `Blender not found at ${exe}. Set BLENDER_PATH.`,
    });
  }
  const name = safeMediaName(fileName) || latestModelFile();
  const source = name ? path.resolve(mediaDir(), name) : "";
  const args = source && isInsideRoot(mediaDir(), source) && existsSync(source) ? [source] : [];
  const child = spawn(exe, args, { shell: false, detached: true, stdio: "ignore", env: blenderEnv(env) });
  child.on("error", () => {});
  child.unref();
  return createMediaJob({
    kind: "blender-open",
    title: "Blender",
    prompt: name || "",
    status: "succeeded",
    progress: 100,
    detail: name ? `Opened ${name}` : "Opened Blender",
  });
}

function unsafeExecutable(exe: string): boolean {
  return /[&|<>^%\r\n"]/.test(exe);
}

function blenderEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(next)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|PASSWD/i.test(key)) delete next[key];
  }
  return next;
}

function safeMediaName(fileName?: string): string | null {
  if (!fileName) return null;
  const base = path.basename(fileName);
  if (!/^[\w.-]+\.(glb|fbx|png|mp4|jpg)$/i.test(base)) return null;
  return base;
}
