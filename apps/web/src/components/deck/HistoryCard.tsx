"use client";

import { Message } from "@/types";
import { generateId } from "@/lib/utils";
import { Panel, usePoll, relTime } from "./deck-lib";

// Past conversations, resumable. Reads the orchestrator's on-disk transcripts.

interface ConvSummary {
  id: string;
  turns: number;
  firstAt: string;
  lastAt: string;
  firstUser: string;
}

export function HistoryCard({
  onLoad,
  activeId,
}: {
  onLoad: (id: string, msgs: Message[]) => void;
  activeId?: string | null;
}) {
  const { data, refresh } = usePoll<{ conversations: ConvSummary[] }>(
    () => fetch("/api/deck/conversations", { cache: "no-store" }).then((r) => r.json()),
    120_000
  );

  const convs = (data?.conversations ?? [])
    .slice()
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .slice(0, 8);

  if (convs.length === 0) return null;

  const load = async (id: string) => {
    try {
      const res = await fetch(`/api/deck/conversations/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const msgs: Message[] = (json.turns ?? []).map(
        (t: { role: string; content: string; timestamp?: string }) => ({
          id: generateId(),
          role: t.role === "user" ? "user" : "assistant",
          content: t.content,
          timestamp: new Date(t.timestamp ?? Date.now()),
        })
      );
      onLoad(id, msgs);
      refresh();
    } catch {
      // transcript unreadable — leave the deck as-is
    }
  };

  return (
    <Panel title="Log">
      <ul className="space-y-0.5 -mx-1.5">
        {convs.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => load(c.id)}
              className={`w-full rounded px-1.5 py-1.5 text-left transition-colors hover:bg-deck-raised ${
                c.id === activeId ? "bg-deck-raised" : ""
              }`}
            >
              <p className="line-clamp-1 text-[11.5px] leading-snug text-deck-dim">
                {c.firstUser || "…"}
              </p>
              <p className="font-deckmono text-[9px] uppercase tracking-wider text-deck-faint">
                {relTime(c.lastAt)} · {c.turns} turns
              </p>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
