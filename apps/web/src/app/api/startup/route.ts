import { NextResponse } from "next/server";
import { exec } from "child_process";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

// OpenClaw start command — update this to match your OpenClaw installation
// e.g. "openclaw start", "node C:\\openclaw\\index.js", "npm run start"
const OPENCLAW_CMD = process.env.OPENCLAW_START_CMD || "openclaw gateway";
const OPENCLAW_HEALTH = process.env.OPENCLAW_URL || "http://localhost:18789";

async function isOpenClawRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OPENCLAW_HEALTH}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function startOpenClaw(): void {
  // Open a minimized Windows Terminal window running OpenClaw
  exec(
    `start "" /MIN cmd /k "${OPENCLAW_CMD}"`,
    { shell: "cmd.exe" },
    (err) => {
      if (err) console.error("[Startup] OpenClaw launch failed:", err.message);
      else console.log("[Startup] OpenClaw started in background terminal");
    }
  );
}

// ─── Startup Actions ───────────────────────────────────────
// Everything that opens when Danny double-claps to wake JARVIS.

interface StartupAction {
  name: string;
  tool: string;
  params: Record<string, unknown>;
}

const STARTUP_ACTIONS: StartupAction[] = [
  // 1. VS Code
  { name: "VS Code",        tool: "open_app", params: { app_name: "vscode" } },
  // 2. Claude Desktop
  { name: "Claude Desktop", tool: "open_app", params: { app_name: "claude desktop" } },
  // 3. Obsidian
  { name: "Obsidian",       tool: "open_app", params: { app_name: "obsidian" } },
  // 4. TradingView in browser
  { name: "TradingView",    tool: "browser_open", params: { url: "https://www.tradingview.com/chart/" } },
];

/**
 * POST /api/startup — Launch all JARVIS startup apps.
 * Called on wake (phrase + double clap).
 */
export async function POST() {
  const results: { name: string; success: boolean; error?: string }[] = [];

  // ── OpenClaw: check and start if not running ──────────────────
  const openClawAlive = await isOpenClawRunning();
  if (!openClawAlive) {
    startOpenClaw();
    results.push({ name: "OpenClaw", success: true });
  } else {
    results.push({ name: "OpenClaw", success: true }); // already running
  }

  for (const action of STARTUP_ACTIONS) {
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/tools/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: action.tool,
          parameters: action.params,
        }),
      });

      if (res.ok) {
        results.push({ name: action.name, success: true });
      } else {
        const data = await res.json().catch(() => ({}));
        results.push({ name: action.name, success: false, error: data.error || `Status ${res.status}` });
      }
    } catch (err) {
      results.push({
        name: action.name,
        success: false,
        error: err instanceof Error ? err.message : "Failed",
      });
    }

    // Small delay between launches to avoid overwhelming the system
    await new Promise((r) => setTimeout(r, 500));
  }

  return NextResponse.json({ launched: results });
}
