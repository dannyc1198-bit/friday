// One spoken alert per title per local day. Restarts must not replay the queue.

export interface DedupeAlert {
  title: string;
  timestamp: string;
  read: boolean;
}

export function alertDedupeKey(title: string, timestamp: string): string {
  const day = timestamp.slice(0, 10);
  return `${title.trim().toLowerCase()}|${day}`;
}

export function collapseAlerts<T extends DedupeAlert>(alerts: T[]): T[] {
  const seen = new Set<string>();
  const newestFirst = [...alerts].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const kept: T[] = [];
  for (const alert of newestFirst) {
    if (alert.read) {
      kept.push(alert);
      continue;
    }
    const key = alertDedupeKey(alert.title, alert.timestamp);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(alert);
  }
  return kept.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function isDuplicateAlert(existing: DedupeAlert[], title: string, nowIso: string): boolean {
  const key = alertDedupeKey(title, nowIso);
  return existing.some((alert) => !alert.read && alertDedupeKey(alert.title, alert.timestamp) === key);
}
