"use client";

import { useEffect, useState } from "react";
import { useDemo } from "./demo";

interface BrainOption {
  id: "openai" | "xai" | "gemini";
  label: string;
  env: string;
  ready: boolean;
  selected: boolean;
}

interface BrainSnapshot {
  provider: string | null;
  active: string | null;
  options: BrainOption[];
  detail?: string;
  error?: string;
}

const ORDER: Array<BrainOption["id"]> = ["openai", "xai", "gemini"];

export function BrainProvider() {
  const { demo } = useDemo();
  const [snapshot, setSnapshot] = useState<BrainSnapshot | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    fetch("/api/settings/brain", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: BrainSnapshot) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled) setNote("Brain settings could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  async function choose(id: BrainOption["id"]) {
    if (demo) {
      setNote("Demo mode does not change the brain. Nothing was saved.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/settings/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id }),
      });
      const data = (await res.json()) as BrainSnapshot;
      if (!res.ok) {
        setNote(data.error || "Could not save the brain.");
        return;
      }
      setSnapshot(data);
      setNote(data.detail || "Saved.");
    } catch {
      setNote("Could not save the brain.");
    } finally {
      setBusy(false);
    }
  }

  const selected = demo ? "openai" : snapshot?.provider || snapshot?.active || "openai";

  return (
    <div className="rounded border border-deck-line bg-deck-panel p-4">
      <p className="font-deckmono text-xs uppercase tracking-wider text-deck-hot">
        {demo ? "Brain · SAMPLE" : "Brain"}
      </p>
      <p className="mt-2 text-sm text-deck-dim">
        openai, then xAI, then Gemini. A saved choice is tried first and overrides the environment.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={selected === id}
            disabled={busy}
            onClick={() => choose(id)}
            className={`min-h-12 rounded border px-3 text-sm ${
              selected === id ? "border-deck-hot text-deck-ink" : "border-deck-line text-deck-dim"
            }`}
          >
            {id}
          </button>
        ))}
      </div>
      {note && <p className="mt-2 text-sm text-deck-gold">{note}</p>}
      {!demo &&
        (snapshot?.options || [])
          .filter((option) => !option.ready)
          .map((option) => (
            <p key={option.id} className="mt-1 font-deckmono text-xs text-deck-gold">
              {option.env}
            </p>
          ))}
    </div>
  );
}
