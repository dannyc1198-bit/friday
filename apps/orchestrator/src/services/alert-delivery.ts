// Alert Delivery — watches proactiveMonitor's queue and speaks high-priority
// alerts via TTS. No event emitter on the monitor (to keep it surgical),
// so we poll getAlerts() every 15 seconds and track which ids we've handled.
//
// Rules:
//   - Only alerts with priority "high" (or future "critical") are spoken
//   - Quiet hours (23:00–05:00 local) suppress TTS (alert stays queued, unread)
//   - If TTS is unavailable, we log and leave the alert queued (frontend plays it)
//   - We never mark-read here — the frontend/user owns that action

import { proactiveMonitor } from "./proactive-monitor.js";
import { textToSpeech, isTTSAvailable } from "./tts.js";
import { isQuietHours } from "./scheduler.js";

const POLL_INTERVAL_MS = 15 * 1000;

const spoken = new Set<string>();     // alert ids we've already spoken
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function deliverLoop(): Promise<void> {
  try {
    const alerts = proactiveMonitor.getAlerts();
    if (alerts.length === 0) return;

    // Respect quiet hours for everything except what the scheduler fires
    // (the 5 AM briefing is queued during a period where this check passes).
    const quiet = isQuietHours();

    for (const alert of alerts) {
      if (spoken.has(alert.id)) continue;

      const priority = alert.priority as string;
      const isHighish = priority === "high" || priority === "critical";
      if (!isHighish) {
        // Low/medium stay silent in the queue — frontend can choose to surface them
        continue;
      }

      // Mark as seen regardless of delivery path so we don't spam the log on next tick
      spoken.add(alert.id);

      if (quiet && alert.title !== "Morning Briefing") {
        console.log(`[Alert Delivery] Quiet hours — not speaking: ${alert.title}`);
        continue;
      }

      if (!isTTSAvailable()) {
        console.log(`[Alert Delivery] TTS unavailable — alert queued silently: ${alert.title}`);
        continue;
      }

      try {
        const audio = await textToSpeech(alert.message);
        if (audio) {
          console.log(`[Alert Delivery] Generated alert audio (${audio.length} bytes): ${alert.title}`);
        } else {
          console.warn(`[Alert Delivery] TTS returned null for: ${alert.title}`);
        }
      } catch (err) {
        console.error(`[Alert Delivery] TTS failed for ${alert.id}:`, (err as Error).message);
      }
    }

    // Trim `spoken` set opportunistically — keep last 500 ids to prevent unbounded growth
    if (spoken.size > 500) {
      const keep = Array.from(spoken).slice(-250);
      spoken.clear();
      for (const id of keep) spoken.add(id);
    }
  } catch (err) {
    console.warn("[Alert Delivery] loop error:", (err as Error).message);
  }
}

export function startAlertDelivery(): void {
  if (intervalHandle) return;
  console.log("[Alert Delivery] Started — polling every 15s for high-priority alerts");
  intervalHandle = setInterval(() => {
    deliverLoop().catch((e) => console.warn("[Alert Delivery] tick error:", e));
  }, POLL_INTERVAL_MS);
}

export function stopAlertDelivery(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
