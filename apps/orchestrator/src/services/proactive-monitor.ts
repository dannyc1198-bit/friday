// Proactive Monitor — JARVIS watches for things Danny should know
//
// Runs in the background every 5 minutes. Checks health, tasks, email, calendar.
// Queues alerts that the frontend polls and speaks via TTS.
//
// Rules (non-negotiable):
//   - Quiet hours: 11 PM → 5 AM — no alerts, no interruptions
//   - Max 3 alerts per hour — prevent spam
//   - Each check has a cooldown — same alert won't fire twice in a row
//   - Read-only monitoring only — can observe, never act autonomously

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../config/index.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface ProactiveAlert {
  id: string;
  type: "task" | "system" | "email" | "calendar" | "crypto";
  priority: "low" | "medium" | "high";
  title: string;         // Short label shown in UI
  message: string;       // Full spoken message
  timestamp: string;
  read: boolean;
}

interface CheckState {
  lastRun: number;    // ms timestamp
  cooldownMs: number; // minimum gap between same check firing an alert
  lastAlertTime: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const CHECK_INTERVAL_MS  = 5 * 60 * 1000;   // 5 minutes
const QUIET_HOUR_START   = 23;              // 11 PM
const QUIET_HOUR_END     = 5;               // 5 AM
const MAX_ALERTS_PER_HOUR = 3;

const DATA_DIR = join(
  process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368",
  "jarvis", "apps", "orchestrator", "data"
);

// ─── ProactiveMonitor ────────────────────────────────────────────────

class ProactiveMonitor {
  private alertQueue: ProactiveAlert[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private alertsThisHour = 0;
  private hourResetTime = Date.now() + 60 * 60 * 1000;

  private checkStates: Record<string, CheckState> = {
    tasks:    { lastRun: 0, cooldownMs: 30 * 60 * 1000, lastAlertTime: 0 },
    system:   { lastRun: 0, cooldownMs:  5 * 60 * 1000, lastAlertTime: 0 },
    email:    { lastRun: 0, cooldownMs: 30 * 60 * 1000, lastAlertTime: 0 },
    calendar: { lastRun: 0, cooldownMs: 15 * 60 * 1000, lastAlertTime: 0 },
  };

  // ── Public API ───────────────────────────────────────────────────

  start(): void {
    if (this.intervalHandle) return; // already running
    console.log("[Proactive Monitor] Started — checking every 5 minutes");
    this.runChecks(); // run immediately on start
    this.intervalHandle = setInterval(() => this.runChecks(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log("[Proactive Monitor] Stopped");
  }

  getAlerts(): ProactiveAlert[] {
    return this.alertQueue.filter((a) => !a.read);
  }

  getAllAlerts(): ProactiveAlert[] {
    return [...this.alertQueue];
  }

  markRead(id: string): boolean {
    const alert = this.alertQueue.find((a) => a.id === id);
    if (!alert) return false;
    alert.read = true;
    return true;
  }

  clearAll(): void {
    this.alertQueue = [];
  }

  /** Allow external services (e.g. market monitor) to queue an alert directly */
  queueAlert(alert: Omit<ProactiveAlert, "id" | "timestamp" | "read">): void {
    this.emit(alert, alert.type);
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private isQuietHours(): boolean {
    const hour = new Date().getHours();
    if (QUIET_HOUR_START <= QUIET_HOUR_END) {
      return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
    }
    return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
  }

  private resetHourlyCounterIfNeeded(): void {
    if (Date.now() >= this.hourResetTime) {
      this.alertsThisHour = 0;
      this.hourResetTime = Date.now() + 60 * 60 * 1000;
    }
  }

  private canAlert(): boolean {
    this.resetHourlyCounterIfNeeded();
    if (this.isQuietHours()) return false;
    if (this.alertsThisHour >= MAX_ALERTS_PER_HOUR) return false;
    return true;
  }

  private emit(
    alert: Omit<ProactiveAlert, "id" | "timestamp" | "read">,
    checkKey: string
  ): void {
    if (!this.canAlert()) return;

    const state = this.checkStates[checkKey];
    if (state && Date.now() - state.lastAlertTime < state.cooldownMs) return;

    const fullAlert: ProactiveAlert = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };

    this.alertQueue.push(fullAlert);

    // Cap queue at 50 alerts
    if (this.alertQueue.length > 50) {
      this.alertQueue = this.alertQueue.slice(-50);
    }

    if (state) state.lastAlertTime = Date.now();
    this.alertsThisHour++;

    console.log(`[Proactive Monitor] Alert queued: [${alert.priority}] ${alert.title}`);
  }

  // ── Main check runner ────────────────────────────────────────────

  private async runChecks(): Promise<void> {
    const now = Date.now();

    try { await this.checkTasks(now); } catch (e) {
      console.warn("[Proactive Monitor] Task check failed:", (e as Error).message);
    }
    try { await this.checkSystemHealth(now); } catch (e) {
      console.warn("[Proactive Monitor] System check failed:", (e as Error).message);
    }
    try { await this.checkEmailViaOpenClaw(now); } catch (e) {
      console.warn("[Proactive Monitor] Email check failed:", (e as Error).message);
    }
  }

  // ── Check: Overdue / high-priority tasks ────────────────────────

  private async checkTasks(now: number): Promise<void> {
    const state = this.checkStates.tasks;
    if (now - state.lastRun < CHECK_INTERVAL_MS) return;
    state.lastRun = now;

    const tasksFile = join(DATA_DIR, "tasks.json");
    if (!existsSync(tasksFile)) return;

    let tasks: Array<{
      id: string;
      title: string;
      priority?: string;
      completed?: boolean;
      dueDate?: string;
      createdAt?: string;
    }> = [];

    try {
      tasks = JSON.parse(readFileSync(tasksFile, "utf8"));
    } catch {
      return;
    }

    const pending = tasks.filter((t) => !t.completed);
    const highPriority = pending.filter((t) => t.priority === "high");

    // Alert on overdue tasks
    const now_date = new Date();
    const overdue = pending.filter((t) => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < now_date;
    });

    if (overdue.length > 0) {
      const titles = overdue.slice(0, 2).map((t) => `"${t.title}"`).join(" and ");
      this.emit({
        type: "task",
        priority: "high",
        title: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
        message: `Sir, you have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}. ${titles} ${overdue.length > 2 ? `and ${overdue.length - 2} more` : ""}. Shall I pull them up?`,
      }, "tasks");
      return;
    }

    // Alert if too many high-priority tasks piling up
    if (highPriority.length >= 5) {
      this.emit({
        type: "task",
        priority: "medium",
        title: `${highPriority.length} high-priority tasks pending`,
        message: `Worth noting, sir — you have ${highPriority.length} high-priority tasks that have not been touched. Would you like a rundown?`,
      }, "tasks");
    }
  }

  // ── Check: System health (CPU / memory / disk) ───────────────────

  private async checkSystemHealth(now: number): Promise<void> {
    const state = this.checkStates.system;
    if (now - state.lastRun < CHECK_INTERVAL_MS) return;
    state.lastRun = now;

    // Read system metrics from a lightweight probe via the OS
    try {
      const { execSync } = await import("child_process");

      // CPU — use wmic on Windows
      let cpuLoad = 0;
      try {
        if (process.platform === "win32") {
          const out = execSync(
            'wmic cpu get loadpercentage /value',
            { encoding: "utf8", timeout: 5000 }
          );
          const match = out.match(/LoadPercentage=(\d+)/);
          if (match) cpuLoad = parseInt(match[1], 10);
        }
      } catch { /* ignore */ }

      if (cpuLoad > 85) {
        this.emit({
          type: "system",
          priority: "medium",
          title: `High CPU: ${cpuLoad}%`,
          message: `Heads up, sir — CPU is running at ${cpuLoad} percent. You may want to check for runaway processes.`,
        }, "system");
      }

    } catch { /* Node built-in import issue — skip */ }
  }

  // ── Check: Email via OpenClaw (graceful if offline) ──────────────

  private async checkEmailViaOpenClaw(now: number): Promise<void> {
    const state = this.checkStates.email;
    if (now - state.lastRun < CHECK_INTERVAL_MS) return;
    state.lastRun = now;

    if (!config.openclaw.token || !config.openclaw.baseUrl) return;

    try {
      const res = await fetch(`${config.openclaw.baseUrl}/api/gmail/unread-count`, {
        headers: { Authorization: `Bearer ${config.openclaw.token}` },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return;

      const data = await res.json() as { count?: number; important?: number };
      const unread = data.count || 0;
      const important = data.important || 0;

      if (important > 0) {
        this.emit({
          type: "email",
          priority: "high",
          title: `${important} important email${important > 1 ? "s" : ""}`,
          message: `Sir, you have ${important} important email${important > 1 ? "s" : ""} waiting. Would you like me to read them?`,
        }, "email");
      } else if (unread > 10) {
        this.emit({
          type: "email",
          priority: "low",
          title: `${unread} unread emails`,
          message: `You have ${unread} unread emails building up, sir. Worth clearing the inbox when you have a moment.`,
        }, "email");
      }
    } catch {
      // OpenClaw offline — silently skip
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

export const proactiveMonitor = new ProactiveMonitor();
