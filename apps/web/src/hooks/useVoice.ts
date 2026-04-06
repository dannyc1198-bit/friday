"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePushToTalk, type STTMethod } from "./usePushToTalk";
import type { Message } from "@/types";

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
  /** Which STT method is active */
  sttMethod: STTMethod;
  /** Whether ElevenLabs TTS is available */
  ttsAvailable: boolean | null;
  /** Last voice error */
  error: string | null;
  /** Toggle mute on/off */
  toggleMute: () => void;
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
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track which messages have already been spoken
  const spokenMessageIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const prevIsLoadingRef = useRef(isLoading);

  // ─── Push-to-talk integration ───────────────────────────

  const ptt = usePushToTalk({
    onTranscript,
    enabled,
  });

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
    utterance.rate = 1.0;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;

    // Try to find a British English voice
    const voices = window.speechSynthesis.getVoices();
    const britishVoice = voices.find(
      (v) => v.lang === "en-GB" && v.name.toLowerCase().includes("male")
    ) || voices.find(
      (v) => v.lang === "en-GB"
    ) || voices.find(
      (v) => v.lang.startsWith("en")
    );

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
    sttMethod: ptt.sttMethod,
    ttsAvailable,
    error: error || ptt.error,
    toggleMute,
    startListening: ptt.startListening,
    stopListening: ptt.stopListening,
    stopSpeaking,
  };
}
