import { NextResponse } from "next/server";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

interface StartupAction {
  name: string;
  tool: string;
  params: Record<string, unknown>;
}

const STARTUP_ACTIONS: StartupAction[] = [
  { name: "VS Code",        tool: "open_app", params: { app_name: "vscode" } },
  { name: "Claude Desktop", tool: "open_app", params: { app_name: "claude desktop" } },
  { name: "Obsidian",       tool: "open_app", params: { app_name: "obsidian" } },
];

export async function POST() {
  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const action of STARTUP_ACTIONS) {
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/tools/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
        },
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

    await new Promise((r) => setTimeout(r, 500));
  }

  return NextResponse.json({ launched: results });
}
