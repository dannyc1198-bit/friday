"use client";

import { useState, useCallback, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

// ─── Voice State Props ──────────────────────────────────────

interface VoiceState {
  isListening: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  ttsAvailable: boolean | null;
  toggleMute: () => void;
  startListening: () => void;
  stopListening: () => void;
  stopSpeaking: () => void;
}

interface InputBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  voice?: VoiceState;
}

// ─── Sub-components ─────────────────────────────────────────

/** Animated waveform bars shown when FRIDAY is speaking */
function SpeakingWaveform() {
  return (
    <div className="flex items-center gap-0.5 h-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-0.5 bg-JARVIS-accent rounded-full animate-waveform-bar"
          style={{
            animationDelay: `${i * 0.15}s`,
            minHeight: "4px",
          }}
        />
      ))}
    </div>
  );
}

// ─── InputBar ───────────────────────────────────────────────

export function InputBar({ onSend, disabled = false, voice }: InputBarProps) {
  const [input, setInput] = useState("");

  const handleSend = useCallback(() => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  }, [input, onSend, disabled]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleMicClick = useCallback(() => {
    if (!voice) return;
    if (voice.isListening) {
      voice.stopListening();
    } else {
      voice.startListening();
    }
  }, [voice]);

  const hasInput = input.trim().length > 0;

  // Determine voice status text
  const voiceStatusText = voice?.isListening
    ? "Listening..."
    : voice?.isTranscribing
    ? "Processing..."
    : voice?.isSpeaking
    ? "Speaking..."
    : null;

  return (
    <div className="border-t border-JARVIS-border bg-JARVIS-bg">
      {/* Voice Status Overlay */}
      {voiceStatusText && (
        <div className="flex items-center justify-center gap-2 py-2 px-4">
          {voice?.isListening && (
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-recording-pulse" />
          )}
          {voice?.isTranscribing && (
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-transcribe-shimmer" />
          )}
          {voice?.isSpeaking && <SpeakingWaveform />}
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              voice?.isListening && "text-blue-400",
              voice?.isTranscribing && "text-yellow-400 animate-transcribe-shimmer",
              voice?.isSpeaking && "text-JARVIS-accent"
            )}
          >
            {voiceStatusText}
          </span>
        </div>
      )}

      <div className="flex items-end gap-3 p-4">
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              voice?.isListening
                ? "Listening... release backtick to send"
                : "Type a message... (hold ` to talk)"
            }
            disabled={disabled || voice?.isListening}
            rows={1}
            className={cn(
              "w-full px-4 py-3 rounded-xl resize-none",
              "bg-JARVIS-card border border-JARVIS-border",
              "text-JARVIS-text placeholder-JARVIS-muted",
              "focus:outline-none focus:border-JARVIS-accent focus:ring-1 focus:ring-JARVIS-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "max-h-32 scrollbar-thin",
              voice?.isListening && "border-blue-500/50 ring-1 ring-blue-500/30"
            )}
            style={{ minHeight: "48px" }}
          />
        </div>

        {/* Mute/Unmute Button */}
        {voice && (
          <button
            type="button"
            onClick={voice.toggleMute}
            title={voice.isMuted ? "Unmute voice (M)" : "Mute voice (M)"}
            className={cn(
              "p-3 rounded-xl transition-colors",
              voice.isMuted
                ? "bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30"
                : "bg-JARVIS-card border border-JARVIS-border text-JARVIS-muted hover:text-JARVIS-text hover:border-JARVIS-accent/50"
            )}
          >
            {voice.isMuted ? (
              /* Speaker X (muted) */
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              </svg>
            ) : (
              /* Speaker on */
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            )}
          </button>
        )}

        {/* Mic Button — now functional */}
        <button
          type="button"
          onClick={handleMicClick}
          disabled={!voice}
          title={
            voice?.isListening
              ? "Release to stop recording"
              : "Click to start recording (or hold `)"
          }
          className={cn(
            "p-3 rounded-xl transition-colors",
            voice?.isListening
              ? "bg-blue-500 text-white animate-recording-pulse"
              : voice
              ? "bg-JARVIS-card border border-JARVIS-border text-JARVIS-muted hover:text-JARVIS-text hover:border-JARVIS-accent/50"
              : "bg-JARVIS-card border border-JARVIS-border text-JARVIS-muted opacity-50 cursor-not-allowed"
          )}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasInput || disabled}
          className={cn(
            "p-3 rounded-xl transition-colors",
            hasInput && !disabled
              ? "bg-JARVIS-accent hover:bg-JARVIS-accent-hover text-white"
              : "bg-JARVIS-card border border-JARVIS-border text-JARVIS-muted opacity-50 cursor-not-allowed"
          )}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>

      {/* TTS Status Badge */}
      {voice && voice.ttsAvailable === false && (
        <div className="flex justify-center pb-2">
          <span className="text-[10px] text-yellow-500/60 uppercase tracking-wider">
            TTS offline — using browser voice
          </span>
        </div>
      )}
    </div>
  );
}
