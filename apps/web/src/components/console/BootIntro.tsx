"use client";

// Once per browser session: a short arc-reactor boot, then Friday says
// "Hello, sir." through /api/tts (ElevenLabs, then Edge), then the browser
// voice. If autoplay is blocked, the greeting waits for the first click or key.

import { useEffect, useState } from "react";
import { readDemo } from "@/components/deck/demo";

const KEY = "friday-booted";
const LINES = ["ARC REACTOR · ONLINE", "F.R.I.D.A.Y. · NEURAL CORE", "SPECIALISTS · 6 STANDING BY", "LIVE APPS · LINKING"];

async function greet(): Promise<void> {
  const text = "Hello, sir.";
  const tryPlay = async (audio: HTMLAudioElement) => {
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  };
  let audio: HTMLAudioElement | null = null;
  try {
    const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (res.ok && (res.headers.get("content-type") || "").includes("audio")) {
      audio = new Audio(URL.createObjectURL(await res.blob()));
    }
  } catch {
    audio = null;
  }
  const browserVoice = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };
  if (audio && (await tryPlay(audio))) return;
  // Blocked or no audio: speak on the first gesture.
  const onGesture = () => {
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    if (audio) void tryPlay(audio).then((ok) => { if (!ok) browserVoice(); });
    else browserVoice();
  };
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);
}

export function BootIntro() {
  const [phase, setPhase] = useState<"off" | "on" | "fade">("off");
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (window.sessionStorage.getItem(KEY)) return;
    window.sessionStorage.setItem(KEY, "1");
    setPhase("on");
    if (!readDemo()) void greet();
    const ticks = LINES.map((_, index) => window.setTimeout(() => setLine(index), index * 420));
    const fade = window.setTimeout(() => setPhase("fade"), 2000);
    const done = window.setTimeout(() => setPhase("off"), 2600);
    return () => [...ticks, fade, done].forEach((id) => window.clearTimeout(id));
  }, []);

  if (phase === "off") return null;
  return (
    <div
      role="status"
      aria-label="Friday is starting"
      onClick={() => setPhase("off")}
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#07060a] stark-grid ${phase === "fade" ? "boot-fade" : ""}`}
    >
      <div className="relative">
        <div className="arc-ring red" />
        <div className="arc-ring" />
        <div className="arc-core" />
      </div>
      <p className="mt-16 font-mono text-xs uppercase tracking-[0.4em] text-[#ecb840]">F.R.I.D.A.Y.</p>
      <ul className="mt-4 grid gap-1 text-center font-mono text-[11px] tracking-[0.25em] text-[#5edcff]">
        {LINES.slice(0, line + 1).map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  );
}