"use client";

import { useEffect, useMemo, useState } from "react";
import type { FocusId } from "./Workspaces";

export interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => !q || `${item.label} ${item.hint}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-deck-void/80 px-4 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="deck-rise w-full max-w-lg rounded border border-deck-line-bright bg-deck-panel p-3 shadow-glow-md"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((n) => Math.min(n + 1, Math.max(matches.length - 1, 0)));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((n) => Math.max(n - 1, 0));
            }
            if (event.key === "Enter" && matches[cursor]) {
              matches[cursor].run();
              onClose();
            }
          }}
          placeholder="Jump, demo, or setup"
          className="min-h-12 w-full rounded border border-deck-line bg-deck-void px-3 text-base text-deck-ink outline-none focus:border-deck-hot"
        />
        <ul className="mt-2 grid max-h-80 gap-1 overflow-y-auto">
          {matches.length === 0 && <li className="px-2 py-3 text-sm text-deck-dim">No matching command.</li>}
          {matches.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className={`flex min-h-12 w-full items-center justify-between rounded px-3 text-left ${
                  index === cursor ? "bg-deck-raised text-deck-ink" : "text-deck-dim hover:bg-deck-raised"
                }`}
              >
                <span className="font-deckdisplay text-lg">{item.label}</span>
                <span className="font-deckmono text-xs uppercase">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-deckmono text-xs text-deck-dim">Ctrl+K opens this. Esc closes it. Ctrl+Enter still toggles live voice.</p>
      </div>
    </div>
  );
}

export function focusItems(onPick: (id: FocusId) => void, extra: PaletteItem[]): PaletteItem[] {
  const tabs: { id: FocusId; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "wavelength", label: "Wavelength" },
    { id: "content", label: "Content" },
    { id: "ally", label: "Ally" },
    { id: "talk", label: "Talk" },
    { id: "agents", label: "Agents" },
    { id: "learn", label: "Learn" },
    { id: "neural", label: "Neural Core" },
    { id: "mindspace", label: "Mindspace" },
  ];
  return [
    ...tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      hint: "Tab",
      run: () => onPick(tab.id),
    })),
    ...extra,
  ];
}
