"use client";

import { useEffect, useState } from "react";

interface Playing {
  title: string;
  url: string;
  embedUrl: string;
}

interface EarState {
  phase?: string;
  muted?: boolean;
  say?: string;
  pending?: { summary: string } | null;
  nowPlaying?: Playing | null;
}

function useEar(): { ear: EarState | null; offline: boolean; reload: () => void } {
  const [ear, setEar] = useState<EarState | null>(null);
  const [offline, setOffline] = useState(false);

  function reload() {
    fetch("/api/voice/ear", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setOffline(true);
          return;
        }
        setOffline(false);
        setEar(await res.json());
      })
      .catch(() => setOffline(true));
  }

  useEffect(() => {
    reload();
    const id = setInterval(reload, 2000);
    return () => clearInterval(id);
  }, []);

  return { ear, offline, reload };
}

export function VoiceEarPill() {
  const { ear, offline, reload } = useEar();
  const phase = offline ? "offline" : ear?.muted ? "muted" : ear?.phase || "asleep";
  const label =
    phase === "listening" ? "Listening" :
    phase === "confirming" ? "Say yes" :
    phase === "muted" ? "Muted" :
    phase === "thinking" || phase === "speaking" ? "Jarvis" :
    phase === "offline" ? "Ear off" :
    "Hey Jarvis";
  const hot = phase === "listening" || phase === "confirming";

  return (
    <button
      type="button"
      onClick={() => {
        void fetch("/api/voice/ear", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "mute" }),
        }).then(() => reload());
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        hot ? "border-info text-info" : phase === "muted" ? "border-warn/50 text-warn" : "border-line text-muted"
      }`}
      aria-pressed={phase === "muted"}
      aria-label={phase === "muted" ? "Unmute Hey Jarvis" : "Mute Hey Jarvis"}
      title={ear?.say || "Hey Jarvis is asleep until you say the wake word"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${hot ? "animate-pulse bg-info" : phase === "muted" ? "bg-warn" : "bg-ok"}`} />
      {label}
    </button>
  );
}

export function VoiceEarPlayer() {
  const { ear } = useEar();
  const playing = ear?.nowPlaying;
  if (!playing?.embedUrl) return null;
  return (
    <div className="border-b border-line bg-panel px-4 py-2">
      <p className="mb-2 text-xs text-muted">
        Playing {playing.title}{" "}
        <a className="text-brass hover:underline" href={playing.url} target="_blank" rel="noreferrer">
          open on YouTube
        </a>
      </p>
      <iframe
        title={playing.title}
        src={playing.embedUrl}
        className="h-28 w-full max-w-xl rounded border border-line"
        allow="autoplay; encrypted-media"
      />
    </div>
  );
}
