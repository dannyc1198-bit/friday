"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePushToTalk, type STTMethod } from "./usePushToTalk";
import type { Message } from "@/types";
import { JARVIS_SPEECH_PITCH, JARVIS_SPEECH_RATE, pickJarvisVoice } from "@/lib/jarvis-voice";

// ─── Types ──────────────────────────────────────────────────

interface UseVoiceOptions {
  /** Current messages array from useChat */
  messages: Message[];
  /** Whether chat is currently loading/streaming */
  isLoading: boolean;
  /** Called when voice transcript should be sent as a chat message */
  onTranscript: (text: string) => void;
  /** Whether voice features are enabled */
  enabled?: boolean;
}

interface UseVoiceReturn {
  /** Push-to-talk is active (user holding backtick) */
  isListening: boolean;
  /** Processing speech-to-text */
  isTranscribing: boolean;
  /** JARVIS is speaking (TTS audio playing) */
  isSpeaking: boolean;
  /** TTS is muted (M key or button toggle) */
  isMuted: boolean;
  /** Live voice mode — continuous turn-taking conversation */
  isLiveMode: boolean;
  /** Which STT method is active */
  sttMethod: STTMethod;
  /** Whether ElevenLabs TTS is available */
  ttsAvailable: boolean | null;
  /** Last voice error */
  error: string | null;
  /** Live partial transcript while the user is speaking */
  interimTranscript: string;
  /** Toggle mute on/off */
  toggleMute: () => void;
  /** Toggle live voice mode on/off */
  toggleLiveMode: () => void;
  /** Manually start listening */
  startListening: () => void;
  /** Manually stop listening */
  stopListening: () => void;
  /** Stop current TTS playback */
  stopSpeaking: () => void;
}

// ─── Constants ──────────────────────────────────────────────

const MUTE_STORAGE_KEY = "JARVIS-voice-muted";
const TTS_MAX_LENGTH = 5000;

// Breathing room between FRIDAY finishing and the mic re-arming in live mode.
// Too short → feels twitchy and clips your "uh, actually..." moment.
// Too long → conversation feels laggy.
const LIVE_REARM_DELAY_MS = 600;

// ─── Hook ───────────────────────────────────────────────────

/**
 * Central voice coordinator — ties together:
 * 1. Push-to-talk (STT) via usePushToTalk
 * 2. Chat response detection (watches messages + isLoading)
 * 3. TTS playback (ElevenLabs → browser fallback)
 * 4. Mute toggle (M key + localStorage)
 */
export function useVoice({
  messages,
  isLoading,
  onTranscript,
  enabled = true,
}: UseVoiceOptions): UseVoiceReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track which messages have already been spoken
  const spokenMessageIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const prevIsLoadingRef = useRef(isLoading);
  const prevIsSpeakingRef = useRef(false);
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Push-to-talk integration ───────────────────────────
  // Live mode uses `continuous: false` so the API auto-ends on silence
  // and we can rearm after FRIDAY's response. Hold-to-talk needs `true`
  // so brief pauses don't end the recognition mid-sentence.
  const ptt = usePushToTalk({
    onTranscript,
    enabled,
    continuous: !isLiveMode,
  });

  // Stable handle to ptt for use in effects without triggering re-runs
  // every time usePushToTalk's return identity changes.
  const pttRef = useRef(ptt);
  pttRef.current = ptt;

  // ─── Mute state (localStorage persistence) ──────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(MUTE_STORAGE_KEY);
    if (stored === "true") setIsMuted(true);
  }, []);

  // ─── TTS availability check ─────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    fetch("/api/tts")
      .then((res) => res.json())
      .then((data) => setTtsAvailable(data.available ?? false))
      .catch(() => setTtsAvailable(false));
  }, [enabled]);

  // ─── TTS Playback ──────────────────────────────────────

  const speakWithElevenLabs = useCallback(async (text: string): Promise<boolean> => {
    try {
      const truncated = text.length > TTS_MAX_LENGTH
        ? text.slice(0, TTS_MAX_LENGTH) + "..."
        : text;

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: truncated }),
      });

      // Check if we got audio back (not a JSON error)
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("audio")) {
        return false;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise<boolean>((resolve) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resolve(true);
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resolve(false);
        };

        audio.play().catch(() => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }, []);

  const speakWithBrowser = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;

    // Cancel any existing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = JARVIS_SPEECH_RATE;
    utterance.pitch = JARVIS_SPEECH_PITCH;
    utterance.volume = 1.0;

    // Free fallback: calm British male (Windows Ryan/George, or any en-GB male).
    const britishVoice = pickJarvisVoice(window.speechSynthesis.getVoices());
    if (britishVoice) utterance.voice = britishVoice;

    synthUtteranceRef.current = utterance;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      synthUtteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      synthUtteranceRef.current = null;
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setError(null);

    // Try ElevenLabs first
    if (ttsAvailable) {
      const success = await speakWithElevenLabs(text);
      if (success) return;
    }

    // Fallback to browser speechSynthesis
    speakWithBrowser(text);
  }, [ttsAvailable, speakWithElevenLabs, speakWithBrowser]);

  const stopSpeaking = useCallback(() => {
    // Stop HTML5 audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // Stop browser speech synthesis
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    synthUtteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      return next;
    });
    stopSpeaking();
  }, [stopSpeaking]);

  const toggleLiveMode = useCallback(() => {
    setIsLiveMode((prev) => {
      const next = !prev;
      // Exiting live mode → cancel any pending rearm + stop active recognition
      if (!next) {
        if (rearmTimerRef.current) {
          clearTimeout(rearmTimerRef.current);
          rearmTimerRef.current = null;
        }
        if (pttRef.current.isListening) pttRef.current.stopListening();
      }
      return next;
    });
  }, []);

  // ─── M key mute toggle ─────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "m" && !e.repeat && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
        toggleMute();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, toggleMute]);

  // ─── Auto-speak on assistant response completion ────────

  useEffect(() => {
    // Detect isLoading transition: true → false (response just finished)
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    if (!wasLoading || isLoading) return; // Only trigger on true → false
    if (isMuted || !enabled) return;

    // Find the last assistant message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    if (lastMessage.role !== "assistant") return;
    if (lastMessage.isStreaming) return;
    if (spokenMessageIds.current.has(lastMessage.id)) return;

    // Mark as spoken and play
    spokenMessageIds.current.add(lastMessage.id);
    speakResponse(lastMessage.content);
  }, [isLoading, messages, isMuted, enabled, speakResponse]);

  // ─── Stop speaking when user starts talking ─────────────

  useEffect(() => {
    if (ptt.isListening && isSpeaking) {
      stopSpeaking();
    }
  }, [ptt.isListening, isSpeaking, stopSpeaking]);

  // ─── Live voice mode: keep mic always armed ─────────────
  // Single unified effect — replaces the old "kick off first turn" + "re-arm
  // after speaking" pair. Watches every state that should gate the mic, and
  // re-arms whenever the mic is idle and conditions are right. This handles:
  //   - Initial activation (rising edge of isLiveMode)
  //   - Re-arm after FRIDAY finishes speaking
  //   - Re-arm after silence timeout (Chrome auto-ends recognition after ~60s)
  //   - Re-arm after error recovery (no-speech, aborted)
  // Mute state is intentionally NOT a guard — mute means "don't speak to me",
  // not "don't listen to me". Mic stays on so the user can resume by speaking.
  useEffect(() => {
    if (!isLiveMode || !enabled) return;
    if (ptt.isListening || isSpeaking || isLoading) return;

    if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);
    rearmTimerRef.current = setTimeout(() => {
      rearmTimerRef.current = null;
      // Re-check guards at fire time — state may have shifted during the delay
      if (
        isLiveMode &&
        enabled &&
        !pttRef.current.isListening &&
        !isSpeaking &&
        !isLoading
      ) {
        pttRef.current.startListening();
      }
    }, LIVE_REARM_DELAY_MS);
  }, [isLiveMode, enabled, ptt.isListening, isSpeaking, isLoading]);

  // ─── Cleanup pending rearm timer on unmount ─────────────
  useEffect(() => {
    return () => {
      if (rearmTimerRef.current) {
        clearTimeout(rearmTimerRef.current);
        rearmTimerRef.current = null;
      }
    };
  }, []);

  // ─── Cleanup ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ─── Return ─────────────────────────────────────────────

  return {
    isListening: ptt.isListening,
    isTranscribing: ptt.isTranscribing,
    isSpeaking,
    isMuted,
    isLiveMode,
    sttMethod: ptt.sttMethod,
    ttsAvailable,
    error: error || ptt.error,
    interimTranscript: ptt.interimTranscript,
    toggleMute,
    toggleLiveMode,
    startListening: ptt.startListening,
    stopListening: ptt.stopListening,
    stopSpeaking,
  };
}
