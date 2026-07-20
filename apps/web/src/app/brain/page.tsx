"use client";

import Link from "next/link";
import NeuralBrain from "@/components/NeuralBrain";
import { usePoll, relTime } from "@/components/deck/deck-lib";
import { BrainStatus } from "@/types";

// /brain — FRIDAY's Neural Core. Full-screen pixel-neuron web with a thin
// HUD overlay. Every reading is live:
//   · /api/brain/status   → index stats + reflection state (orchestrator)
//   · /api/brain/activity → tail of ACTION-LEDGER.md (vault file, 15s poll)
// The web's firing intensity ramps up when the ledger shows recent writes.

interface BrainActivity {
  entries: string[];
  active: boolean;
  updatedAt: string | null;
}

export default function BrainPage() {
  const status = usePoll<BrainStatus>(
    () => fetch("/api/brain/status", { cache: "no-store" }).then((r) => r.json()),
    30_000
  );
  const activity = usePoll<BrainActivity>(
    () => fetch("/api/brain/activity", { cache: "no-store" }).then((r) => r.json()),
    15_000
  );

  const s = status.data;
  const online = typeof s?.notes === "number";
  const active = activity.data?.active === true;
  const entries = activity.data?.entries ?? [];
  const intensity = active ? 0.85 : online ? 0.3 : 0.12;

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: "var(--fri-bg)" }}
    >
      <NeuralBrain intensity={intensity} className="absolute inset-0" />

      {/* ── HUD overlay ── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 md:p-7">
        {/* top: title + status · back link */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1
              className="font-display text-xl font-semibold uppercase tracking-[0.35em] md:text-2xl"
              style={{
                color: "var(--fri-accent-bright)",
                textShadow: "0 0 18px rgba(0, 220, 255, 0.45)",
              }}
            >
              FRIDAY — Neural Core
            </h1>
            <p
              className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{ color: "var(--fri-text-dim)" }}
            >
              {online
                ? `${s!.notes} notes · ${s!.chunks} chunks · ${s!.entities} entities · indexed ${relTime(s!.lastIndexed)}`
                : "core offline — orchestrator unreachable"}
            </p>
            <p
              className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{
                color: active ? "var(--fri-accent-ultra)" : "var(--fri-text-dim)",
              }}
            >
              synaptic activity: {active ? "active" : "idle"}
              {activity.data?.updatedAt
                ? ` · ledger ${relTime(activity.data.updatedAt)}`
                : " · no ledger"}
            </p>
          </div>
          <Link
            href="/"
            className="pointer-events-auto shrink-0 rounded border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors hover:brightness-150"
            style={{
              borderColor: "var(--fri-border-active)",
              color: "var(--fri-accent)",
            }}
          >
            ← Deck
          </Link>
        </div>

        {/* bottom: reflection reading · live activity feed */}
        <div className="flex items-end justify-between gap-6">
          <div className="max-w-sm">
            {s?.reflection?.lastDate && (
              <p
                className="font-mono text-[10px] uppercase tracking-[0.15em] leading-relaxed"
                style={{ color: "var(--fri-text-dim)" }}
              >
                last reflection {s.reflection.lastDate}
                {s.reflection.lastFactsAdded
                  ? ` · ${s.reflection.lastFactsAdded} facts`
                  : ""}
                {s.reflection.lastError ? " · error" : ""}
              </p>
            )}
          </div>

          <section
            className="pointer-events-auto w-80 max-w-full rounded border backdrop-blur-sm"
            style={{
              borderColor: "var(--fri-border)",
              background: "var(--fri-glass)",
            }}
          >
            <header
              className="flex items-center justify-between border-b px-3 py-2"
              style={{ borderColor: "var(--fri-border)" }}
            >
              <h2
                className="font-display text-[11px] font-semibold uppercase tracking-[0.25em]"
                style={{ color: "var(--fri-accent)" }}
              >
                Activity ledger
              </h2>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "animate-pulse" : ""}`}
                style={{
                  background: active ? "var(--fri-accent-ultra)" : "var(--fri-text-ultra-dim)",
                }}
              />
            </header>
            <ul className="scrollbar-thin max-h-56 space-y-1.5 overflow-y-auto px-3 py-2.5">
              {entries.length === 0 ? (
                <li
                  className="font-mono text-[10px] leading-relaxed"
                  style={{ color: "var(--fri-text-dim)" }}
                >
                  No ledger entries — ACTION-LEDGER.md is empty or not created yet.
                </li>
              ) : (
                entries
                  .slice()
                  .reverse()
                  .map((entry, i) => (
                    <li
                      key={`${i}-${entry.slice(0, 24)}`}
                      className="font-mono text-[10px] leading-relaxed"
                      style={{
                        color: i === 0 ? "var(--fri-text)" : "var(--fri-text-dim)",
                      }}
                    >
                      {entry}
                    </li>
                  ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
