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
  "TOOL MODULES ............. REGISTERED",
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

const GREETING = "Hey Daniel, how's it going boss? What do we need to do today?";

export default function BootSequence({ onFinished }: { onFinished?: () => void }) {
  const [phase, setPhase] = useState<Phase>("pending");
  const [lineCount, setLineCount] = useState(0);
  const [wakeBlob, setWakeBlob] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const started = useRef(false);
  const finished = useRef(false);
  const greetingKey = useRef("fridayGreeting:local");
  const greetingAudio = useRef<HTMLAudioElement | null>(null);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinished?.();
  }, [onFinished]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await fetch("/api/greeting", { cache: "no-store" }).then((res) => res.json());
        const key = `fridayGreeting:${meta.bootId || "offline"}`;
        greetingKey.current = key;
        if (sessionStorage.getItem(key) === "heard" || meta.status === "heard") {
          sessionStorage.setItem(key, "heard");
          if (!cancelled) setPhase("done");
          return;
        }
        const claimed = await fetch("/api/greeting", { method: "POST" });
        if (cancelled) return;
        if (claimed.status === 204) {
          sessionStorage.setItem(key, "heard");
          setPhase("done");
          return;
        }
        const type = claimed.headers.get("content-type") || "";
        if (!type.includes("audio")) {
          setPhase("waiting");
          return;
        }
        const url = URL.createObjectURL(await claimed.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        const audio = new Audio(url);
        greetingAudio.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        try {
          await audio.play();
          if (cancelled) {
            audio.pause();
            return;
          }
          sessionStorage.setItem(key, "heard");
          fetch("/api/greeting/heard", { method: "POST" }).catch(() => {});
          if (!cancelled) startVisual();
        } catch {
          if (!cancelled) {
            setWakeBlob(url);
            setPhase("waiting");
          }
        }
      } catch {
        if (!cancelled) setPhase("waiting");
      }
    })();
    const t = timers.current;
    return () => {
      cancelled = true;
      greetingAudio.current?.pause();
      t.forEach((id) => window.clearTimeout(id));
    };
    // startVisual is stable enough for this mount; the greeting must claim once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVisual = useCallback(() => {
    if (started.current) {
      finish();
      return;
    }
    started.current = true;
    setPhase("booting");
    BOOT_LINES.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setLineCount(i + 1), FIRST_LINE_MS + i * LINE_MS));
    });
    const total = FIRST_LINE_MS + BOOT_LINES.length * LINE_MS + HOLD_MS;
    timers.current.push(window.setTimeout(() => setPhase("fading"), total));
    timers.current.push(window.setTimeout(() => {
      setPhase("done");
      finish();
    }, total + FADE_MS));
  }, [finish]);

  const wake = useCallback(() => {
    if (!wakeBlob) {
      startVisual();
      return;
    }
    const audio = new Audio(wakeBlob);
    audio.onended = () => URL.revokeObjectURL(wakeBlob);
    audio.play().then(() => {
      try {
        sessionStorage.setItem(greetingKey.current, "heard");
      } catch { /* private mode */ }
      fetch("/api/greeting/heard", { method: "POST" }).catch(() => {});
      startVisual();
    }).catch(() => {
      startVisual();
    });
  }, [startVisual, wakeBlob]);

  if (phase === "done") return null;

  const booting = phase === "booting" || phase === "fading";

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden transition-opacity ease-out ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "#020a14", transitionDuration: `${FADE_MS}ms` }}
      onClick={phase === "waiting" ? wake : undefined}
      role={phase === "waiting" ? "button" : undefined}
      aria-label={phase === "waiting" ? "Wake Friday" : undefined}
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
            Wake Friday
          </p>
          <p className="max-w-md text-center font-body text-sm" style={{ color: "var(--fri-text-dim)" }}>
            {GREETING}
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
