"use client";

import { Panel, usePoll, deckTool, OfflineNote } from "./deck-lib";

// World intel via Osiris. Headlines arrive as "[risk N] Title — Source".

interface IntelData {
  message?: string;
  headlines?: string[];
}

function parseHeadline(s: string) {
  const m = s.match(/^\[risk (\d+)\]\s*(.+?)(?:\s*—\s*(\S+))?$/);
  if (!m) return { risk: null as number | null, title: s, source: null as string | null };
  return { risk: Number(m[1]), title: m[2], source: m[3] ?? null };
}

export function IntelCard() {
  const { data } = usePoll(
    () => deckTool<IntelData>("intel_news", { limit: 5 }),
    300_000
  );

  if (!data) return null;
  if (!data.success || !data.data?.headlines?.length) {
    return (
      <Panel title="Intel">
        <OfflineNote text="Osiris offline on :4000 — world intel unavailable." />
      </Panel>
    );
  }

  return (
    <Panel title="Intel">
      <ul className="space-y-2">
        {data.data.headlines.map((h, i) => {
          const { risk, title, source } = parseHeadline(h);
          return (
            <li key={i} className="flex gap-2">
              {risk !== null && (
                <span
                  className={`mt-px shrink-0 rounded border px-1 font-deckmono text-[9px] leading-4 ${
                    risk >= 8
                      ? "border-deck-alert/40 text-deck-alert"
                      : risk >= 6
                      ? "border-deck-line-bright text-deck-amber"
                      : "border-deck-line text-deck-faint"
                  }`}
                >
                  R{risk}
                </span>
              )}
              <p className="line-clamp-2 text-[11.5px] leading-snug text-deck-dim">
                {title}
                {source && (
                  <span className="ml-1 font-deckmono text-[9px] uppercase text-deck-faint">
                    {source}
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
