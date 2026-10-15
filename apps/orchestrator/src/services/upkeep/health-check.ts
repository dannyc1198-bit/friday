// Nightly and repeated-failure diagnosis. Commands stay behind
// FRIDAY_HEALTHCHECK so a boot does not launch the whole suite by surprise.

import { spawn } from "node:child_process";
import { noteIncident } from "./journal.js";

export interface CheckResult {
  ok: boolean;
  summary: string;
}

export async function summarizeChecks(results: CheckResult[]): Promise<CheckResult> {
  if (results.length === 0) {
    return { ok: true, summary: "Health check armed. Set FRIDAY_HEALTHCHECK=1 to run typecheck and tests." };
  }
  const failed = results.filter((item) => !item.ok);
  if (failed.length === 0) return { ok: true, summary: results.map((item) => item.summary).join(" ") };
  return { ok: false, summary: failed.map((item) => item.summary).join(" ") };
}

export function healthCommands(env: NodeJS.ProcessEnv = process.env): string[][] {
  if (env.FRIDAY_HEALTHCHECK !== "1") return [];
  const commands = [["npx", "tsc", "--noEmit"]];
  if (env.FRIDAY_HEALTHCHECK_TESTS === "1") commands.push(["npm", "test"]);
  return commands;
}

export function runCommand(cwd: string, command: string[]): Promise<CheckResult> {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, shell: false });
    let output = "";
    const timer = setTimeout(() => child.kill(), 180_000);
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, summary: `${command[0]} failed to start: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const tail = output.trim().split("\n").slice(-3).join(" ").slice(0, 240);
      resolve({
        ok: code === 0,
        summary: code === 0 ? `${command[0]} passed.` : `${command[0]} exited ${code}. ${tail}`,
      });
    });
  });
}

export async function writeHealthSummary(healthDir: string, result: CheckResult, now = new Date()): Promise<void> {
  noteIncident(healthDir, {
    kind: "check",
    signature: result.ok ? "health-ok" : "health-failed",
    summary: result.summary,
  }, now);
}
