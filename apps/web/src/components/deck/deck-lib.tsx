"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Shared plumbing for the flight-deck instruments ─────────────────────────

/** Poll a JSON endpoint on an interval; refetch on window focus. */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const tick = useCallback(async () => {
    try {
      const d = await fetcherRef.current();
      setData(d);
      setStale(false);
    } catch {
      setStale(true); // keep last reading, flag it
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    tick();
    const id = setInterval(tick, intervalMs);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs, tick]);

  return { data, stale, refresh: tick };
}

/** Execute a read-only orchestrator tool through the deck proxy. */
export async function deckTool<T = Record<string, unknown>>(
  tool: string,
  parameters: Record<string, unknown> = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch("/api/deck/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, parameters }),
  });
  return res.json();
}

/** Friendly labels for cognition chips — instrument voice, not function names. */
export function toolLabel(tool: string): string {
  if (tool.startsWith("brain_recall")) return "RECALL";
  if (tool.startsWith("brain_remember")) return "REMEMBER";
  if (tool.startsWith("brain")) return "BRAIN";
  if (tool.startsWith("memory")) return "MEMORY";
  if (tool.startsWith("obsidian")) return "VAULT";
  if (tool.startsWith("fleet")) return "FLEET";
  if (tool.startsWith("market")) return "MARKETS";
  if (tool.startsWith("intel")) return "INTEL";
  if (tool.startsWith("browser")) return "BROWSER";
  if (tool.startsWith("task")) return "TASKS";
  if (tool.startsWith("vault")) return "KEYS";
  if (tool === "delegate_to_claude_code") return "CODE AGENT";
  return tool.replace(/_/g, " ").toUpperCase().slice(0, 18);
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Panel chrome ────────────────────────────────────────────────────────────

export function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-hud border border-deck-line bg-deck-panel">
      <header className="flex items-center justify-between border-b border-deck-line px-3 py-2">
        <h2 className="font-deckdisplay text-[11px] font-semibold uppercase tracking-[0.22em] text-deck-amber">
          {title}
        </h2>
        {right}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

export function Dot({ tone }: { tone: "ok" | "alert" | "dim" | "amber" }) {
  const color =
    tone === "ok"
      ? "bg-deck-ok"
      : tone === "alert"
      ? "bg-deck-alert"
      : tone === "amber"
      ? "bg-deck-amber"
      : "bg-deck-faint";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}

export function OfflineNote({ text }: { text: string }) {
  return (
    <p className="font-deckmono text-[11px] leading-relaxed text-deck-dim">
      {text}
    </p>
  );
}

// ─── Minimal inline icons (no icon-lib version roulette) ────────────────────

export const Icons = {
  mic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  speaker: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  ),
  speakerOff: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="m16 9 5 5m0-5-5 5" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M4 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
};
