"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type STTMethod = "wispr" | "webspeech" | "none";

interface UsePushToTalkOptions {
  /** Called when transcription is complete */
  onTranscript: (text: string) => void;
  /** Key to hold for recording (default: backtick) */
  hotkey?: string;
  /** Auto-submit delay after Wispr types into input (ms) */
  autoSubmitDelay?: number;
  /** Whether the hook is active */
  enabled?: boolean;
}

interface UsePushToTalkReturn {
  isListening: boolean;
  isTranscribing: boolean;
  sttMethod: STTMethod;
  error: string | null;
  /** Manually start listening (for button-based activation) */
  startListening: () => void;
  /** Manually stop listening */
  stopListening: () => void;
}

/**
 * Push-to-talk hook with two STT strategies:
 * 1. Wispr Flow — types directly into focused input (free, system-wide)
 * 2. Web Speech API — browser-native fallback (free, requires mic permission)
 *
 * Hold backtick (`) to record, release to transcribe.
 * Also supports click-to-toggle via startListening/stopListening.
 */
export function usePushToTalk({
  onTranscript,
  hotkey = "`",
  autoSubmitDelay = 1500,
  enabled = true,
}: UsePushToTalkOptions): UsePushToTalkReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sttMethod, setSTTMethod] = useState<STTMethod>("none");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef<string>("");
  const isHotkeyHeld = useRef(false);

  // Detect available STT method on mount
  useEffect(() => {
    if (!enabled) return;

    // Check for Web Speech API support
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSTTMethod("webspeech");
    } else {
      // Wispr Flow doesn't need detection — it types into the input field directly
      // If no Web Speech API, we still support Wispr (it just types text)
      setSTTMethod("wispr");
    }
  }, [enabled]);

  // Initialize Web Speech API recognition
  const initRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      transcriptRef.current = finalTranscript || interimTranscript;
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow mic access in browser settings.");
      } else if (event.error !== "aborted") {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
      setIsTranscribing(false);
    };

    recognition.onend = () => {
      // Recognition ended — process the transcript
      if (transcriptRef.current.trim()) {
        setIsTranscribing(true);
        const text = transcriptRef.current.trim();
        transcriptRef.current = "";

        // Small delay to show "transcribing" state
        setTimeout(() => {
          onTranscript(text);
          setIsTranscribing(false);
        }, 200);
      }
      setIsListening(false);
    };

    return recognition;
  }, [onTranscript]);

  const startListening = useCallback(() => {
    if (!enabled || isListening) return;

    setError(null);
    transcriptRef.current = "";

    if (sttMethod === "webspeech") {
      const recognition = initRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        try {
          recognition.start();
          setIsListening(true);
        } catch (err) {
          setError("Failed to start speech recognition");
        }
      }
    } else {
      // Wispr mode: just show the listening indicator
      // Wispr Flow will type into whatever input is focused
      setIsListening(true);
    }
  }, [enabled, isListening, sttMethod, initRecognition]);

  const stopListening = useCallback(() => {
    if (!isListening) return;

    if (sttMethod === "webspeech" && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    } else {
      // Wispr mode: just hide the indicator
      setIsListening(false);
    }
  }, [isListening, sttMethod]);

  // Hotkey listener (backtick hold-to-talk)
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea (unless it's the hotkey)
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === hotkey && !e.repeat && !isTyping) {
        e.preventDefault();
        isHotkeyHeld.current = true;
        startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === hotkey && isHotkeyHeld.current) {
        e.preventDefault();
        isHotkeyHeld.current = false;
        stopListening();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled, hotkey, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    isTranscribing,
    sttMethod,
    error,
    startListening,
    stopListening,
  };
}
