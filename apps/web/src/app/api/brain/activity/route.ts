// Brain activity — reads the tail of the action ledger the orchestrator's
// brain writes to the Obsidian vault. Real file, real mtime — no invention.
//
// Static segment beats the sibling [...path] proxy, so /api/brain/activity
// is served here while status/recent/search/reflect/reindex still forward
// to the orchestrator.
//
// Response: { entries: string[], active: boolean, updatedAt: string | null }
//   entries  — last 30 non-empty lines of ACTION-LEDGER.md (oldest → newest)
//   active   — true if the ledger was written to in the last 10 minutes
// Missing file is a normal state (ledger not created yet) → empty + inactive.

import { promises as fs } from "fs";
import os from "os";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ledgerPath(): string {
  return path.join(
    process.env.OBSIDIAN_VAULT_PATH || path.join(os.homedir(), "Obsidian", "Wavelength"),
    "FRIDAY_BRAIN",
    "memory",
    "ACTION-LEDGER.md"
  );
}

const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
const TAIL_LINES = 30;

export async function GET() {
  try {
    const stat = await fs.stat(ledgerPath());
    const raw = await fs.readFile(ledgerPath(), "utf8");
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-TAIL_LINES);
    return Response.json({
      entries,
      active: Date.now() - stat.mtimeMs < ACTIVE_WINDOW_MS,
      updatedAt: stat.mtime.toISOString(),
    });
  } catch {
    // Ledger doesn't exist yet (or unreadable) — honest empty state.
    return Response.json({ entries: [], active: false, updatedAt: null });
  }
}
