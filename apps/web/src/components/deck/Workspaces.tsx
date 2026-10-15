"use client";

import { useState } from "react";
import { usePoll, Dot } from "./deck-lib";

export type FocusId = "today" | "wavelength" | "content" | "ally" | "talk" | "agents";

export const FOCUS: { id: FocusId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "wavelength", label: "Wavelength" },
  { id: "content", label: "Content" },
  { id: "ally", label: "Ally" },
  { id: "talk", label: "Talk" },
  { id: "agents", label: "Agents" },
];

interface Integration {
  id: string;
  name: string;
  state: "ready" | "needs_key" | "offline";
  detail: string;
}

interface MediaJob {
  id: string;
  title: string;
  status: string;
  progress: number;
  detail: string;
  files: { name: string; label: string }[];
}

export function ArcReactor({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-block h-9 w-9 ${className}`} aria-hidden>
      <span
        className="absolute inset-0 rounded-full border border-deck-hot/40"
        style={{ animation: "spin 8s linear infinite" }}
      />
      <span className="absolute inset-1 rounded-full border border-dashed border-deck-gold/60" />
      <span className="absolute inset-2 animate-pulse rounded-full border border-deck-hot/80" />
      <span
        className="absolute inset-[34%] rounded-full"
        style={{
          background: "radial-gradient(circle, #fff6d8 0%, #00dcff 55%, transparent 100%)",
          boxShadow: "0 0 10px rgba(0, 220, 255, 0.7)",
        }}
      />
    </span>
  );
}

export function FocusBar({ value, onChange }: { value: FocusId; onChange: (id: FocusId) => void }) {
  return (
    <nav className="flex flex-wrap gap-2 px-4 py-3" aria-label="Workspace">
      {FOCUS.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`min-h-12 shrink-0 rounded border px-4 font-deckdisplay text-lg tracking-wide ${
              active
                ? "border-deck-hot bg-deck-raised text-deck-ink shadow-glow-sm"
                : "border-deck-line text-deck-dim hover:border-deck-line-bright hover:text-deck-ink"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function Action({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-16 rounded border border-deck-line-bright bg-deck-panel px-4 py-3 text-left transition-colors hover:border-deck-hot"
    >
      <span className="block font-deckdisplay text-xl text-deck-ink">{label}</span>
      <span className="mt-1 block text-sm text-deck-dim">{hint}</span>
    </button>
  );
}

function Shell({
  kicker,
  title,
  note,
  children,
}: {
  kicker: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6">
      <p className="font-deckmono text-xs uppercase tracking-[0.28em] text-deck-hot">{kicker}</p>
      <h2 className="font-deckdisplay text-4xl text-deck-ink">{title}</h2>
      {note && <p className="max-w-xl text-base leading-relaxed text-deck-dim">{note}</p>}
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export function IntegrationList() {
  const { data } = usePoll<{ integrations: Integration[] }>(
    async () => {
      const res = await fetch("/api/integrations", { cache: "no-store" });
      return res.json();
    },
    20_000
  );
  const rows = data?.integrations || [];
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start gap-2 text-sm">
          <span className="mt-1.5">
            <Dot tone={row.state === "ready" ? "ok" : row.state === "needs_key" ? "amber" : "alert"} />
          </span>
          <span>
            <span className="text-deck-ink">{row.name}</span>
            <span className="block text-deck-dim">{row.state === "needs_key" ? "needs key" : row.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TodayBoard({ onAct }: { onAct: (prompt: string) => void }) {
  const { data } = usePoll<{ task: { id: string; text: string; priority: string; due?: string } | null }>(
    async () => {
      const res = await fetch("/api/today", { cache: "no-store" });
      return res.json();
    },
    20_000
  );
  const task = data?.task;
  return (
    <Shell kicker="One thing" title="Today" note="One task. Finish it or hand it to Friday. Nothing else is on this screen.">
      <div className="rounded border border-deck-gold/70 bg-deck-panel p-5">
        <p className="font-deckmono text-xs uppercase tracking-wider text-deck-gold">Next</p>
        <p className="mt-2 font-deckdisplay text-3xl leading-tight text-deck-ink">
          {task?.text || "Nothing queued."}
        </p>
        {task?.due && <p className="mt-2 text-sm text-deck-dim">Due {task.due}</p>}
      </div>
      <Action
        label={task ? "Work this" : "Ask what matters"}
        hint="Opens Talk with one request. Drafts only."
        onClick={() =>
          onAct(
            task
              ? `Help me do this one task and nothing else: ${task.text}. Drafts only. Do not send, spend, or trade.`
              : "What is the single most useful thing for me to do today? One task."
          )
        }
      />
    </Shell>
  );
}

export function WavelengthBoard({ onAct }: { onAct: (prompt: string) => void }) {
  return (
    <Shell
      kicker="Wavelength Solutions"
      title="Agency"
      note="Websites, AI receptionists, automations. Drafts stay drafts until you approve a send."
    >
      <Action
        label="Lead list"
        hint="Who is waiting, from the vault."
        onClick={() => onAct("List my current Wavelength Solutions leads from the brain. Skip archive notes. Drafts only.")}
      />
      <Action
        label="Draft outreach"
        hint="Writes a draft. Does not send it."
        onClick={() => onAct("Draft outreach for Wavelength Solutions. Websites, AI receptionists, automations. Do not send it.")}
      />
      <Action
        label="Today's calls"
        hint="The calls that belong to today."
        onClick={() => onAct("What Wavelength Solutions calls should I make today? One list, current notes only.")}
      />
    </Shell>
  );
}

export function ContentBoard({ onAct }: { onAct: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const { data } = usePoll<{ jobs: MediaJob[] }>(
    async () => {
      const res = await fetch("/api/media", { cache: "no-store" });
      return res.json();
    },
    4_000
  );
  const subject = prompt.trim() || "a calm brass arc reactor on a dark bench";
  return (
    <Shell kicker="Content" title="Make something" note="One prompt, then one button. Progress stays in the gallery.">
      <label className="block text-sm text-deck-dim">
        Prompt
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-deck-line bg-deck-void p-3 text-base text-deck-ink outline-none focus:border-deck-hot"
          placeholder="What should we make?"
        />
      </label>
      <Action label="YouTube hook" hint="A spoken hook. No post." onClick={() => onAct(`Draft a YouTube hook about ${subject}. Draft only.`)} />
      <Action label="TikTok hook" hint="Short. Draft only." onClick={() => onAct(`Draft a TikTok hook about ${subject}. Draft only.`)} />
      <Action label="Script" hint="A short script. Does not publish." onClick={() => onAct(`Draft a short video script about ${subject}. Draft only.`)} />
      <Action label="Image" hint="Higgsfield. Needs a key if it is offline." onClick={() => onAct(`Make an image of ${subject}`)} />
      <Action label="Video" hint="Higgsfield text-to-video." onClick={() => onAct(`Make a video of ${subject}`)} />
      <Action label="3D model" hint="Meshy, then it lands in the gallery." onClick={() => onAct(`Make a 3D model of ${subject}`)} />
      <Action label="Blender preview" hint="Renders the latest model." onClick={() => onAct("Render it in Blender")} />
      <div>
        <p className="mb-2 font-deckmono text-xs uppercase tracking-wider text-deck-hot">Gallery</p>
        {(data?.jobs || []).length === 0 && <p className="text-sm text-deck-dim">No jobs yet.</p>}
        <ul className="grid gap-2">
          {(data?.jobs || []).map((job) => (
            <li key={job.id} className="rounded border border-deck-line p-3">
              <p className="text-base text-deck-ink">{job.title}</p>
              <p className="text-sm text-deck-dim">{job.status} · {job.progress}% · {job.detail}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.files.map((file) =>
                  /\.(png|jpe?g|webp)$/i.test(file.name) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={file.name} alt={file.label} src={`/api/media/file?name=${encodeURIComponent(file.name)}`} className="h-24 rounded border border-deck-line" />
                  ) : (
                    <a key={file.name} className="text-sm text-deck-hot underline" href={`/api/media/file?name=${encodeURIComponent(file.name)}`}>
                      {file.label}
                    </a>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

export function AllyBoard({ onAct }: { onAct: (prompt: string) => void }) {
  return (
    <Shell
      kicker="Ally Wellness Group"
      title="Enagic K8"
      note="With Russell Ally. Drafts only. No health claims. No income claims."
    >
      <Action
        label="Prospects"
        hint="Current people, not the archive."
        onClick={() => onAct("Who are my current Ally Wellness and Enagic prospects? Skip archive notes.")}
      />
      <Action
        label="Follow-ups"
        hint="Who to talk to next. Does not message them."
        onClick={() => onAct("Which Ally Wellness follow-ups are due? Draft only. Do not send messages.")}
      />
      <Action
        label="Compliant script"
        hint="A script with no health or income claims."
        onClick={() => onAct("Draft a compliant Enagic K8 follow-up script for Ally Wellness under Russell Ally. No health claims. No income claims. Do not send it.")}
      />
    </Shell>
  );
}
