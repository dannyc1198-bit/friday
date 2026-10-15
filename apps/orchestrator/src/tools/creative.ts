// Model-facing creative tools. Each one returns immediately with a job id.
// Missing keys are offline results, not exceptions.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { startMeshyImageTo3D, startMeshyTextTo3D } from "../services/creative/meshy.js";
import { startHiggsfieldImage, startHiggsfieldVideo } from "../services/creative/higgsfield.js";
import { startBlenderOpen, startBlenderRender } from "../services/creative/blender.js";
import type { MediaJob } from "../services/media-jobs.js";

function pack(job: MediaJob): ToolResult {
  const offline = job.status === "offline";
  return {
    toolCallId: "",
    success: true,
    data: {
      state: job.status,
      jobId: job.id,
      message: offline
        ? job.detail
        : `${job.title} is ${job.status}. Watch the media panel. Job ${job.id.slice(0, 8)}.`,
      detail: job.detail,
    },
  };
}

const textTo3d: Tool = {
  name: "meshy_text_to_3d",
  description: "Start a Meshy text-to-3D job and save GLB/FBX into the media folder. Returns immediately. Offline when MESHY_API_KEY is missing.",
  category: "creative",
  parameters: [
    { name: "prompt", type: "string", description: "What the 3D model is", required: true },
  ],
  execute: async (params) => pack(await startMeshyTextTo3D(String(params.prompt || ""))),
};

const imageTo3d: Tool = {
  name: "meshy_image_to_3d",
  description: "Start a Meshy image-to-3D job from an http(s) image URL. Offline when MESHY_API_KEY is missing.",
  category: "creative",
  parameters: [
    { name: "image_url", type: "string", description: "Public http(s) image URL", required: true },
  ],
  execute: async (params) => pack(await startMeshyImageTo3D(String(params.image_url || ""))),
};

const hfImage: Tool = {
  name: "higgsfield_image",
  description: "Start a Higgsfield image generation. Offline when HF_API_KEY_ID and HF_API_KEY_SECRET are missing.",
  category: "creative",
  parameters: [
    { name: "prompt", type: "string", description: "Image prompt", required: true },
  ],
  execute: async (params) => pack(await startHiggsfieldImage(String(params.prompt || ""))),
};

const hfVideo: Tool = {
  name: "higgsfield_video",
  description: "Start a Higgsfield text-to-video generation. Offline when Higgsfield keys are missing.",
  category: "creative",
  parameters: [
    { name: "prompt", type: "string", description: "Video prompt", required: true },
  ],
  execute: async (params) => pack(await startHiggsfieldVideo(String(params.prompt || ""))),
};

const blenderRender: Tool = {
  name: "blender_render",
  description: "Render a preview PNG of a media-folder GLB/FBX with Blender headless. Uses the latest model when file is omitted. Offline when Blender is not installed.",
  category: "creative",
  parameters: [
    { name: "file", type: "string", description: "Optional media file name, such as abc.glb", required: false },
  ],
  execute: async (params) => pack(startBlenderRender(params.file ? String(params.file) : undefined)),
};

const blenderOpen: Tool = {
  name: "blender_open",
  description: "Open Blender's GUI, optionally with a media-folder model. Offline when Blender is not installed.",
  category: "creative",
  parameters: [
    { name: "file", type: "string", description: "Optional media file name", required: false },
  ],
  execute: async (params) => pack(startBlenderOpen(params.file ? String(params.file) : undefined)),
};

export function registerCreativeTools(): void {
  toolRegistry.register(textTo3d);
  toolRegistry.register(imageTo3d);
  toolRegistry.register(hfImage);
  toolRegistry.register(hfVideo);
  toolRegistry.register(blenderRender);
  toolRegistry.register(blenderOpen);
}
