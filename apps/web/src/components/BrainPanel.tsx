"use client";

// THE MIND — FRIDAY's live brain instrument.
//
// Replaces the old wall of mock-data HUD panels with one panel that shows
// only REAL cognition: vault index gauges, the last nightly reflection, and
// a live feed of facts FRIDAY has learned (from /api/brain/recent — the
// journal that brain_remember and the reflection both append to).
// Polls every 20s; new learnings slide in with a glow.

import { useState, useEffect, useCallback, useRef } from "react";
import { BrainStatus, BrainLearning } from "@/types";
import { cn } from "@/lib/utils";

const POLL_MS = 20_000;

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const TYPE_GLYPH: Record<string, string> = {
  person: "◆", client: "◆", project: "▣", preference: "♥", place: "▽", tool: "⚙", fact: "•",
};

function Gauge({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex-1 min-w-0 px-2.5 py-2 rounded-sm bg-[#00b4ff]/[0.04] border border-[#00b4ff]/10 hud-brackets">
      <div className="font-display text-lg font-semibold text-[#00dcff] text-glow leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-1 font-mono text-[7px] tracking-[0.25em] uppercase text-[#5a8aaa]">
        {label}
      </div>
    </div>
  );
}

export function BrainPanel() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [learnings, setLearnings] = useState<BrainLearning[]>([]);
  const [offline, setOffline] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  const [reflectNote, setReflectNote] = useState<string | null>(null);
  const knownRef = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const [sRes, rRes] = await Promise.all([
        fetch("/api/brain/status", { cache: "no-store" }),
        fetch("/api/brain/recent?limit=12", { cache: "no-store" }),
      ]);
      if (!sRes.ok || !rRes.ok) throw new Error("brain offline");
      const s = (await sRes.json()) as BrainStatus;
      const r = (await rRes.json()) as { learnings: BrainLearning[] };
      setStatus(s);

      const items = r.learnings || [];
      // Mark unseen entries so they glow in. First load seeds silently.
      if (knownRef.current.size > 0) {
        const newKeys = items
          .map((l) => l.at + l.entity)
          .filter((k) => !knownRef.current.has(k));
        if (newKeys.length > 0) {
          setFresh(new Set(newKeys));
          setTimeout(() => setFresh(new Set()), 4000);
        }
      }
      items.forEach((l) => knownRef.current.add(l.at + l.entity));
      setLearnings(items);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const triggerReflection = useCallback(async () => {
    if (reflecting) return;
    setReflecting(true);
    setReflectNote(null);
    try {
      const r = await fetch("/api/brain/reflect", { method: "POST" });
      const data = await r.json();
      if (data.ran) {
        setReflectNote(`Reflected — ${data.factsAdded} new fact(s).`);
      } else {
        setReflectNote(data.skippedReason || data.error || "Nothing to reflect on yet.");
      }
      poll();
    } catch {
      setReflectNote("Reflection failed — orchestrator unreachable.");
    } finally {
      setReflecting(false);
    }
  }, [reflecting, poll]);

  return (
    <div className="hud-window p-3 relative">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            offline ? "bg-[#ff5252]" : "bg-[#66ffb2] status-dot-glow"
          )} style={{ color: offline ? "#ff5252" : "#66ffb2" }} />
          <span className="font-display text-[10px] font-semibold tracking-[0.3em] uppercase text-[#00dcff]/80 text-glow">
            The Mind
          </span>
        </div>
        <span className="font-mono text-[7px] tracking-[0.2em] uppercase text-[#1e3a50]">
          {offline ? "OFFLINE" : `indexed ${timeAgo(status?.lastIndexed ?? null)}`}
        </span>
      </div>

      {offline ? (
        <div className="py-6 text-center">
          <p className="font-mono text-[9px] tracking-[0.15em] text-[#ff5252]/70 uppercase">
            Brain unreachable
          </p>
          <p className="mt-1.5 font-mono text-[8px] text-[#5a8aaa]">
            Orchestrator on :3001 is down
          </p>
        </div>
      ) : (
        <>
          {/* Index gauges */}
          <div className="flex gap-1.5">
            <Gauge label="Notes" value={status?.notes ?? "—"} />
            <Gauge label="Sections" value={status?.chunks ?? "—"} />
            <Gauge label="Entities" value={status?.entities ?? "—"} />
          </div>

          {/* Last reflection */}
          <div className="mt-3 px-2.5 py-2 rounded-sm bg-[#0a1a2e]/50 border border-[#00b4ff]/[0.07]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[7px] tracking-[0.25em] uppercase text-[#5a8aaa]">
                ✦ Last reflection
              </span>
              <span className="font-mono text-[7px] text-[#1e3a50]">
                {timeAgo(status?.reflection?.lastRunAt ?? null)}
              </span>
            </div>
            {status?.reflection?.lastSummary ? (
              <p className="mt-1.5 text-[10px] font-light leading-relaxed text-[#e0f0ff]/70 line-clamp-3">
                {status.reflection.lastSummary}
              </p>
            ) : (
              <p className="mt-1.5 text-[10px] font-light italic text-[#5a8aaa]/60">
                No reflection yet — she reflects nightly at 21:30, or on demand.
              </p>
            )}
            <button
              onClick={triggerReflection}
              disabled={reflecting}
              className={cn(
                "mt-2 w-full py-1.5 rounded-sm border font-mono text-[8px] tracking-[0.25em] uppercase transition-all duration-300",
                reflecting
                  ? "border-[#00dcff]/40 bg-[#00b4ff]/10 text-[#00dcff] animate-pulse cursor-wait"
                  : "border-[#00b4ff]/15 bg-[#00b4ff]/[0.04] text-[#5a8aaa] hover:text-[#00dcff] hover:border-[#00b4ff]/35 hover:bg-[#00b4ff]/10"
              )}
            >
              {reflecting ? "Reflecting…" : "Reflect now"}
            </button>
            {reflectNote && (
              <p className="mt-1.5 font-mono text-[8px] text-[#66ffb2]/70 leading-relaxed">
                {reflectNote}
              </p>
            )}
          </div>

          {/* Recently learned feed */}
          <div className="mt-3">
            <span className="font-mono text-[7px] tracking-[0.25em] uppercase text-[#5a8aaa]">
              Recently learned
            </span>
            {learnings.length === 0 ? (
              <p className="mt-2 text-[10px] font-light italic text-[#5a8aaa]/60 leading-relaxed">
                Nothing yet. Tell FRIDAY something worth remembering — or let
                tonight's reflection sweep the day.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 max-h-[260px] overflow-y-auto scrollbar-thin pr-0.5">
                {learnings.map((l) => {
                  const key = l.at + l.entity;
                  return (
                    <li
                      key={key}
                      className={cn(
                        "px-2 py-1.5 rounded-sm border transition-all duration-700",
                        fresh.has(key)
                          ? "border-[#66ffb2]/40 bg-[#66ffb2]/[0.07] shadow-[0_0_12px_rgba(102,255,178,0.12)]"
                          : "border-transparent bg-[#00b4ff]/[0.025] hover:bg-[#00b4ff]/[0.05]"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-[#00dcff]/60">{TYPE_GLYPH[l.type] || "•"}</span>
                        <span className="font-display text-[9px] font-semibold tracking-[0.08em] text-[#00dcff]/90 truncate">
                          {l.entity}
                        </span>
                        <span className="ml-auto flex-shrink-0 font-mono text-[7px] text-[#1e3a50]">
                          {l.source === "reflection" ? "✦" : "✎"} {timeAgo(l.at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[9.5px] font-light leading-snug text-[#e0f0ff]/60 line-clamp-2">
                        {l.observation}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
