import type { AgentAdapter, AgentDeps, AgentStatus, DispatchResult } from "./types.js";
import { binaryMissing, codexExecArgs } from "./command.js";
import { resolveWorkdir } from "./workdir.js";

const PREVIEW = 240;

export function createCodexAdapter(deps: AgentDeps): AgentAdapter {
  return {
    id: "codex",
    kind: "codex",
    async list(): Promise<AgentStatus[]> {
      const hasKey = Boolean(deps.env.OPENAI_API_KEY?.trim());
      let probed;
      try {
        probed = await deps.run("codex", ["--version"], { timeoutMs: 8_000 });
      } catch (err) {
        probed = { code: null, stdout: "", stderr: "", error: (err as Error).message };
      }
      const missing = binaryMissing(probed) || (probed.code === null && !probed.stdout.trim());
      if (missing) {
        const detail = hasKey
          ? "OPENAI_API_KEY is set, but the codex CLI is not on PATH."
          : "Codex CLI is not on PATH and OPENAI_API_KEY is not set.";
        return [row("offline", detail, false)];
      }
      if (probed.code !== 0) {
        return [row("degraded", (probed.stderr || probed.error || "codex --version failed").slice(0, 180), true)];
      }
      const version = (probed.stdout || probed.stderr).trim().split("\n")[0] || "codex";
      const detail = hasKey ? version : `${version} (CLI auth; OPENAI_API_KEY not set in env)`;
      return [row("online", detail, true)];
    },
    async dispatch(_id, request): Promise<DispatchResult> {
      const cwd = resolveWorkdir(request.workingDirectory, deps.env);
      if (!cwd.ok) return { ok: false, state: "offline", summary: cwd.error };
      const timeoutMs = request.timeoutMs ?? 120_000;
      let result;
      try {
        // The task is one argv. Stdin is closed so Codex does not wait on
        // "Reading additional input from stdin".
        result = await deps.run("codex", codexExecArgs(request.task), {
          cwd: cwd.cwd,
          timeoutMs,
          stdin: "ignore",
        });
      } catch (err) {
        return { ok: false, state: "offline", summary: `Failed to spawn codex: ${(err as Error).message}` };
      }
      if (binaryMissing(result)) {
        return { ok: false, state: "offline", summary: "Codex CLI is not on PATH." };
      }
      if (result.timedOut) {
        return { ok: false, state: "degraded", summary: `Codex timed out after ${Math.round(timeoutMs / 1000)}s`, output: result.stdout.slice(-2000) };
      }
      if (result.code !== 0) {
        return {
          ok: false,
          state: "degraded",
          summary: `Codex exited ${result.code}. ${(result.stderr || result.error || "").slice(-300)}`,
          output: result.stdout.slice(-4000),
        };
      }
      const output = result.stdout.trim();
      const preview = output.length > PREVIEW ? output.slice(0, PREVIEW) + "…" : output;
      return { ok: true, state: "online", summary: preview || "Codex finished with no output.", output: output.slice(0, 20_000) };
    },
  };
}

function row(state: AgentStatus["state"], detail: string, canDispatch: boolean): AgentStatus {
  return {
    id: "codex",
    name: "Codex CLI",
    kind: "codex",
    state,
    detail,
    render: "row",
    canDispatch,
  };
}
