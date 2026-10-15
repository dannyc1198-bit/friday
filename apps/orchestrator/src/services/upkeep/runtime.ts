// Journal, nightly health, and the repair queue. Git and agents run only
// when a repair actually starts. Tests inject their own doubles.

import path from "path";
import { DATA_DIR, ORCHESTRATOR_ROOT, REPO_ROOT } from "../runtime-paths.js";
import { getBrainDir } from "../vault-config.js";
import { agentService, dispatchAgent } from "../agents/registry.js";
import { createRepairService, gitOps } from "./repairs.js";
import { noteIncident, readLearningFeed, shouldDiagnose, type Incident } from "./journal.js";
import {
  healthCommands,
  runCommand,
  summarizeChecks,
  writeHealthSummary,
  type CheckResult,
} from "./health-check.js";
import { publishThought } from "../thought-bus.js";
import type { Repair } from "./repairs.js";

const CONFIG_MISS = /needs key|missing key|api key|not configured|no api key/i;

function healthDir(): string {
  return path.join(getBrainDir(), "health");
}

async function pingHealth(): Promise<CheckResult> {
  try {
    const response = await fetch("http://127.0.0.1:3001/api/health");
    return {
      ok: response.ok,
      summary: response.ok ? "Health endpoint passed." : `Health endpoint returned ${response.status}.`,
    };
  } catch (err) {
    return { ok: false, summary: `Health endpoint failed: ${(err as Error).message}` };
  }
}

export async function runHealthCheck(): Promise<CheckResult> {
  const results: CheckResult[] = [];
  if (process.env.FRIDAY_HEALTHCHECK === "1") {
    for (const command of healthCommands()) {
      results.push(await runCommand(ORCHESTRATOR_ROOT, command));
    }
    results.push(await pingHealth());
  }
  const summary = await summarizeChecks(results);
  writeHealthSummary(healthDir(), summary);
  return summary;
}

export async function runNightlyHealth(): Promise<void> {
  const summary = await runHealthCheck();
  if (!summary.ok) await repairService().start(summary.summary);
}

let repairs: ReturnType<typeof createRepairService> | null = null;

function repairService() {
  if (!repairs) {
    repairs = createRepairService({
      storeFile: path.join(DATA_DIR, "repairs.json"),
      git: gitOps(REPO_ROOT),
      listAgents: async () =>
        (await agentService.list()).map((agent) => ({ id: agent.id, canDispatch: agent.canDispatch })),
      dispatch: async (agentId, task) => {
        const result = await dispatchAgent(agentId, task, { workingDirectory: REPO_ROOT });
        return { ok: result.ok, summary: result.summary };
      },
      runTests: () => runCommand(ORCHESTRATOR_ROOT, ["npm", "test"]),
      runHealth: async () => {
        const ping = await pingHealth();
        if (!ping.ok) return ping;
        return runHealthCheck();
      },
    });
  }
  return repairs;
}

function announceRepair(repair: Repair | null | undefined): void {
  if (!repair) return;
  publishThought({ kind: "repair", label: repair.status, detail: repair.summary, source: repair.branch });
}

export function recordIncident(incident: Incident): void {
  try {
    const noted = noteIncident(healthDir(), incident);
    publishThought({ kind: "repair", label: incident.kind, detail: incident.summary, source: incident.signature });
    const text = `${incident.summary} ${incident.detail || ""}`;
    if (shouldDiagnose(noted.count) && !CONFIG_MISS.test(text)) {
      void diagnoseRepeated(incident.summary);
    }
  } catch (err) {
    console.warn("[Upkeep] journal failed:", (err as Error).message);
  }
}

async function diagnoseRepeated(summary: string): Promise<void> {
  try {
    const health = await runHealthCheck();
    const bug = health.ok ? summary : `${summary} Health: ${health.summary}`;
    announceRepair(await repairService().start(bug));
  } catch (err) {
    console.warn("[Upkeep] diagnosis failed:", (err as Error).message);
  }
}

export function getUpkeepSnapshot() {
  return {
    learning: readLearningFeed(healthDir()),
    repairs: repairService().list(),
  };
}

export async function approveRepair(id: string) {
  const repair = await repairService().approve(id);
  announceRepair(repair);
  return repair;
}

export function rejectRepair(id: string) {
  const repair = repairService().reject(id);
  announceRepair(repair);
  return repair;
}
