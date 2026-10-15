import { spawn } from "child_process";
import type { CommandResult, CommandRunner } from "./types.js";

const MAX_STDOUT = 80_000;
const MAX_STDERR = 20_000;

/** Spawn a CLI. shell is only enabled on Windows so .cmd shims resolve; the task itself goes on stdin, not the command line. */
export const runCommand: CommandRunner = (cmd, args, opts) => {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: process.env,
        shell: process.platform === "win32",
        windowsHide: true,
      });
    } catch (err) {
      finish({ code: null, stdout: "", stderr: "", error: (err as Error).message });
      return;
    }

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        code: null,
        stdout,
        stderr,
        timedOut: true,
        error: `timed out after ${opts.timeoutMs}ms`,
      });
    }, opts.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_STDOUT) stdout = stdout.slice(-MAX_STDOUT);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_STDERR) stderr = stderr.slice(-MAX_STDERR);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      finish({ code: null, stdout, stderr, error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ code, stdout, stderr });
    });

    if (opts.input != null) child.stdin?.write(opts.input);
    child.stdin?.end();
  });
};

export function binaryMissing(result: CommandResult): boolean {
  const blob = `${result.error || ""} ${result.stderr}`.toLowerCase();
  return (
    blob.includes("enoent") ||
    blob.includes("not found") ||
    blob.includes("not recognized") ||
    blob.includes("no such file")
  );
}
