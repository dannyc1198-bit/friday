"use client";

// VoiceChat — minimal live voice chat UI.
//
// Pipeline:
//   1. User clicks mic → request mic permission + start Web Speech API recognition
//   2. Browser produces final transcript → sent over WebSocket as JSON
//   3. Backend streams LLM response (assistant_delta) → we accumulate for display
//   4. Backend synthesizes full reply on Lily → binary MP3 frame arrives → play
//   5. After playback, mic stays armed; next user utterance starts the next turn
//
// Web Speech API only — Chrome / Edge. Firefox/Safari users see a fallback notice.
// Audio is one MP3 buffer per turn (not chunked) — keeps the playback path trivial.

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────

type Phase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

// Use built-in DOM SpeechRecognition types. webkitSpeechRecognition isn't on
// every lib.dom revision, so we widen via a local lookup type.
type SRCtor = typeof SpeechRecognition;
function getSRCtor(): SRCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

// ─── Constants ──────────────────────────────────────────────

// Connect directly to the orchestrator's WS endpoint. The orchestrator binds to
// 127.0.0.1 and bypasses auth for /v1/voice on localhost, so the browser can
// open the socket without a Bearer header (browsers can't set one on WS anyway).
const WS_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_WS ||
  "ws://localhost:3001/v1/voice";

// Time to wait after FRIDAY finishes speaking before re-arming the mic.
// Too low and we capture the tail of her audio bleeding through the speakers.
const REARM_DELAY_MS = 400;

// ─── Component ──────────────────────────────────────────────

export function VoiceChat() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Active state is read inside event handlers that capture stale closures.
  // Ref keeps the handlers reading the latest value.
  const activeRef = useRef(false);
  activeRef.current = active;

  // ─── Feature detection ──────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(Boolean(getSRCtor()));
  }, []);

  // ─── Helpers ────────────────────────────────────────────

  const stopRecognition = useCallback(() => {
    const r = recogRef.current;
    if (!r) return;
    try {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      r.abort();
    } catch {
      /* already stopped */
    }
    recogRef.current = null;
  }, []);

  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
    audioRef.current = null;
  }, []);

  const clearRearmTimer = useCallback(() => {
    if (rearmTimerRef.current) {
      clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
  }, []);

  // ─── Speech Recognition lifecycle ───────────────────────

  const startListening = useCallback(() => {
    if (!activeRef.current) return;

    const Ctor = getSRCtor();
    if (!Ctor) {
      setErrorMsg("Web Speech API not supported in this browser. Try Chrome or Edge.");
      setPhase("error");
      return;
    }

    stopRecognition();

    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-US";
    recogRef.current = r;

    let finalText = "";

    r.onstart = () => {
      if (!activeRef.current) return;
      setPhase("listening");
      setInterim("");
    };

    r.onresult = (e) => {
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimChunk += res[0].transcript;
      }
      if (interimChunk) setInterim(interimChunk);
    };

    r.onerror = (e) => {
      // "no-speech" and "aborted" are routine — quietly re-arm.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setErrorMsg(`mic error: ${e.error}`);
      setPhase("error");
    };

    r.onend = () => {
      const text = finalText.trim();
      if (!activeRef.current) return;
      setInterim("");
      if (text) {
        setUserText(text);
        setAssistantText("");
        setPhase("thinking");
        wsRef.current?.send(JSON.stringify({ type: "transcript", text }));
      } else {
        // No speech detected — re-arm without bothering the backend.
        rearmTimerRef.current = setTimeout(() => {
          if (activeRef.current && phase !== "speaking" && phase !== "thinking") {
            startListening();
          }
        }, REARM_DELAY_MS);
      }
    };

    try {
      r.start();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "recognition start failed");
      setPhase("error");
    }
  }, [phase, stopRecognition]);

  // ─── Audio playback ─────────────────────────────────────

  const playAudioBuffer = useCallback(
    (buf: ArrayBuffer): Promise<void> => {
      return new Promise((resolve) => {
        const blob = new Blob([buf], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        audioRef.current = a;

        const cleanup = () => {
          URL.revokeObjectURL(url);
          if (audioRef.current === a) audioRef.current = null;
          resolve();
        };

        a.onended = cleanup;
        a.onerror = cleanup;
        a.play().catch(() => cleanup());
      });
    },
    []
  );

  const speakBrowserFallback = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window) || !text.trim()) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }, []);

  // ─── WebSocket lifecycle ────────────────────────────────

  const openSocket = useCallback(() => {
    setPhase("connecting");
    setErrorMsg(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "WebSocket construction failed");
      setPhase("error");
      return;
    }
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    // Per-turn audio buffer. We accept one binary frame == one full utterance.
    let pendingAudio: ArrayBuffer | null = null;
    let pendingMime = "audio/mpeg";
    let pendingFullText = "";

    ws.onopen = () => {
      // First "ready" frame arrives shortly after.
    };

    ws.onmessage = async (event) => {
      // Binary path — audio bytes
      if (event.data instanceof ArrayBuffer) {
        pendingAudio = event.data;
        return;
      }

      // Text path — JSON control frame
      let frame: { type: string; [k: string]: unknown };
      try {
        frame = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        return;
      }

      switch (frame.type) {
        case "ready":
          if (!activeRef.current) return;
          startListening();
          break;

        case "assistant_delta": {
          const t = typeof frame.text === "string" ? frame.text : "";
          if (t) setAssistantText((prev) => prev + t);
          break;
        }

        case "assistant_done": {
          pendingFullText = typeof frame.text === "string" ? frame.text : "";
          break;
        }

        case "audio_start": {
          pendingAudio = null;
          pendingMime = typeof frame.mime === "string" ? frame.mime : "audio/mpeg";
          break;
        }

        case "audio_end": {
          if (!activeRef.current) break;
          setPhase("speaking");
          if (pendingAudio) {
            await playAudioBuffer(pendingAudio);
          }
          pendingAudio = null;
          // Re-arm mic for next turn after a brief settle period.
          if (activeRef.current) {
            rearmTimerRef.current = setTimeout(() => startListening(), REARM_DELAY_MS);
          }
          // Reference the mime so it isn't reported unused by linters and to
          // make future format negotiation explicit.
          if (pendingMime && pendingMime !== "audio/mpeg") {
            console.debug("[VoiceChat] audio mime:", pendingMime);
          }
          break;
        }

        case "audio_unavailable": {
          // No ElevenLabs key on the orchestrator — speak via browser TTS.
          if (!activeRef.current) break;
          setPhase("speaking");
          await speakBrowserFallback(pendingFullText);
          if (activeRef.current) {
            rearmTimerRef.current = setTimeout(() => startListening(), REARM_DELAY_MS);
          }
          break;
        }

        case "error": {
          const msg = typeof frame.message === "string" ? frame.message : "server error";
          setErrorMsg(msg);
          // Don't kill the session on soft errors — re-arm so the user can retry.
          if (activeRef.current) {
            rearmTimerRef.current = setTimeout(() => startListening(), REARM_DELAY_MS);
          }
          break;
        }

        default:
          break;
      }
    };

    ws.onerror = () => {
      setErrorMsg("WebSocket connection error — is the orchestrator running on :3001?");
      setPhase("error");
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (activeRef.current) {
        setActive(false);
        setPhase("idle");
      }
    };
  }, [playAudioBuffer, speakBrowserFallback, startListening]);

  // ─── User actions ───────────────────────────────────────

  const start = useCallback(async () => {
    if (active) return;
    if (!supported) {
      setErrorMsg("Web Speech API not supported. Try Chrome or Edge.");
      setPhase("error");
      return;
    }

    // Pre-prompt mic permission via getUserMedia so the user sees the browser
    // chrome before recognition tries to start (recognition triggers the same
    // prompt, but timing is less predictable).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We don't actually keep the stream — Web Speech API opens its own.
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Microphone permission denied");
      setPhase("error");
      return;
    }

    setActive(true);
    setUserText("");
    setAssistantText("");
    setInterim("");
    setErrorMsg(null);
    openSocket();
  }, [active, supported, openSocket]);

  const stop = useCallback(() => {
    setActive(false);
    clearRearmTimer();
    stopRecognition();
    stopAudio();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    setPhase("idle");
    setInterim("");
  }, [clearRearmTimer, stopRecognition, stopAudio]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearRearmTimer();
      stopRecognition();
      stopAudio();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [clearRearmTimer, stopRecognition, stopAudio]);

  // ─── Render ─────────────────────────────────────────────

  const STATUS_LABEL: Record<Phase, string> = {
    idle: "Tap to start",
    connecting: "Connecting…",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    error: "Error",
  };

  const ringColor =
    phase === "listening" ? "ring-cyan-400/60"
    : phase === "thinking"  ? "ring-amber-400/60"
    : phase === "speaking"  ? "ring-emerald-400/60"
    : phase === "error"     ? "ring-red-500/60"
    : "ring-zinc-700/40";

  const buttonBg =
    !active
      ? "bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300"
      : phase === "listening" ? "bg-cyan-500 text-black shadow-[0_0_30px_rgba(34,211,238,0.55)]"
      : phase === "thinking"  ? "bg-amber-400 text-black shadow-[0_0_25px_rgba(251,191,36,0.55)]"
      : phase === "speaking"  ? "bg-emerald-400 text-black shadow-[0_0_25px_rgba(52,211,153,0.55)]"
      : phase === "error"     ? "bg-red-500 text-white"
      :                          "bg-zinc-700 text-zinc-200";

  return (
    <div className="flex flex-col items-center gap-5 p-6 rounded-2xl bg-black/40 border border-zinc-800 backdrop-blur w-full max-w-md mx-auto">
      <button
        type="button"
        onClick={active ? stop : start}
        disabled={!supported}
        className={`relative p-6 rounded-full ring-2 transition-all duration-300 ${ringColor} ${buttonBg} ${
          active && phase === "listening" ? "animate-pulse" : ""
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label={active ? "Stop voice chat" : "Start voice chat"}
      >
        {active ? (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            phase === "listening" ? "bg-cyan-400 animate-pulse"
            : phase === "thinking"  ? "bg-amber-400 animate-pulse"
            : phase === "speaking"  ? "bg-emerald-400 animate-pulse"
            : phase === "error"     ? "bg-red-500"
            : "bg-zinc-600"
          }`}
        />
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-400">
          {STATUS_LABEL[phase]}
        </span>
      </div>

      {!supported && (
        <p className="text-xs text-red-400 text-center">
          Web Speech API not available. Use Chrome or Edge for voice input.
        </p>
      )}

      {errorMsg && (
        <p className="text-xs text-red-300 text-center max-w-xs">{errorMsg}</p>
      )}

      {/* Live transcript while user speaks */}
      {interim && (
        <div className="w-full">
          <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500 mb-1">you (speaking)</div>
          <p className="text-sm italic text-zinc-400">{interim}</p>
        </div>
      )}

      {/* Last finalized user turn */}
      {!interim && userText && (
        <div className="w-full">
          <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500 mb-1">you</div>
          <p className="text-sm text-zinc-300">{userText}</p>
        </div>
      )}

      {/* FRIDAY's streaming response */}
      {assistantText && (
        <div className="w-full">
          <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-cyan-500/70 mb-1">friday</div>
          <p className="text-sm text-cyan-100 whitespace-pre-wrap leading-snug">{assistantText}</p>
        </div>
      )}
    </div>
  );
}
