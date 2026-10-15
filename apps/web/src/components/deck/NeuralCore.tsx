"use client";

import { useEffect, useState } from "react";
import { usePoll } from "./deck-lib";

export type ThoughtKind = "recall" | "tool" | "learning" | "repair" | "insight";

export interface Thought {
  id: string;
  at: string;
  kind: ThoughtKind;
  label: string;
  detail: string;
}

interface ThinkingStatus {
  enabled: boolean;
  reason: string;
  runsToday: number;
  cap: number;
  gapMinutes: number;
  insights: string[];
}

const KIND_COLOR: Record<ThoughtKind, string> = {
  recall: "#00dcff",
  tool: "#f5b942",
  learning: "#7dffb3",
  repair: "#ff5a6a",
  insight: "#efe7d2",
};

function mergeThoughts(current: Thought[], incoming: Thought[]): Thought[] {
  const byId = new Map<string, Thought>();
  for (const thought of [...current, ...incoming]) byId.set(thought.id, thought);
  return Array.from(byId.values()).slice(-40);
}

export function useThoughts() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const snapshot = usePoll<{ thoughts: Thought[] }>(
    async () => {
      const res = await fetch("/api/neural/thoughts", { cache: "no-store" });
      return res.json();
    },
    8_000
  );

  useEffect(() => {
    if (snapshot.data?.thoughts) setThoughts((current) => mergeThoughts(current, snapshot.data?.thoughts || []));
  }, [snapshot.data]);

  useEffect(() => {
    const source = new EventSource("/api/neural/stream");
    source.onmessage = (event) => {
      try {
        const thought = JSON.parse(event.data) as Thought;
        if (!thought?.id) return;
        setThoughts((current) => mergeThoughts(current, [thought]));
      } catch {
        // Ignore a malformed frame.
      }
    };
    return () => source.close();
  }, []);

  return thoughts;
}

export function ThoughtGraph({ thoughts, compact = false }: { thoughts: Thought[]; compact?: boolean }) {
  const nodes = thoughts.slice(-8);
  const size = compact ? 220 : 360;
  const center = size / 2;
  const radius = compact ? 72 : 120;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Friday activity graph">
      <circle cx={center} cy={center} r={radius + 8} fill="none" stroke="rgba(0,220,255,0.25)" />
      {nodes.map((thought, index) => {
        const angle = (-Math.PI / 2) + (index / Math.max(nodes.length, 1)) * Math.PI * 2;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        const color = KIND_COLOR[thought.kind] || "#efe7d2";
        return (
          <g key={thought.id}>
            <line x1={center} y1={center} x2={x} y2={y} stroke={color} strokeOpacity={0.7} />
            <circle cx={x} cy={y} r={compact ? 6 : 8} fill={color} />
            {!compact && (
              <text x={x} y={y - 12} textAnchor="middle" fill={color} fontSize="11">
                {thought.label.slice(0, 18)}
              </text>
            )}
          </g>
        );
      })}
      <circle cx={center} cy={center} r={compact ? 16 : 22} fill="#071018" stroke="#00dcff" />
      <text x={center} y={center + 4} textAnchor="middle" fill="#efe7d2" fontSize={compact ? 9 : 11}>
        Friday
      </text>
    </svg>
  );
}

export function NeuralMini() {
  const thoughts = useThoughts();
  const latest = thoughts.slice(-3).reverse();
  return (
    <div className="rounded border border-deck-line bg-deck-panel p-4">
      <p className="font-deckmono text-xs uppercase tracking-wider text-deck-hot">Neural Core</p>
      <ThoughtGraph thoughts={thoughts} compact />
      {latest.length === 0 ? (
        <p className="text-sm text-deck-dim">Quiet. Notes, tools, and repairs show up here as Friday works.</p>
      ) : (
        <ul className="grid gap-1">
          {latest.map((thought) => (
            <li key={thought.id} className="text-sm text-deck-ink">
              <span className="font-deckmono text-xs uppercase text-deck-dim">{thought.kind}</span> {thought.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NeuralCoreBoard() {
  const thoughts = useThoughts();
  const feed = [...thoughts].reverse().slice(0, 12);
  const thinking = usePoll<ThinkingStatus>(
    async () => {
      const res = await fetch("/api/neural/thinking", { cache: "no-store" });
      return res.json();
    },
    8_000
  );
  const [busy, setBusy] = useState(false);
  const status = thinking.data;

  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/neural/thinking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !status?.enabled }),
      });
      await thinking.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6">
      <p className="font-deckmono text-xs uppercase tracking-[0.28em] text-deck-hot">Live activity</p>
      <h2 className="font-deckdisplay text-4xl text-deck-ink">Neural Core</h2>
      <p className="max-w-xl text-base leading-relaxed text-deck-dim">
        This graph reads Friday&apos;s real activity: notes recalled, tools fired, facts written, and repairs.
        Reasoning stays with the language model and the Obsidian vault.
      </p>
      <div className="rounded border border-deck-line bg-deck-panel p-3">
        <ThoughtGraph thoughts={thoughts} />
      </div>
      <div>
        <p className="mb-2 font-deckmono text-xs uppercase tracking-wider text-deck-hot">Live feed</p>
        {feed.length === 0 && <p className="text-sm text-deck-dim">No links yet. Talk to Friday and this list fills in.</p>}
        <ul className="grid gap-2">
          {feed.map((thought) => (
            <li key={thought.id} className="rounded border border-deck-line px-3 py-2 text-sm">
              <span className="font-deckmono text-xs uppercase" style={{ color: KIND_COLOR[thought.kind] }}>{thought.kind}</span>
              <span className="ml-2 text-deck-ink">{thought.label}</span>
              <span className="mt-1 block text-deck-dim">{thought.detail}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded border border-deck-gold/70 bg-deck-panel p-4">
        <p className="font-deckmono text-xs uppercase tracking-wider text-deck-gold">Thinking loop</p>
        <p className="mt-2 text-sm leading-relaxed text-deck-dim">
          Off until you arm it. At most {status?.cap ?? 4} passes a day, {status?.gapMinutes ?? 30} minutes apart.
          Insights land in FRIDAY_BRAIN/insights/. Profile lines are proposals. You edit DANNY-PROFILE.md yourself.
          The loop does not send, spend, or trade.
        </p>
        <p className="mt-2 text-sm text-deck-ink">{status?.reason || "Thinking loop is off."}</p>
        <p className="mt-1 text-sm text-deck-dim">Passes today: {status?.runsToday ?? 0}</p>
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className="mt-3 min-h-12 w-full rounded border border-deck-hot bg-deck-raised px-4 font-deckdisplay text-lg text-deck-ink"
        >
          {status?.enabled ? "Stop thinking" : "Arm thinking"}
        </button>
        {(status?.insights || []).length > 0 && (
          <ul className="mt-3 grid gap-1">
            {status?.insights.map((line) => (
              <li key={line} className="text-sm text-deck-ink">{line}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
