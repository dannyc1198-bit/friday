"use client";

import { HealthResponse } from "@/types";
import { Dot, usePoll } from "./deck-lib";

// Top-bar truth strip: what brain, how many hands, does she have a voice.
// Every chip is a live reading from /api/health — nothing invented.

export function HealthChips({
  onStatus,
}: {
  onStatus?: (online: boolean) => void;
}) {
  const { data, stale } = usePoll<HealthResponse & { _latency: number }>(
    async () => {
      const t0 = performance.now();
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = await res.json();
      const h = { ...json, _latency: Math.round(performance.now() - t0) };
      onStatus?.(Boolean(json?.ok));
      return h;
    },
    30_000
  );

  const online = Boolean(data?.ok) && !stale;

  const chip =
    "flex items-center gap-1.5 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim";

  return (
    <div className="flex items-center gap-2">
      <span className={chip}>
        <Dot tone={online ? "ok" : "alert"} />
        <span className={online ? "text-deck-ink" : "text-deck-alert"}>
          {online ? "core online" : "core offline"}
        </span>
        {online && data?._latency != null && (
          <span className="text-deck-faint">{data._latency}ms</span>
        )}
      </span>
      {online && data?.llm && (
        <span className={chip} title="Active language model">
          {data.llm.model}
        </span>
      )}
      {online && typeof data?.tools === "number" && (
        <span className={chip}>{data.tools} tools</span>
      )}
      {online && (
        <span className={chip}>
          <Dot tone={data?.tts ? "ok" : "dim"} />
          voice
        </span>
      )}
    </div>
  );
}
