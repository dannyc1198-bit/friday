"use client";

// useWakeDetection — Two-factor wake: say "morning friday" THEN double clap
//
// State machine:
//   IDLE            → listening for wake phrase via Web Speech API
//   PHRASE_HEARD    → phrase detected, arming clap detector (5s window)
//   TRIGGERED       → double clap confirmed → fire onWake → back to IDLE
//
// Security: only fires if BOTH phrase and clap happen in sequence.
// Phrase alone does nothing. Clap alone does nothing.

import { useState, useEffect, useRef, useCallback } from "react";

const WAKE_PHRASES = ["morning friday", "morning, friday", "good morning friday"];
const CLAP_THRESHOLD   = 80;
const MIN_GAP_MS       = 100;
const MAX_GAP_MS       = 800;
const ARM_WINDOW_MS    = 5000;   // 5s to double-clap after saying the phrase
const COOLDOWN_MS      = 2000;
const SAMPLE_INTERVAL  = 30;

export type WakeState = "idle" | "armed" | "triggered";

interface UseWakeDetectionOptions {
  onWake: () => void;
  enabled?: boolean;
}

interface UseWakeDetectionReturn {
  wakeState: WakeState;
  isListening: boolean;
  error: string | null;
}

export function useWakeDetection({
  onWake,
  enabled = true,
}: UseWakeDetectionOptions): UseWakeDetectionReturn {
  const [wakeState, setWakeState]     = useState<WakeState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const onWakeRef           = useRef(onWake);
  const audioCtxRef         = useRef<AudioContext | null>(null);
  const analyserRef         = useRef<AnalyserNode | null>(null);
  const streamRef           = useRef<MediaStream | null>(null);
  const clapIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef      = useRef<SpeechRecognition | null>(null);
  const armTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstClapTimeRef    = useRef<number | null>(null);
  const cooldownUntilRef    = useRef<number>(0);
  const wasLoudRef          = useRef(false);
  const armedRef            = useRef(false);

  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);

  // ── Arm the clap detector for ARM_WINDOW_MS ──────────────────
  const arm = useCallback(() => {
    if (armedRef.current) return;
    armedRef.current = true;
    setWakeState("armed");
    firstClapTimeRef.current = null;

    // Auto-disarm if no clap comes
    armTimerRef.current = setTimeout(() => {
      armedRef.current = false;
      setWakeState("idle");
    }, ARM_WINDOW_MS);
  }, []);

  // ── Fire wake ────────────────────────────────────────────────
  const triggerWake = useCallback(() => {
    armedRef.current = false;
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    setWakeState("triggered");
    cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    onWakeRef.current();
    // Reset to idle after cooldown
    setTimeout(() => setWakeState("idle"), COOLDOWN_MS);
  }, []);

  // ── Speech recognition (phrase detection) ───────────────────
  useEffect(() => {
    if (!enabled) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return; // Browser doesn't support it — clap-only fallback

    const recognition: SpeechRecognition = new SpeechRecognition();
    recognition.continuous    = true;
    recognition.interimResults = true;
    recognition.lang          = "en-US";
    recognitionRef.current    = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase().trim();
        if (WAKE_PHRASES.some((p) => transcript.includes(p))) {
          arm();
          return;
        }
      }
    };

    recognition.onerror = () => {
      // Silently restart on error
      try { recognition.stop(); } catch { /* ignore */ }
    };

    recognition.onend = () => {
      // Auto-restart (continuous mode can stop unexpectedly)
      if (enabled) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    try {
      recognition.start();
    } catch { /* may throw if already started */ }

    return () => {
      try { recognition.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    };
  }, [enabled, arm]);

  // ── Clap detection (audio amplitude) ────────────────────────
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function startAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });

        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.fftSize);

        clapIntervalRef.current = setInterval(() => {
          if (!analyserRef.current || !armedRef.current) return;

          analyserRef.current.getByteTimeDomainData(dataArray);
          let peak = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const amp = Math.abs(dataArray[i] - 128);
            if (amp > peak) peak = amp;
          }

          const now = Date.now();
          if (now < cooldownUntilRef.current) return;

          const isLoud = (peak * 2) >= CLAP_THRESHOLD;

          if (isLoud && !wasLoudRef.current) {
            if (firstClapTimeRef.current === null) {
              firstClapTimeRef.current = now;
            } else {
              const gap = now - firstClapTimeRef.current;
              if (gap >= MIN_GAP_MS && gap <= MAX_GAP_MS) {
                firstClapTimeRef.current = null;
                triggerWake();
              } else if (gap > MAX_GAP_MS) {
                firstClapTimeRef.current = now;
              }
            }
          }

          wasLoudRef.current = isLoud;

          if (firstClapTimeRef.current !== null && now - firstClapTimeRef.current > MAX_GAP_MS) {
            firstClapTimeRef.current = null;
          }
        }, SAMPLE_INTERVAL);

        setIsListening(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof DOMException && err.name === "NotAllowedError"
              ? "Microphone access denied."
              : `Wake detection failed: ${err instanceof Error ? err.message : "Unknown"}`
          );
          setIsListening(false);
        }
      }
    }

    startAudio();

    return () => {
      cancelled = true;
      if (clapIntervalRef.current) { clearInterval(clapIntervalRef.current); clapIntervalRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
      if (armTimerRef.current) { clearTimeout(armTimerRef.current); armTimerRef.current = null; }
      analyserRef.current = null;
      setIsListening(false);
    };
  }, [enabled, triggerWake]);

  return { wakeState, isListening, error };
}
