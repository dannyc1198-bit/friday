// Claude Code delegation tool — added 2026-05-05
//
// FRIDAY hands off code-intelligence work to the local `claude` CLI.
// Architecture: FRIDAY = front of house (voice, daily ops, fast tools);
// Claude Code = back of house (code understanding, multi-file edits, debugging).
//
// The task description is piped via stdin to avoid shell-escape pitfalls
// with arbitrary natural-language input. `--print` makes Claude Code
// non-interactive and prints only the final response.

import { spawn } from "child_process";
import path from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

// FRIDAY repo root — default working directory for delegations.
// Resolved relative to this file: tools/claude-code.ts → ../../../../
const FRIDAY_REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");

const MIN_TIMEOUT_SEC = 30;
const MAX_TIMEOUT_SEC = 1800;
const DEFAULT_TIMEOUT_SEC = 300;
const MAX_OUTPUT_PREVIEW = 240;

// Friendly aliases → actual Claude model IDs.
// Omitting `model` lets the claude CLI pick its default (Haiku).
const MODEL_ALIASES: Record<string, string> = {
  fable: "claude-fable-5",
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

const delegateToClaudeCodeTool: Tool = {
  name: "delegate_to_claude_code",
  description:
    "Delegate to Claude Code when the task requires CODE INTELLIGENCE: " +
    "understanding existing code, designing changes, writing new modules, " +
    "debugging, or running tests. Do NOT delegate for: single-file reads, " +
    "running a known shell command, browser navigation, or anything your own " +
    "tools handle directly. " +
    "Tell the user 'On it, boss' before calling — Claude Code takes 10-60 seconds. " +
    "Summarize the result in ONE sentence; do not read the full output aloud. " +
    "Choose the model with the `model` param: 'fable' for the hardest problems " +
    "(architecture, novel debugging, multi-file refactors — newest flagship); 'opus' " +
    "for hard problems; 'haiku' for trivial mechanical work " +
    "(rename, format, simple lint fix); omit for routine code (defaults to Sonnet).",
  category: "delegation",
  parameters: [
    {
      name: "task",
      type: "string",
      description:
        "Complete task description for Claude Code. Include all context — " +
        "Claude Code has no memory of FRIDAY's conversation. Be specific " +
        "about files, behaviors, and acceptance criteria.",
      required: true,
    },
    {
      name: "working_directory",
      type: "string",
      description:
        "Absolute path to the project directory Claude Code should work in. " +
        "Defaults to FRIDAY's repo root. Override only when working on a different project.",
      required: false,
    },
    {
      name: "timeout_seconds",
      type: "number",
      description: `Max seconds to wait. Default ${DEFAULT_TIMEOUT_SEC} (5 min). Range: ${MIN_TIMEOUT_SEC}-${MAX_TIMEOUT_SEC}.`,
      required: false,
    },
    {
      name: "model",
      type: "string",
      description:
        "Which Claude model to use. 'fable' = newest flagship, best reasoning (hardest problems). " +
        "'opus' = strong reasoning, ~5× Sonnet cost (hard problems). " +
        "'sonnet' = explicit Sonnet (same as default). " +
        "'haiku' = fastest, cheapest (trivial mechanical work). " +
        "Omit to let Claude Code pick its default (Sonnet).",
      required: false,
      enum: ["fable", "opus", "sonnet", "haiku"],
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const task = String(params.task ?? "").trim();
    if (!task) {
      return { toolCallId: "", success: false, error: "task is required" };
    }

    const cwd = (params.working_directory as string) || FRIDAY_REPO_ROOT;
    const timeoutSec = Math.min(
      MAX_TIMEOUT_SEC,
      Math.max(MIN_TIMEOUT_SEC, Number(params.timeout_seconds) || DEFAULT_TIMEOUT_SEC)
    );

    // Resolve friendly model alias → CLI flag. Unknown alias = silently use default.
    const modelAlias = String(params.model ?? "").toLowerCase().trim();
    const modelId = MODEL_ALIASES[modelAlias];
    const cliArgs = ["--print", "--dangerously-skip-permissions"];
    if (modelId) cliArgs.push("--model", modelId);

    return new Promise<ToolResult>((resolve) => {
      const startedAt = Date.now();
      let stdout = "";
      let stderr = "";
      let killed = false;

      // shell:true is required on Windows so PATH lookup finds claude.cmd.
      // Args are not interpolated from `task` (passed via stdin), so no
      // shell-injection vector through the prompt content.
      const child = spawn("claude", cliArgs, {
        cwd,
        env: process.env,
        shell: process.platform === "win32",
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGTERM");
      }, timeoutSec * 1000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          toolCallId: "",
          success: false,
          error: `Failed to spawn claude CLI: ${err.message}. Is Claude Code installed and on PATH?`,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

        if (killed) {
          resolve({
            toolCallId: "",
            success: false,
            error: `Claude Code timed out after ${timeoutSec}s. Last output: ${stdout.slice(-400) || "(none)"}`,
          });
          return;
        }

        if (code !== 0) {
          resolve({
            toolCallId: "",
            success: false,
            error: `Claude Code exited ${code} after ${elapsedSec}s. stderr: ${stderr.slice(-400) || "(empty)"}`,
          });
          return;
        }

        const output = stdout.trim();
        const preview =
          output.length > MAX_OUTPUT_PREVIEW
            ? output.slice(0, MAX_OUTPUT_PREVIEW) + "…"
            : output;

        resolve({
          toolCallId: "",
          success: true,
          data: {
            message: `Claude Code finished in ${elapsedSec}s. Result: ${preview}`,
            full_output: output,
            cwd,
            elapsed_seconds: Number(elapsedSec),
          },
        });
      });

      child.stdin.write(task);
      child.stdin.end();
    });
  },
};

export function registerClaudeCodeTools(): void {
  toolRegistry.register(delegateToClaudeCodeTool);
}
