// Phase 4 — Screen Reader via Claude Vision
// Takes a screenshot → sends to Claude Vision → returns description/answer
// Rate limited: max 10 reads per minute (vision API is expensive)

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { config } from "../config/index.js";
import { toolRegistry } from "./registry.js";
import type { Tool } from "../types/index.js";
import { SCREENSHOT_DIR } from "./browser-control.js";

// ── Rate Limiting ──────────────────────────────────────────────────
const RATE_LIMIT = 10; // max per minute
const RATE_WINDOW_MS = 60_000;
const readTimestamps: number[] = [];

function checkRateLimit(): boolean {
  const now = Date.now();
  // Remove timestamps older than the window
  while (readTimestamps.length > 0 && readTimestamps[0] < now - RATE_WINDOW_MS) {
    readTimestamps.shift();
  }
  if (readTimestamps.length >= RATE_LIMIT) return false;
  readTimestamps.push(now);
  return true;
}

// ── Screenshot Capture ─────────────────────────────────────────────
// Takes a desktop screenshot using PowerShell (reuses PC control approach)
function takeDesktopScreenshot(): string {
  const timestamp = Date.now();
  const filepath = join(SCREENSHOT_DIR, `screen-${timestamp}.png`);

  // Ensure screenshot directory exists
  if (!existsSync(SCREENSHOT_DIR)) {
    execFileSync("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      `New-Item -ItemType Directory -Force -Path '${SCREENSHOT_DIR}'`,
    ]);
  }

  // Use PowerShell to capture the primary screen
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save('${filepath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;

  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
    timeout: 10000,
  });

  return filepath;
}

// ── Vision Analysis ────────────────────────────────────────────────
async function analyzeScreenshot(
  screenshotPath: string,
  question: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  const imageData = readFileSync(screenshotPath).toString("base64");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageData,
            },
          },
          {
            type: "text",
            text: question,
          },
        ],
      },
    ],
  });

  // Extract text from response
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "Unable to analyze the screenshot.";
}

// ── Tool Definitions ───────────────────────────────────────────────
const CATEGORY = "Browser Control";

const readScreenTool: Tool = {
  name: "read_screen",
  description:
    "Take a screenshot of the entire desktop and describe what is visible. " +
    "Optionally answer a specific question about the screen content. Rate limited to 10/min.",
  category: CATEGORY,
  parameters: [
    {
      name: "question",
      type: "string",
      description: "Specific question about what's on screen (default: general description)",
      required: false,
    },
  ],
  execute: async (params) => {
    if (!checkRateLimit()) {
      return {
        toolCallId: "",
        success: false,
        error: "Rate limit: max 10 screen reads per minute. Try again shortly.",
      };
    }

    const question =
      (params.question as string) ||
      "What is on this screen? Describe the main content, application, and any notable elements accurately and concisely.";

    try {
      const screenshotPath = takeDesktopScreenshot();
      const description = await analyzeScreenshot(screenshotPath, question);

      // Clean up screenshot after use (no permanent storage per security audit)
      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(screenshotPath);
      } catch {
        // Cleanup failure is non-critical
      }

      return {
        toolCallId: "",
        success: true,
        data: { description, question },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Screen read failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

const readBrowserScreenTool: Tool = {
  name: "read_browser_screen",
  description:
    "Take a screenshot of the current browser page (controlled by Playwright) and describe/analyze it. " +
    "More targeted than read_screen — only captures the browser viewport.",
  category: CATEGORY,
  parameters: [
    {
      name: "question",
      type: "string",
      description: "Specific question about the browser page content",
      required: false,
    },
  ],
  execute: async (params) => {
    if (!checkRateLimit()) {
      return {
        toolCallId: "",
        success: false,
        error: "Rate limit: max 10 screen reads per minute.",
      };
    }

    const question =
      (params.question as string) ||
      "Describe this web page. What is the main content? Note any buttons, forms, or interactive elements.";

    try {
      // Import dynamically to avoid circular dependency
      const { getPage } = await import("./browser-control.js");
      const page = await getPage();

      const timestamp = Date.now();
      const filepath = join(SCREENSHOT_DIR, `browser-${timestamp}.png`);
      await page.screenshot({ path: filepath });

      const description = await analyzeScreenshot(filepath, question);

      // Clean up
      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(filepath);
      } catch {
        // Non-critical
      }

      return {
        toolCallId: "",
        success: true,
        data: { description, question, url: page.url(), title: await page.title() },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Browser screen read failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// ── Registration ───────────────────────────────────────────────────
export function registerScreenReaderTools(): void {
  toolRegistry.register(readScreenTool);
  toolRegistry.register(readBrowserScreenTool);
}
