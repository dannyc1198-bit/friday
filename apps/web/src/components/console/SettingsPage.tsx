"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDemo } from "@/components/deck/demo";
import { applyTheme, readTheme, type ThemeName } from "./theme";
import { NeedsKey, PageHeader, StateBlock } from "./States";
import { useResource } from "./useResource";

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

interface SetupCheck {
  id: string;
  label: string;
  ok: boolean;
  env: string;
  detail: string;
  optional?: boolean;
}

const SAMPLE_BRAIN: BrainSnapshot = {
  provider: "openai",
  active: "openai",
  options: [
    { id: "openai", label: "OpenAI", env: "OPENAI_API_KEY", ready: true, selected: true },
    { id: "xai", label: "xAI", env: "XAI_API_KEY", ready: true, selected: false },
    { id: "gemini", label: "Gemini", env: "GEMINI_API_KEY", ready: true, selected: false },
  ],
};

const SAMPLE_SETUP = {
  ready: true,
  checks: [
    { id: "openai", label: "OpenAI key", ok: true, env: "OPENAI_API_KEY", detail: "SAMPLE — a key is not shown." },
    { id: "voice", label: "Voice", ok: true, env: "ELEVENLABS_API_KEY", detail: "SAMPLE voice. No account is connected." },
  ] as SetupCheck[],
};

const SAMPLE_HEALTH = { ok: true, llm: { configured: true, provider: "sample", model: "sample" }, tts: true };

export function SettingsPage() {
  const { demo, toggle } = useDemo();
  const setup = useResource<typeof SAMPLE_SETUP>("/api/setup", SAMPLE_SETUP);
  const health = useResource<typeof SAMPLE_HEALTH>("/api/health", SAMPLE_HEALTH);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [brain, setBrain] = useState<BrainSnapshot | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    if (demo) {
      setBrain(SAMPLE_BRAIN);
      return;
    }
    fetch("/api/settings/brain", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: BrainSnapshot) => setBrain(data))
      .catch(() => setNote("Brain settings could not be read."));
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
      setBrain(data);
      setNote(data.detail || "Saved to data/settings.json.");
    } catch {
      setNote("Could not save the brain.");
    } finally {
      setBusy(false);
    }
  }

  const needsKey = !demo && Boolean(health.data) && health.data?.llm?.configured === false;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <PageHeader kicker="System" title="Settings" detail="Theme and demo stay in this browser. The brain choice is saved to data/settings.json, never to .env." />
      <NeedsKey show={needsKey} />
      <section className="grid gap-3">
        <article className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold text-ink">Appearance</h2>
          <div className="mt-3 flex gap-2">
            {(["dark", "light"] as ThemeName[]).map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={theme === name}
                className={`rounded-full border px-3 py-1.5 text-sm capitalize ${theme === name ? "border-brass text-brass" : "border-line text-muted"}`}
                onClick={() => {
                  applyTheme(name);
                  setTheme(name);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </article>
        <article className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold text-ink">Demo</h2>
          <p className="mt-1 text-sm text-muted">Sample data only. Sends, approvals, and the microphone stay off.</p>
          <button type="button" aria-pressed={demo} onClick={toggle} className="mt-3 rounded-full border border-line px-3 py-1.5 text-sm text-ink">
            {demo ? "Turn demo off" : "Turn demo on"}
          </button>
        </article>
        <article className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold text-ink">Brain</h2>
          <p className="mt-1 text-sm text-muted">A saved choice is tried first. openai, then xAI, then Gemini. Missing keys are skipped.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(brain?.options || []).map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                aria-pressed={option.selected || brain?.provider === option.id}
                onClick={() => void choose(option.id)}
                className={`rounded-full border px-3 py-1.5 text-sm disabled:opacity-40 ${option.selected || brain?.provider === option.id ? "border-brass text-brass" : "border-line text-ink"}`}
              >
                {option.label}{option.ready ? "" : " · needs key"}
              </button>
            ))}
          </div>
          {!brain && <p className="mt-3 text-sm text-muted">Reading brain settings…</p>}
          {note && <p className="mt-3 text-sm text-brass">{note}</p>}
        </article>
        <article className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold text-ink">Voice</h2>
          <p className="mt-1 text-sm text-muted">Hands-free lives on Talk. Ctrl+Enter starts it. ElevenLabs speaks first, then the browser voice.</p>
          <Link href="/talk" className="mt-3 inline-flex text-sm text-brass hover:underline">Open Talk</Link>
        </article>
        <article className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold text-ink">Setup</h2>
          {setup.loading && <StateBlock kind="loading" title="Checking setup" detail="Reading which keys are present. Values are never shown." />}
          {setup.error && <StateBlock kind="error" title="Setup unavailable" detail={setup.error} />}
          <ul className="mt-3 grid gap-2">
            {(setup.data?.checks || []).map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <span className="text-ink">{check.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{check.detail}</span>
                </span>
                <span className={check.ok ? "text-ok" : "text-warn"}>{check.ok ? "Ready" : check.optional ? "Optional" : "Needs key"}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold text-ink">Flight deck</h2>
          <p className="mt-1 text-sm text-muted">The previous window is still available, including Neural Core.</p>
          <Link href="/deck" className="mt-3 inline-flex text-sm text-brass hover:underline">Open flight deck</Link>
        </article>
      </section>
    </div>
  );
}
