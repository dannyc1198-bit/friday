import type { AgentAdapter, AgentDeps, AgentStatus, DispatchResult } from "./types.js";
import { binaryMissing } from "./command.js";
import { resolveWorkdir } from "./workdir.js";

const PREVIEW = 240;

const MODEL_ALIASES: Record<string, string> = {
  fable: "claude-fable-5",
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export function claudeArgs(modelAlias?: string): string[] {
  const args = [
    "--print",
    "--permission-mode",
    "acceptEdits",
    "--disallowedTools",
    "Bash(git push *),Bash(git reset --hard *),Bash(rm -rf *)",
  ];
  const modelId = modelAlias ? MODEL_ALIASES[modelAlias.toLowerCase().trim()] : undefined;
  if (modelId) args.push("--model", modelId);
  return args;
}

export function createClaudeAdapter(deps: AgentDeps): AgentAdapter {
  return {
    id: "claude-code",
    kind: "claude-code",
    async list(): Promise<AgentStatus[]> {
      const hasKey = Boolean(deps.env.ANTHROPIC_API_KEY?.trim());
      let probed;
      try {
        probed = await deps.run("claude", ["--version"], { timeoutMs: 8_000 });
      } catch (err) {
        probed = { code: null, stdout: "", stderr: "", error: (err as Error).message };
      }
      const missing = binaryMissing(probed) || (probed.code === null && !probed.stdout.trim());
      if (missing) {
        const detail = hasKey
          ? "ANTHROPIC_API_KEY is set, but the claude CLI is not on PATH."
          : "Claude Code CLI is not on PATH. Install it and log in, or set ANTHROPIC_API_KEY for the CLI's own auth.";
        return [row("offline", detail, false)];
      }
      if (probed.code !== 0) {
        return [row("degraded", (probed.stderr || probed.error || "claude --version failed").slice(0, 180), true)];
      }
      const version = (probed.stdout || probed.stderr).trim().split("\n")[0] || "claude";
      return [row("online", version, true)];
    },
    async dispatch(_id, request): Promise<DispatchResult> {
      const cwd = resolveWorkdir(request.workingDirectory, deps.env);
      if (!cwd.ok) return { ok: false, state: "offline", summary: cwd.error };
      const timeoutMs = request.timeoutMs ?? 120_000;
      let result;
      try {
        result = await deps.run("claude", claudeArgs(request.model), {
          cwd: cwd.cwd,
          input: request.task,
          timeoutMs,
        });
      } catch (err) {
        return { ok: false, state: "offline", summary: `Failed to spawn claude CLI: ${(err as Error).message}` };
      }
      if (binaryMissing(result)) {
        return { ok: false, state: "offline", summary: "Failed to spawn claude CLI. Is Claude Code installed and on PATH?" };
      }
      if (result.timedOut) {
        return {
          ok: false,
          state: "degraded",
          summary: `Claude Code timed out after ${Math.round(timeoutMs / 1000)}s. Last output: ${result.stdout.slice(-400) || "(none)"}`,
        };
      }
      if (result.code !== 0) {
        return {
          ok: false,
          state: "degraded",
          summary: `Claude Code exited ${result.code}. stderr: ${(result.stderr || "(empty)").slice(-400)}`,
          output: result.stdout.slice(-4000),
        };
      }
      const output = result.stdout.trim();
      const preview = output.length > PREVIEW ? output.slice(0, PREVIEW) + "…" : output;
      return {
        ok: true,
        state: "online",
        summary: `Claude Code finished. Result: ${preview}`,
        output: output.slice(0, 20_000),
      };
    },
  };
}

function row(state: AgentStatus["state"], detail: string, canDispatch: boolean): AgentStatus {
  return {
    id: "claude-code",
    name: "Claude Code",
    kind: "claude-code",
    state,
    detail,
    render: "row",
    canDispatch,
  };
}
