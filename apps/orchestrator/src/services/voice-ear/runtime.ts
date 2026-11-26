// Wires the voice ear to Friday's tools, YouTube, the brain, and the coding
// adapters. Git push is not a function here.

import { spawn } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dispatchAgent } from "../agents/registry.js";
import { activeEndpoint, endpointClient, resolveLlmChain } from "../llm-chain.js";
import { REPO_ROOT } from "../runtime-paths.js";
import { toolRegistry } from "../../tools/registry.js";
import { allowedAppNames, resolveAllowedApp } from "../../tools/pc-control.js";
import { createDispatchCodingBackend, createOpenAiCompatibleBackend, selectCodingBackend } from "./coding.js";
import { VOICE_BRAIN_PROMPT } from "./intent.js";
import { createVoiceEar } from "./session.js";
import { resolveYouTube, type CommandOutput } from "./youtube.js";

const CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../sidecar/voice-ear.config.json"
);

const DEFAULT_APPS = [
  "chrome", "firefox", "edge", "spotify", "discord", "steam",
  "notepad", "vscode", "calculator", "slack", "obsidian", "explorer", "terminal",
];

interface EarFile {
  wakeWord: string;
  allowedApps: string[];
}

function loadEarFile(): EarFile {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { wakeWord?: unknown; allowedApps?: unknown };
    const allowedApps = Array.isArray(raw.allowedApps)
      ? raw.allowedApps.map((name) => String(name).toLowerCase().trim()).filter(Boolean)
      : DEFAULT_APPS;
    const wakeWord = typeof raw.wakeWord === "string" && raw.wakeWord.trim() ? raw.wakeWord.trim().toLowerCase() : "hey jarvis";
    return { wakeWord, allowedApps };
  } catch {
    return { wakeWord: "hey jarvis", allowedApps: DEFAULT_APPS };
  }
}

function runCommand(cmd: string, args: string[], input?: string, timeoutMs = 20_000): Promise<CommandOutput> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(cmd, args, { cwd: REPO_ROOT, windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const finish = (result: CommandOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ code: null, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), error: "timed out" });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => out.push(chunk));
    child.stderr?.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => finish({ code: null, stdout: "", stderr: "", error: error.message }));
    child.on("close", (code) => {
      finish({ code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function git(args: string[], input?: string): Promise<string> {
  const result = await runCommand("git", args, input, 20_000);
  if (result.code !== 0) {
    throw new Error((result.stderr || result.error || `git ${args[0]} failed`).trim().slice(0, 240));
  }
  return result.stdout.trim();
}

function allowedFrom(file: EarFile): string[] {
  const known = new Set(allowedAppNames());
  const picked = file.allowedApps.filter((name) => known.has(name) && resolveAllowedApp(name));
  return picked.length ? picked : DEFAULT_APPS.filter((name) => resolveAllowedApp(name));
}

async function askBrain(text: string): Promise<string> {
  const chain = resolveLlmChain(process.env, { preferred: null });
  const active = activeEndpoint(chain);
  if (!active) {
    return JSON.stringify({ tool: null, say: "The brain needs a key. Set OPENAI_API_KEY, XAI_API_KEY, or GEMINI_API_KEY." });
  }
  const client = endpointClient(active.endpoint);
  const response = await client.chat.completions.create({
    model: active.endpoint.model,
    temperature: 0,
    max_tokens: 300,
    messages: [
      { role: "system", content: VOICE_BRAIN_PROMPT },
      { role: "user", content: text },
    ],
  });
  return response.choices[0]?.message?.content || "";
}

function buildCoding() {
  const choice = selectCodingBackend(process.env);
  if (choice.id === "openai-compatible") {
    return createOpenAiCompatibleBackend({
      baseUrl: choice.baseUrl,
      model: choice.model,
      apiKey: process.env.VOICE_CODING_API_KEY,
      fetchImpl: fetch,
    });
  }
  return createDispatchCodingBackend(choice.id, async (task) => {
    const result = await dispatchAgent(choice.id, task, { workingDirectory: REPO_ROOT });
    return { ok: result.ok, summary: result.summary, output: result.output };
  });
}

async function openInBrowser(url: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Only http links." };
  if (process.platform !== "win32") {
    return { ok: false, error: "Opening the browser is a Windows step. The link is on the dashboard." };
  }
  const result = await runCommand("cmd.exe", ["/c", "start", "", url], undefined, 8000);
  if (result.error && result.code === null) return { ok: false, error: result.error };
  return { ok: true };
}

async function clickAt(x: number, y: number): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "win32") return { ok: false, message: "Clicking runs on Windows." };
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px > 20000 || py > 20000) return { ok: false, message: "That click is off the screen." };
  const command = `
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class EarClick { [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo); }' -ErrorAction SilentlyContinue
    [EarClick]::SetCursorPos(${px}, ${py}) | Out-Null
    [EarClick]::mouse_event(0x0002, 0, 0, 0, 0)
    [EarClick]::mouse_event(0x0004, 0, 0, 0, 0)
  `;
  const result = await runCommand("powershell", ["-NoProfile", "-Command", command], undefined, 8000);
  if (result.code !== 0) return { ok: false, message: (result.stderr || result.error || "Click failed.").slice(0, 180) };
  return { ok: true, message: "clicked" };
}

let ear: ReturnType<typeof createVoiceEar> | null = null;

export function getVoiceEar() {
  if (ear) return ear;
  const file = loadEarFile();
  const computerUse = process.env.VOICE_COMPUTER_USE === "1";
  ear = createVoiceEar({
    allowedApps: allowedFrom(file),
    wakeWord: file.wakeWord,
    resolveYouTube: (query) => resolveYouTube(query, {
      apiKey: process.env.YOUTUBE_API_KEY,
      fetchImpl: fetch,
      run: (cmd, args) => runCommand(cmd, args, undefined, 20_000),
    }),
    openUrl: openInBrowser,
    runTool: async (name, args) => {
      const result = await toolRegistry.execute(name, args);
      const data = result.data as { message?: string } | undefined;
      return {
        ok: result.success,
        message: result.success ? String(data?.message || "Done.") : String(result.error || "That failed."),
      };
    },
    coding: buildCoding(),
    git: {
      currentBranch: () => git(["rev-parse", "--abbrev-ref", "HEAD"]),
      checkoutNew: async (branch) => {
        const staged = await git(["diff", "--cached", "--name-only"]);
        if (staged.trim()) throw new Error("Something is already staged. Unstage it, then say yes again.");
        await git(["checkout", "-b", branch]);
      },
      applyDiff: async (diff) => {
        await git(["apply", "--index", "--whitespace=nowarn", "-"], diff.endsWith("\n") ? diff : `${diff}\n`);
      },
      commit: async (message) => {
        await git(["commit", "-m", message]);
      },
    },
    brain: askBrain,
    computerUse,
    click: computerUse ? clickAt : undefined,
  });
  return ear;
}
