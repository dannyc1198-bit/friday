import { spawn } from "child_process";
import type { CommandResult, CommandRunner } from "./types.js";

const MAX_STDOUT = 80_000;
const MAX_STDERR = 20_000;

// cmd.exe metacharacters. Used only if a caller insists on a shell.
const SHELL_META = /[&|<>^%\u0000\r\n"]/;

/** Refuse a command line that could break out of the Windows .cmd shim. */
export function assertCommandArgs(cmd: string, args: string[], shell = false): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(cmd || "")) return "command name is not a bare executable";
  if (!shell) return null;
  for (const arg of args) {
    if (typeof arg !== "string" || SHELL_META.test(arg) || /\s/.test(arg)) {
      return "refusing shell metacharacters in command arguments";
    }
  }
  return null;
}

/**
 * Quote one Windows argument the way CommandLineToArgvW expects.
 * A value that contains spaces stays one argument, so `--hard` inside it
 * cannot become a top-level flag.
 */
export function quoteWindowsArg(value: string): string {
  if (value.length === 0) return '""';
  if (!/[\s\t"&|<>^%*]/.test(value)) return value;
  let quoted = '"';
  let slashes = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\") {
      slashes += 1;
      continue;
    }
    if (ch === '"') {
      quoted += "\\".repeat(slashes * 2 + 1) + '"';
      slashes = 0;
      continue;
    }
    if (slashes) {
      quoted += "\\".repeat(slashes);
      slashes = 0;
    }
    quoted += ch;
  }
  if (slashes) quoted += "\\".repeat(slashes * 2);
  quoted += '"';
  return quoted;
}

export function windowsCommandLine(cmd: string, args: string[]): string {
  return [cmd, ...args].map(quoteWindowsArg).join(" ");
}

/** Inverse of quoteWindowsArg, for tests that the flag order survives cmd.exe. */
export function splitWindowsCommandLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  let slashes = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && inQuotes) {
      slashes += 1;
      continue;
    }
    if (ch === '"') {
      const escaped = slashes % 2 === 1;
      current += "\\".repeat(Math.floor(slashes / 2));
      slashes = 0;
      if (escaped) current += '"';
      else inQuotes = !inQuotes;
      continue;
    }
    if (slashes) {
      current += "\\".repeat(slashes);
      slashes = 0;
    }
    if (!inQuotes && (ch === " " || ch === "\t")) {
      if (current.length) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (slashes) current += "\\".repeat(slashes);
  if (current.length) out.push(current);
  return out;
}

/** `git reset --hard <sha>` with the flag after the subcommand. */
export function gitResetHardArgs(sha: string): string[] {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new Error("Refusing to reset to an unexpected sha.");
  }
  return ["reset", "--hard", sha];
}

/** Codex reads the prompt as one argument. An open stdin makes it wait forever. */
export function codexExecArgs(task: string): string[] {
  return ["exec", "--skip-git-repo-check", "--color", "never", task];
}

export interface SpawnSpec {
  command: string;
  args: string[];
  shell: false;
  windowsVerbatimArguments: boolean;
  stdin: "pipe" | "ignore";
}

export function spawnSpec(
  cmd: string,
  args: string[],
  platform: string,
  stdin: "pipe" | "ignore" = "pipe"
): SpawnSpec {
  if (platform === "win32") {
    return {
      command: process.env.comspec || "cmd.exe",
      args: ["/d", "/s", "/c", windowsCommandLine(cmd, args)],
      shell: false,
      windowsVerbatimArguments: true,
      stdin,
    };
  }
  return {
    command: cmd,
    args,
    shell: false,
    windowsVerbatimArguments: false,
    stdin,
  };
}

/** Spawn a CLI without a shell. On Windows the command line is quoted so flags stay in order. */
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

    const unsafe = assertCommandArgs(cmd, args, false);
    if (unsafe) {
      finish({ code: null, stdout: "", stderr: "", error: unsafe });
      return;
    }

    const spec = spawnSpec(cmd, args, process.platform, opts.stdin || "pipe");
    let child;
    try {
      child = spawn(spec.command, spec.args, {
        cwd: opts.cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: spec.windowsVerbatimArguments,
        stdio: [spec.stdin, "pipe", "pipe"],
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

    if (spec.stdin === "pipe") {
      if (opts.input != null) child.stdin?.write(opts.input);
      child.stdin?.end();
    }
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
