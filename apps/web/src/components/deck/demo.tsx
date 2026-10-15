"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "friday-demo";
const EVENT = "friday-demo";

export function readDemo(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function writeDemo(on: boolean): void {
  window.localStorage.setItem(KEY, on ? "1" : "0");
  window.dispatchEvent(new Event(EVENT));
}

export function useDemo() {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const sync = () => setDemo(readDemo());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = useCallback(() => writeDemo(!readDemo()), []);
  return { demo, toggle };
}

export const SAMPLE_TASK = "Review the sample launch checklist";
export const SAMPLE_LEARNING = [
  "SAMPLE · preference · Operator: Prefers a one-screen morning brief.",
  "SAMPLE · fact · Northwind Studio: A fictional agency used only in demo mode.",
];
export const SAMPLE_INSIGHTS = ["SAMPLE · The deck can be shown without a live vault."];
export const SAMPLE_THOUGHTS = [
  { id: "sample-1", at: "2026-10-15T15:00:00.000Z", kind: "recall" as const, label: "sample-note", detail: "SAMPLE / notes / launch-checklist.md" },
  { id: "sample-2", at: "2026-10-15T15:01:00.000Z", kind: "tool" as const, label: "brain_recall", detail: "SAMPLE query: launch checklist" },
  { id: "sample-3", at: "2026-10-15T15:02:00.000Z", kind: "learning" as const, label: "Northwind Studio", detail: "SAMPLE fact written for the demo" },
  { id: "sample-4", at: "2026-10-15T15:03:00.000Z", kind: "repair" as const, label: "needs_approval", detail: "SAMPLE repair waiting. Nothing was merged." },
];
export const SAMPLE_INTEGRATIONS = [
  { id: "meshy", name: "Meshy", state: "ready" as const, detail: "SAMPLE — no key is loaded" },
  { id: "higgsfield", name: "Higgsfield", state: "ready" as const, detail: "SAMPLE — no key is loaded" },
  { id: "xai", name: "xAI Grok", state: "ready" as const, detail: "SAMPLE — no key is loaded" },
];
export const SAMPLE_CHECKS = [
  { id: "openai", label: "OpenAI key", ok: true, env: "OPENAI_API_KEY", detail: "SAMPLE — a key is not shown." },
  { id: "xai", label: "xAI fallback", ok: true, env: "XAI_API_KEY", detail: "SAMPLE — a key is not shown.", optional: true },
  { id: "vault", label: "Obsidian vault", ok: true, env: "OBSIDIAN_VAULT_PATH", detail: "SAMPLE vault. No personal notes." },
  { id: "voice", label: "Voice", ok: true, env: "ELEVENLABS_API_KEY", detail: "SAMPLE voice. No account is connected." },
];

export const SAMPLE_AGENTS = [
  { id: "sample-bot", name: "Sample Bot", kind: "grok-bot" as const, state: "online" as const, detail: "SAMPLE — no key is loaded", render: "dot" as const, canDispatch: false },
  { id: "sample-writer", name: "Sample Writer", kind: "codex" as const, state: "online" as const, detail: "SAMPLE — dispatch stays off", render: "row" as const, canDispatch: false },
];

export const SAMPLE_GREETING = "Sample deck is ready. This greeting is not from a live account.";
