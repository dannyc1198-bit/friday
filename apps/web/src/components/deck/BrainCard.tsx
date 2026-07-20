"use client";

import { BrainStatus, BrainLearning } from "@/types";
import { Panel, usePoll, relTime, OfflineNote } from "./deck-lib";

// The Obsidian mind: index stats + the newest things she's learned about
// Danny's world. All real readings from /api/brain/*.

export function BrainCard() {
  const status = usePoll<BrainStatus>(
    () => fetch("/api/brain/status", { cache: "no-store" }).then((r) => r.json()),
    120_000
  );
  const recent = usePoll<{ learnings: BrainLearning[] }>(
    () => fetch("/api/brain/recent?limit=5", { cache: "no-store" }).then((r) => r.json()),
    120_000
  );

  const s = status.data;
  if (!s) return null;
  if (typeof s.notes !== "number") {
    return (
      <Panel title="Brain">
        <OfflineNote text="Brain endpoints unreachable — orchestrator down?" />
      </Panel>
    );
  }

  const stat = (label: string, value: string | number) => (
    <div>
      <p className="font-deckmono text-[15px] leading-none text-deck-ink">{value}</p>
      <p className="mt-1 font-deckmono text-[9px] uppercase tracking-wider text-deck-faint">
        {label}
      </p>
    </div>
  );

  return (
    <Panel
      title="Brain"
      right={
        <span className="font-deckmono text-[10px] text-deck-faint">
          indexed {relTime(s.lastIndexed)}
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {stat("notes", s.notes)}
        {stat("chunks", s.chunks)}
        {stat("entities", s.entities)}
      </div>

      {(recent.data?.learnings?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-deck-line pt-2.5">
          {recent.data!.learnings.slice(0, 5).map((l, i) => (
            <li key={i} className="text-[11.5px] leading-snug text-deck-dim">
              <span className="font-deckmono text-[9px] uppercase tracking-wider text-deck-amber">
                {l.entity}{" "}
              </span>
              <span className="line-clamp-2">{l.observation}</span>
            </li>
          ))}
        </ul>
      )}

      {s.reflection?.lastDate && (
        <p className="mt-2.5 border-t border-deck-line pt-2 font-deckmono text-[10px] text-deck-faint">
          last reflection {s.reflection.lastDate}
          {s.reflection.lastError ? " · error" : ""}
        </p>
      )}
    </Panel>
  );
}
