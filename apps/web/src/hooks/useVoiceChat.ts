"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { JARVIS_SPEECH_PITCH, JARVIS_SPEECH_RATE, pickJarvisVoice } from "@/lib/jarvis-voice";

// ─── Constants ──────────────────────────────────────────────

// Breathing room between FRIDAY finishing and the mic re-arming.
// Too short → feels twitchy and clips your "uh, actually..." moment.
// Too long → conversation feels laggy.
const REARM_DELAY_MS = 600;
const TTS_MAX_LENGTH = 5000;

// ─── Types ──────────────────────────────────────────────────

export type VoiceChatPhase = "idle" | "listening" | "thinking" | "speaking";

interface UseVoiceChatReturn {
  /** Live-chat session is on (mic + auto-rearm loop active) */
  isActive: boolean;
  /** Current phase of the turn cycle */
  phase: VoiceChatPhase;
  /** Most recent final user transcript */
  userText: string;
  /** Live partial transcript (filled while user is speaking, cleared on submit) */
  interimText: string;
  /** Streaming or finalized FRIDAY response text */
  assistantText: string;
  /** Last error from speech recognition / chat / tts */
  error: string | null;
  /** Browser supports Web Speech API */
  supported: boolean;
  /** Toggle session on/off — requires user gesture for first activation */
  toggle: () => void;
  /** Clear any error and try to re-arm */
  retry: () => void;
}

// ─── Hook ───────────────────────────────────────────────────

/**
 * Hands-free continuous voice conversation loop.
 *
 *   user speaks → recognition.onresult (final) → POST /api/chat (stream) →
 *   response text → POST /api/tts → play audio → rearm recognition → repeat
 *
 * The mic is closed while FRIDAY is speaking so the TTS audio doesn't get
 * picked up as a new user turn (the AEC fix in useWakeDetection drops echo
 * cancellation, so we have to manually gate the mic instead of relying on it).
 */
export function useVoiceChat(): UseVoiceChatReturn {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<VoiceChatPhase>("idle");
  const [userText, setUserText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs mirror the phase/active flags so async callbacks (recognition.onresult,
  // audio.onended) read current values without stale-closure bugs.
  const isActiveRef = useRef(false);
  const phaseRef    = useRef<VoiceChatPhase>("idle");
  const setPhaseSafe = useCallback((p: VoiceChatPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // ─── Detect support ────────────────────────────────────────
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // ─── Recognition lifecycle ─────────────────────────────────

  const startRecognition = useCallback(() => {
    if (!isActiveRef.current) return;
    if (phaseRef.current === "thinking" || phaseRef.current === "speaking") return;
    if (recognitionRef.current) return; // already listening

    const SR =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) {
      setError("Web Speech API not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SR();
    // continuous=true keeps the mic open across natural pauses; we still get
    // isFinal results between phrases. interimResults=true is on for live UI
    // feedback even though we only submit on final (the user's spec called for
    // interimResults=false, but the UX requirement "show the live transcript
    // as it comes in" needs interim — so we show interim, submit final).
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    let pendingFinal = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          pendingFinal += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);

      if (pendingFinal.trim()) {
        const text = pendingFinal.trim();
        pendingFinal = "";
        setInterimText("");
        // Stop recognition before kicking off chat — Chrome will fire onend,
        // which is fine; we won't auto-rearm because phase will be "thinking".
        try { recognition.stop(); } catch { /* ignore */ }
        handleUserTurn(text);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Allow mic in browser settings and click the button again.");
        setIsActive(false);
        isActiveRef.current = false;
        setPhaseSafe("idle");
      } else if (event.error === "audio-capture") {
        setError("No microphone detected. Plug one in and try again.");
        setIsActive(false);
        isActiveRef.current = false;
        setPhaseSafe("idle");
      } else if (event.error === "no-speech" || event.error === "aborted") {
        // Normal in continuous mode — just let onend fire and the rearm
        // effect take over.
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setInterimText("");
      // Schedule a rearm if we're still active AND not currently mid-turn.
      // The phase guard prevents racing with handleUserTurn.
      if (isActiveRef.current && phaseRef.current === "listening") {
        scheduleRearm();
      }
    };

    recognitionRef.current = recognition;
    setPhaseSafe("listening");
    try {
      recognition.start();
    } catch (err) {
      recognitionRef.current = null;
      setError("Failed to start microphone. Try toggling the button.");
    }
  }, [setPhaseSafe]);

  // ─── Turn cycle: user said something ───────────────────────

  const handleUserTurn = useCallback(async (text: string) => {
    setUserText(text);
    setAssistantText("");
    setError(null);
    setPhaseSafe("thinking");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let fullResponse = "";
    try {
      // Use the web app's /api/chat proxy — it already forwards to the
      // orchestrator's /v1/chat/completions with auth and streams text back.
      // Hitting :3001 directly from the browser would need an exposed API key.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += decoder.decode(value, { stream: true });
        setAssistantText(fullResponse);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Session toggled off mid-stream — bail silently
        return;
      }
      const msg = err instanceof Error ? err.message : "Chat failed";
      setError(msg);
      setPhaseSafe("listening");
      if (isActiveRef.current) scheduleRearm();
      return;
    } finally {
      abortRef.current = null;
    }

    if (!isActiveRef.current) {
      // User toggled off while waiting for the response
      return;
    }

    // Speak the response, then rearm
    await speakResponse(fullResponse);
  }, [setPhaseSafe]);

  // ─── TTS playback ──────────────────────────────────────────

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* ignore */ }
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    if (!text.trim()) {
      setPhaseSafe("listening");
      if (isActiveRef.current) scheduleRearm();
      return;
    }

    setPhaseSafe("speaking");
    const truncated = text.length > TTS_MAX_LENGTH ? text.slice(0, TTS_MAX_LENGTH) + "..." : text;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: truncated }),
      });

      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("audio")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;

        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { stopAudio(); resolve(); };
          audio.onerror = () => { stopAudio(); resolve(); };
          audio.play().catch(() => { stopAudio(); resolve(); });
        });
      } else if ("speechSynthesis" in window) {
        // Fallback: browser TTS. Wait for it to finish before rearm.
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(truncated);
          u.lang = "en-GB";
          u.rate = JARVIS_SPEECH_RATE;
          u.pitch = JARVIS_SPEECH_PITCH;
          const gb = pickJarvisVoice(window.speechSynthesis.getVoices());
          if (gb) u.voice = gb;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        });
      }
    } catch {
      // TTS failure shouldn't kill the session — fall through to rearm.
    }

    if (!isActiveRef.current) return;
    setPhaseSafe("listening");
    scheduleRearm();
  }, [setPhaseSafe, stopAudio]);

  // ─── Rearm scheduler ───────────────────────────────────────

  const scheduleRearm = useCallback(() => {
    if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);
    rearmTimerRef.current = setTimeout(() => {
      rearmTimerRef.current = null;
      if (
        isActiveRef.current &&
        phaseRef.current === "listening" &&
        !recognitionRef.current
      ) {
        startRecognition();
      }
    }, REARM_DELAY_MS);
  }, [startRecognition]);

  // ─── Toggle on/off ─────────────────────────────────────────

  const stopEverything = useCallback(() => {
    if (rearmTimerRef.current) { clearTimeout(rearmTimerRef.current); rearmTimerRef.current = null; }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    stopAudio();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setInterimText("");
    setPhaseSafe("idle");
  }, [stopAudio, setPhaseSafe]);

  const toggle = useCallback(() => {
    if (isActiveRef.current) {
      isActiveRef.current = false;
      setIsActive(false);
      stopEverything();
    } else {
      // Reset error/text from prior session so the UI starts clean
      setError(null);
      setUserText("");
      setAssistantText("");
      setInterimText("");
      isActiveRef.current = true;
      setIsActive(true);
      setPhaseSafe("listening");
      startRecognition();
    }
  }, [stopEverything, startRecognition, setPhaseSafe]);

  const retry = useCallback(() => {
    setError(null);
    if (isActiveRef.current && phaseRef.current === "listening" && !recognitionRef.current) {
      startRecognition();
    }
  }, [startRecognition]);

  // ─── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      stopEverything();
    };
  }, [stopEverything]);

  return {
    isActive,
    phase,
    userText,
    interimText,
    assistantText,
    error,
    supported,
    toggle,
    retry,
  };
}
