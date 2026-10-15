// Claude Code delegation tool — added 2026-05-05
//
// FRIDAY hands off code-intelligence work to the local `claude` CLI.
// Architecture: FRIDAY = front of house (voice, daily ops, fast tools);
// Claude Code = back of house (code understanding, multi-file edits, debugging).
//
// The task description is piped via stdin to avoid shell-escape pitfalls
// with arbitrary natural-language input. `--print` makes Claude Code
// non-interactive and prints only the final response.

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { dispatchAgent } from "../services/agents/registry.js";

const MIN_TIMEOUT_SEC = 30;
const MAX_TIMEOUT_SEC = 1800;
const DEFAULT_TIMEOUT_SEC = 300;
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

    const timeoutSec = Math.min(
      MAX_TIMEOUT_SEC,
      Math.max(MIN_TIMEOUT_SEC, Number(params.timeout_seconds) || DEFAULT_TIMEOUT_SEC)
    );
    const modelAlias = String(params.model ?? "").toLowerCase().trim();
    const startedAt = Date.now();
    const result = await dispatchAgent("claude-code", task, {
      workingDirectory: (params.working_directory as string) || undefined,
      timeoutMs: timeoutSec * 1000,
      model: modelAlias || undefined,
    });
    if (!result.ok) {
      return { toolCallId: "", success: false, error: result.summary };
    }
    const elapsedSec = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    return {
      toolCallId: "",
      success: true,
      data: {
        message: result.summary,
        full_output: result.output || "",
        elapsed_seconds: elapsedSec,
      },
    };
  },
};

export function registerClaudeCodeTools(): void {
  toolRegistry.register(delegateToClaudeCodeTool);
}
