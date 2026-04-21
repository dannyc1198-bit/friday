// Wavelength Business Context tools
// - wavelength_reload: invalidate the context cache (pick up .md edits immediately)
// - wavelength_show_context: peek at what FRIDAY currently knows (debugging)

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import {
  loadWavelengthContext,
  reloadWavelengthContext,
} from "../services/wavelength-context.js";

const wavelengthReloadTool: Tool = {
  name: "wavelength_reload",
  description:
    "Invalidate the cached Wavelength business context so FRIDAY re-reads the markdown file on the next business-intent request. Call this after Danny edits FRIDAY_BRAIN/wavelength-context.md in Obsidian.",
  category: "wavelength",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    reloadWavelengthContext();
    const body = await loadWavelengthContext();
    return {
      toolCallId: "",
      success: true,
      data: {
        success: true,
        loadedChars: body ? body.length : 0,
        message: body
          ? `Reloaded Wavelength context (${body.length} chars).`
          : "Reloaded — but context file is missing or empty.",
      },
    };
  },
};

const wavelengthShowContextTool: Tool = {
  name: "wavelength_show_context",
  description:
    "Return the first 500 characters of the currently loaded Wavelength business context — useful for debugging ('what does FRIDAY know about Wavelength right now?').",
  category: "wavelength",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    const body = await loadWavelengthContext();
    if (!body) {
      return {
        toolCallId: "",
        success: true,
        data: {
          loaded: false,
          preview: "",
          message:
            "No Wavelength context loaded (file missing, empty, or unreadable at FRIDAY_BRAIN/wavelength-context.md).",
        },
      };
    }
    const preview = body.slice(0, 500);
    return {
      toolCallId: "",
      success: true,
      data: {
        loaded: true,
        totalChars: body.length,
        preview,
        truncated: body.length > 500,
      },
    };
  },
};

export function registerWavelengthTools(): void {
  toolRegistry.register(wavelengthReloadTool);
  toolRegistry.register(wavelengthShowContextTool);
  console.log("  ✓ Wavelength context tools registered (reload, show_context)");
}
