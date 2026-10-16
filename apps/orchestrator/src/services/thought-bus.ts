// Live activity for the Neural Core tab. In memory only.
// Closing the HUD drops the SSE client. The orchestrator does not keep a sim running.

export type ThoughtKind = "recall" | "tool" | "learning" | "repair" | "insight";

export interface ThoughtEvent {
  id: string;
  at: string;
  kind: ThoughtKind;
  label: string;
  detail: string;
  source?: string;
}

type Input = {
  kind: ThoughtKind;
  label: string;
  detail: string;
  source?: string;
};

const MAX_EVENTS = 80;
const events: ThoughtEvent[] = [];
const listeners = new Set<(event: ThoughtEvent) => void>();
let sequence = 0;

function same(a: ThoughtEvent, input: Input): boolean {
  return a.kind === input.kind && a.label === input.label && a.detail === input.detail;
}

export function publishThought(input: Input): ThoughtEvent | null {
  const label = input.label.trim().slice(0, 120);
  const detail = input.detail.trim().slice(0, 240);
  if (!label) return null;
  const quietKinds: ThoughtKind[] = ["recall", "learning", "insight"];
  if (quietKinds.includes(input.kind) && events.slice(-16).some((event) => same(event, { ...input, label, detail }))) {
    return null;
  }
  const event: ThoughtEvent = {
    id: `thought-${++sequence}`,
    at: new Date().toISOString(),
    kind: input.kind,
    label,
    detail: detail || label,
    source: input.source,
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A closed HUD socket must not break chat.
    }
  }
  return event;
}

export function recentThoughts(limit = 40): ThoughtEvent[] {
  const count = Math.min(Math.max(1, limit), MAX_EVENTS);
  return events.slice(-count);
}

export function subscribeThoughts(listener: (event: ThoughtEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearThoughts(): void {
  events.length = 0;
}
