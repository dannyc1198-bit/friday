// Meta Glasses Vision Tools — Claw Vision for Meta Ray-Ban Gen 2
// Talks to the sidecar's /api/glasses/* endpoints.
// The sidecar watches ~/Pictures/Meta for new synced photos and runs Claude Vision.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

const SIDECAR_BASE = process.env.SIDECAR_URL || "http://localhost:3002";
const TIMEOUT_MS = 30_000;

function makeResult(success: boolean, data?: unknown, error?: string): ToolResult {
  return { toolCallId: "", success, data, error };
}

async function sidecarFetch(path: string, options?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${SIDECAR_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Sidecar ${response.status}: ${text.slice(0, 200)}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Sidecar request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Describe Last Glasses Capture ───────────────────────────────────────────

const glasses_describe: Tool = {
  name: "glasses_describe",
  description:
    "Describes what Danny's Meta Ray-Ban glasses last captured. " +
    "Returns the AI description of the most recent photo from the glasses. " +
    "Use this when asked 'what am I looking at?', 'what's in front of me?', or similar.",
  category: "glasses",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const data = (await sidecarFetch("/api/glasses/last")) as {
        ok: boolean;
        description?: string;
        captured_at?: string;
        image_path?: string;
        error?: string;
      };

      if (!data.ok) {
        return makeResult(
          false,
          undefined,
          data.error || "No glasses capture available. Take a photo with your Meta glasses first."
        );
      }

      return makeResult(true, {
        description: data.description,
        capturedAt: data.captured_at,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Glasses vision unavailable: ${error instanceof Error ? error.message : "Sidecar offline"}`
      );
    }
  },
};

// ─── Ask a Question About Last Capture ───────────────────────────────────────

const glasses_ask: Tool = {
  name: "glasses_ask",
  description:
    "Asks Claude a specific question about the last photo from Danny's Meta glasses. " +
    "Use for targeted queries like: 'What brand is this?', 'How many calories?', " +
    "'What does this sign say?', 'Is this ripe?', 'What wine is this?'",
  category: "glasses",
  parameters: [
    {
      name: "question",
      type: "string",
      description: "The specific question to ask about what the glasses last saw",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const question = params.question as string;

    try {
      const data = (await sidecarFetch("/api/glasses/ask", {
        method: "POST",
        body: JSON.stringify({ question }),
      })) as {
        ok: boolean;
        question?: string;
        answer?: string;
        error?: string;
      };

      if (!data.ok) {
        return makeResult(false, undefined, data.error || "Vision query failed");
      }

      return makeResult(true, {
        question: data.question,
        answer: data.answer,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Glasses ask failed: ${error instanceof Error ? error.message : "Sidecar offline"}`
      );
    }
  },
};

// ─── Glasses Vision Status ────────────────────────────────────────────────────

const glasses_status: Tool = {
  name: "glasses_status",
  description:
    "Checks the status of the Meta Glasses Vision watcher — whether it's running, " +
    "what folder it's watching, and when the last capture was.",
  category: "glasses",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const data = (await sidecarFetch("/api/glasses/status")) as {
        watching: boolean;
        sync_folder: string | null;
        folder_exists: boolean;
        files_seen: number;
        last_capture: string;
        last_capture_time: string;
        last_description: string;
      };

      return makeResult(true, {
        watching: data.watching,
        syncFolder: data.sync_folder,
        folderReady: data.folder_exists,
        filesSeen: data.files_seen,
        lastCapture: data.last_capture_time || "Never",
        lastDescription: data.last_description || "None yet",
        setupNote: !data.folder_exists
          ? "Folder not found — install Meta View or set GLASSES_SYNC_FOLDER in .env"
          : undefined,
      });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `Status check failed: ${error instanceof Error ? error.message : "Sidecar offline"}`
      );
    }
  },
};

// ─── Describe a Specific Image File ──────────────────────────────────────────

const glasses_describe_file: Tool = {
  name: "glasses_describe_file",
  description:
    "Runs Claude Vision on a specific image file path. Useful for analyzing " +
    "a specific older glasses capture or any photo on disk.",
  category: "glasses",
  parameters: [
    {
      name: "path",
      type: "string",
      description: "Absolute path to the image file (jpg, png)",
      required: true,
    },
    {
      name: "question",
      type: "string",
      description: "Optional specific question about the image",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const path = params.path as string;
    const question = (params.question as string) || "What do you see in this image?";

    try {
      const data = (await sidecarFetch("/api/glasses/describe-file", {
        method: "POST",
        body: JSON.stringify({ path, question }),
      })) as {
        ok: boolean;
        answer?: string;
        error?: string;
      };

      if (!data.ok) {
        return makeResult(false, undefined, data.error || "File vision failed");
      }

      return makeResult(true, { answer: data.answer, path, question });
    } catch (error) {
      return makeResult(
        false,
        undefined,
        `File vision failed: ${error instanceof Error ? error.message : "Sidecar offline"}`
      );
    }
  },
};

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerMetaGlassesTools(): void {
  toolRegistry.register(glasses_describe);
  toolRegistry.register(glasses_ask);
  toolRegistry.register(glasses_status);
  toolRegistry.register(glasses_describe_file);
}
