"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NeuralBrain from "./NeuralBrain";

// BootSequence — full-screen initialization overlay for the main window.
//
// Dark screen · arc-reactor ring · "TAP TO INITIALIZE". A user gesture is
// required before the browser will play audio, so the tap doubles as the
// audio unlock. On tap: boot SFX plays, the voice line chains off its
// `ended` event, a cascading boot log types out while the neural web fades
// in behind it, then the whole overlay fades away to reveal the deck.
//
// Shows once per browser session (sessionStorage.fridayBooted = "1").
// Missing/blocked audio degrades silently — the visual boot still runs.

const BOOT_LINES = [
  "NEURAL CORE .............. ONLINE",
  "VAULT LINK ............... ESTABLISHED",
  "TOOL MODULES ............. 54 LOADED",
  "VOICE SYNTHESIS .......... CALIBRATED",
  "SCHEDULER ................ ARMED",
  "SENSOR ARRAY ............. SWEEPING",
  "ALL SYSTEMS .............. OPERATIONAL",
];

const FIRST_LINE_MS = 350; // pause before the first log line
const LINE_MS = 420; // cascade speed
const HOLD_MS = 1400; // hold after the last line before fading
const FADE_MS = 900; // overlay fade-out duration

type Phase = "pending" | "waiting" | "booting" | "fading" | "done";

export default function BootSequence() {
  const [phase, setPhase] = useState<Phase>("pending");
  const [lineCount, setLineCount] = useState(0);
  const timers = useRef<number[]>([]);
  const started = useRef(false);

  useEffect(() => {
    try {
      setPhase(sessionStorage.getItem("fridayBooted") === "1" ? "done" : "waiting");
    } catch {
      setPhase("waiting");
    }
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const begin = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setPhase("booting");

    // Audio chain: SFX → (ended) → voice line. Every step failure-tolerant.
    const sfx = new Audio("/audio/friday-boot-sfx.mp3");
    const voice = new Audio("/audio/friday-boot-voice.mp3");
    let voiceStarted = false;
    const startVoice = () => {
      if (voiceStarted) return;
      voiceStarted = true;
      voice.play().catch(() => {});
    };
    sfx.addEventListener("ended", startVoice);
    sfx.addEventListener("error", startVoice);
    sfx.play().catch(startVoice);

    // Cascading boot log
    BOOT_LINES.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => setLineCount(i + 1), FIRST_LINE_MS + i * LINE_MS)
      );
    });

    const total = FIRST_LINE_MS + BOOT_LINES.length * LINE_MS + HOLD_MS;
    timers.current.push(
      window.setTimeout(() => {
        try {
          sessionStorage.setItem("fridayBooted", "1");
        } catch {
          /* private mode — boot will just replay next load */
        }
        setPhase("fading");
      }, total)
    );
    timers.current.push(window.setTimeout(() => setPhase("done"), total + FADE_MS));
  }, []);

  if (phase === "done") return null;

  const booting = phase === "booting" || phase === "fading";

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden transition-opacity ease-out ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "#020a14", transitionDuration: `${FADE_MS}ms` }}
      onClick={phase === "waiting" ? begin : undefined}
      role={phase === "waiting" ? "button" : undefined}
      aria-label={phase === "waiting" ? "Initialize FRIDAY" : undefined}
    >
      {/* Neural web fades in behind the boot log */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-[1600ms] ease-out"
        style={{ opacity: booting ? 0.55 : 0 }}
        aria-hidden
      >
        {booting && <NeuralBrain intensity={0.85} />}
      </div>

      {phase === "waiting" && (
        <div className="flex cursor-pointer select-none flex-col items-center gap-8">
          {/* Arc reactor */}
          <div className="relative h-36 w-36">
            <div
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: "rgba(0, 180, 255, 0.25)" }}
            />
            <div
              className="absolute inset-3 animate-ping rounded-full border-2"
              style={{
                borderColor: "rgba(0, 220, 255, 0.35)",
                animationDuration: "2.4s",
              }}
            />
            <div
              className="absolute inset-6 rounded-full border"
              style={{
                borderColor: "rgba(0, 220, 255, 0.5)",
                boxShadow:
                  "0 0 24px rgba(0, 210, 255, 0.35), inset 0 0 18px rgba(0, 210, 255, 0.25)",
              }}
            />
            <div
              className="absolute inset-[38%] animate-pulse rounded-full"
              style={{
                background:
                  "radial-gradient(circle, #4dffff 0%, #00b4ff 60%, transparent 100%)",
                boxShadow: "0 0 32px rgba(0, 220, 255, 0.8)",
              }}
            />
          </div>
          <h1
            className="font-display text-4xl font-bold tracking-[0.5em]"
            style={{
              color: "var(--fri-text-bright)",
              textShadow: "0 0 24px rgba(0, 220, 255, 0.6)",
            }}
          >
            F.R.I.D.A.Y.
          </h1>
          <p
            className="animate-pulse font-mono text-xs uppercase tracking-[0.4em]"
            style={{ color: "var(--fri-accent)" }}
          >
            Tap to initialize
          </p>
        </div>
      )}

      {booting && (
        <div className="relative w-[24rem] max-w-[90vw] font-mono text-[13px] leading-7">
          {BOOT_LINES.slice(0, lineCount).map((line, i) => (
            <p
              key={line}
              style={{
                color:
                  i === lineCount - 1
                    ? "var(--fri-accent-bright)"
                    : "var(--fri-text-dim)",
              }}
            >
              <span style={{ color: "var(--fri-success)" }}>▸ </span>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
