"use client";

import { useEffect, useState } from "react";
import { usePoll } from "./deck-lib";
import { useDemo } from "./demo";

interface Card {
  id: string;
  name: string;
  glyph: string;
  role: string;
  adversarial: boolean;
  status: string;
  lastTask: string;
  lastSummary: string;
  voiceLabel: string;
}

const ROSTER: Card[] = [
  { id: "jarvis", name: "J.A.R.V.I.S.", glyph: "J", role: "Security and money", adversarial: false, status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Thomas" },
  { id: "edith", name: "E.D.I.T.H.", glyph: "E", role: "Content and creative", adversarial: false, status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Jenny" },
  { id: "dume", name: "DUM-E", glyph: "D", role: "Builder", adversarial: false, status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge William" },
  { id: "u", name: "U", glyph: "U", role: "Sales and clients", adversarial: false, status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Sonia" },
  { id: "vision", name: "VISION", glyph: "V", role: "Coach and planner", adversarial: false, status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Christopher" },
  { id: "ultron", name: "ULTRON", glyph: "X", role: "Red team", adversarial: true, status: "idle", lastTask: "", lastSummary: "", voiceLabel: "Edge Eric" },
];

const SAMPLE: Card[] = ROSTER.map((card) => ({
  ...card,
  status: "idle",
  lastTask: "SAMPLE · no live task",
  lastSummary: "Sample card. Demo mode does not call the specialists.",
}));

async function loadMindspace(): Promise<{ specialists: Card[]; friday?: { status?: string } }> {
  const res = await fetch("/api/mindspace", { cache: "no-store" });
  if (!res.ok) throw new Error("mindspace unavailable");
  return res.json();
}

function merge(live: Card[] | undefined, demo: boolean): Card[] {
  if (demo) return SAMPLE;
  const byId = new Map((live || []).map((card) => [card.id, card]));
  return ROSTER.map((card) => ({ ...card, ...(byId.get(card.id) || {}) }));
}

export function MindspaceBoard({ onTalk }: { onTalk: (prefix: string) => void }) {
  const { demo } = useDemo();
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!demo) setNote("");
  }, [demo]);
  const { data, stale } = usePoll(loadMindspace, 4000, !demo);
  const cards = merge(data?.specialists, demo);
  const top = cards.slice(0, 3);
  const bottom = cards.slice(3);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-6">
      <p className="font-deckmono text-xs uppercase tracking-[0.28em] text-deck-hot">VisionQuest</p>
      <h2 className="font-deckdisplay text-4xl text-deck-ink">Mindspace</h2>
      <p className="max-w-xl text-base text-deck-dim">
        Friday routes the request. The six stay in their own rooms. Ultron can only criticise.
        {demo ? " Sample cards. Nothing is live." : stale ? " Last reading kept." : ""}
      </p>
      {note && <p className="text-sm text-deck-gold">{note}</p>}
      <div className="grid gap-3 md:grid-cols-3">{top.map((card) => <SpecialistCard key={card.id} card={card} onTalk={onTalk} demo={demo} onBlocked={setNote} />)}</div>
      <div className="mx-auto flex h-28 w-28 flex-col items-center justify-center rounded-full border border-deck-hot bg-deck-panel shadow-glow-sm">
        <span className="font-deckdisplay text-2xl text-deck-ink">F</span>
        <span className="font-deckmono text-[10px] uppercase tracking-[0.2em] text-deck-hot">
          {demo ? "Friday" : data?.friday?.status === "orchestrating" ? "Routing" : "Friday"}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">{bottom.map((card) => <SpecialistCard key={card.id} card={card} onTalk={onTalk} demo={demo} onBlocked={setNote} />)}</div>
    </section>
  );
}

function SpecialistCard({
  card,
  onTalk,
  demo,
  onBlocked,
}: {
  card: Card;
  onTalk: (prefix: string) => void;
  demo: boolean;
  onBlocked: (note: string) => void;
}) {
  const hot = card.status === "working";
  return (
    <article className={`flex min-h-44 flex-col gap-2 rounded border bg-deck-panel p-4 ${card.adversarial ? "border-deck-alert" : "border-deck-line"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-deckdisplay text-3xl text-deck-ink">{card.glyph}</span>
        <span className={`font-deckmono text-[10px] uppercase tracking-wider ${hot ? "text-deck-hot" : "text-deck-dim"}`}>
          {card.status}
        </span>
      </div>
      <h3 className="font-deckdisplay text-xl text-deck-ink">{card.name}</h3>
      <p className="text-sm text-deck-dim">{card.role}</p>
      {card.adversarial && <p className="font-deckmono text-[10px] uppercase tracking-wider text-deck-alert">Adversarial · read only</p>}
      <p className="text-sm text-deck-ink">{card.lastTask || "No task yet."}</p>
      <p className="font-deckmono text-[10px] uppercase tracking-wider text-deck-faint">{card.voiceLabel}</p>
      <button
        type="button"
        onClick={() => {
          if (demo) {
            onBlocked("Demo mode does not send. Nothing left this browser.");
            return;
          }
          onTalk(`${card.name}, `);
        }}
        className="mt-auto min-h-10 rounded border border-deck-line-bright px-3 text-left font-deckdisplay text-lg text-deck-ink hover:border-deck-hot"
      >
        Talk to
      </button>
    </article>
  );
}
