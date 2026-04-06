"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const CLAP_THRESHOLD = 80;
const MIN_GAP_MS = 100;
const MAX_GAP_MS = 800;
const COOLDOWN_MS = 2000;
const SAMPLE_INTERVAL_MS = 30;

interface UseClapDetectionOptions {
  onDoubleClap: () => void;
  enabled?: boolean;
}

interface UseClapDetectionReturn {
  isActive: boolean;
  error: string | null;
}

export function useClapDetection({
  onDoubleClap,
  enabled = true,
}: UseClapDetectionOptions): UseClapDetectionReturn {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstClapTimeRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef<number>(0);
  const wasLoudRef = useRef(false);
  const onDoubleClapRef = useRef(onDoubleClap);

  useEffect(() => {
    onDoubleClapRef.current = onDoubleClap;
  }, [onDoubleClap]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsActive(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.fftSize);

        intervalRef.current = setInterval(() => {
          if (!analyserRef.current) return;

          analyserRef.current.getByteTimeDomainData(dataArray);

          let peak = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const amplitude = Math.abs(dataArray[i] - 128);
            if (amplitude > peak) peak = amplitude;
          }
          const scaledPeak = peak * 2;
          const now = Date.now();

          if (now < cooldownUntilRef.current) return;

          const isLoud = scaledPeak >= CLAP_THRESHOLD;

          if (isLoud && !wasLoudRef.current) {
            if (firstClapTimeRef.current === null) {
              firstClapTimeRef.current = now;
            } else {
              const gap = now - firstClapTimeRef.current;
              if (gap >= MIN_GAP_MS && gap <= MAX_GAP_MS) {
                firstClapTimeRef.current = null;
                cooldownUntilRef.current = now + COOLDOWN_MS;
                onDoubleClapRef.current();
              } else if (gap > MAX_GAP_MS) {
                firstClapTimeRef.current = now;
              }
            }
          }

          wasLoudRef.current = isLoud;

          if (
            firstClapTimeRef.current !== null &&
            now - firstClapTimeRef.current > MAX_GAP_MS
          ) {
            firstClapTimeRef.current = null;
          }
        }, SAMPLE_INTERVAL_MS);

        setIsActive(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof DOMException && err.name === "NotAllowedError"
              ? "Microphone access denied — clap detection needs mic permission."
              : `Clap detection failed: ${err instanceof Error ? err.message : "Unknown error"}`;
          setError(msg);
          setIsActive(false);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, cleanup]);

  return { isActive, error };
}
