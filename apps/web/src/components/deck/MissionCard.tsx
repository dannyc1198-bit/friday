"use client";

import { Panel, usePoll, OfflineNote } from "./deck-lib";

// The deck opens holding Danny's place. Reads the Champion Log — his external
// brain — and puts THE ONE THING where his eyes land first.

interface Mission {
  ok: boolean;
  error?: string;
  lastUpdated?: string | null;
  phase?: string | null;
  spear?: string | null;
  oneThing?: string | null;
  todos?: { done: boolean; text: string }[];
}

export function MissionCard() {
  const { data } = usePoll<Mission>(
    () => fetch("/api/mission", { cache: "no-store" }).then((r) => r.json()),
    300_000
  );

  if (!data) return null;
  if (!data.ok) {
    return (
      <Panel title="Mission">
        <OfflineNote text="Champion Log not found. Set MISSION_LOG_PATH in .env.local to wire this panel." />
      </Panel>
    );
  }

  const open = (data.todos ?? []).filter((t) => !t.done).slice(0, 5);

  return (
    <Panel
      title="Mission"
      right={
        data.lastUpdated ? (
          <span className="font-deckmono text-[10px] text-deck-faint">
            log {data.lastUpdated}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {data.oneThing && (
          <div className="rounded border border-deck-line-bright bg-deck-raised px-3 py-2.5">
            <p className="font-deckdisplay text-[10px] font-semibold uppercase tracking-[0.22em] text-deck-hot">
              The one thing
            </p>
            <p className="mt-1 text-[13px] leading-snug text-deck-ink">
              {data.oneThing}
            </p>
          </div>
        )}
        {data.spear && (
          <p className="text-[12px] leading-snug text-deck-dim">
            <span className="font-deckmono text-[10px] uppercase tracking-wider text-deck-amber">
              spear{" "}
            </span>
            {data.spear}
          </p>
        )}
        {open.length > 0 && (
          <ul className="space-y-1.5">
            {open.map((t, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-deck-dim">
                <span className="mt-px shrink-0 text-deck-amber">▢</span>
                <span className="line-clamp-2">{t.text}</span>
              </li>
            ))}
          </ul>
        )}
        {data.phase && (
          <p className="font-deckmono text-[10px] uppercase tracking-wider text-deck-faint">
            {data.phase}
          </p>
        )}
      </div>
    </Panel>
  );
}
