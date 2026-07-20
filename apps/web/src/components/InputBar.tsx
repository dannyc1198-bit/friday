"use client";

import { useState, useCallback, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

// ─── Voice State Props ──────────────────────────────────────

interface VoiceState {
  isListening: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isLiveMode: boolean;
  ttsAvailable: boolean | null;
  toggleMute: () => void;
  toggleLiveMode: () => void;
  startListening: () => void;
  stopListening: () => void;
  stopSpeaking: () => void;
}

interface InputBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  voice?: VoiceState;
}

// ─── Waveform ───────────────────────────────────────────────

function SpeakingWaveform() {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="w-[2px] rounded-full animate-waveform-bar"
          style={{
            animationDelay: `${i * 0.1}s`,
            minHeight: "3px",
            background: "linear-gradient(180deg, #00dcff, #00b4ff)",
            boxShadow: "0 0 4px rgba(0, 220, 255, 0.4)",
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

  const voiceStatusText = voice?.isListening
    ? "Listening..."
    : voice?.isTranscribing
    ? "Processing..."
    : voice?.isSpeaking
    ? "Speaking..."
    : voice?.isLiveMode
    ? "Live mode active"
    : null;

  return (
    <div className="border-t border-[rgba(0,180,255,0.06)] bg-[#020a14]/95 backdrop-blur-xl">
      {/* Voice Status */}
      {voiceStatusText && (
        <div className="flex items-center justify-center gap-3 py-2.5 px-4">
          {voice?.isListening && (
            <div className="w-2 h-2 rounded-full bg-[#00b4ff] animate-recording-pulse" />
          )}
          {voice?.isTranscribing && (
            <div className="w-2 h-2 rounded-full bg-[#ffa726] animate-transcribe-shimmer" />
          )}
          {voice?.isSpeaking && <SpeakingWaveform />}
          <span
            className={cn(
              "text-[10px] font-mono uppercase tracking-[0.2em]",
              voice?.isListening && "text-[#00b4ff]",
              voice?.isTranscribing && "text-[#ffa726] animate-transcribe-shimmer",
              voice?.isSpeaking && "text-[#00dcff]",
              !voice?.isListening && !voice?.isTranscribing && !voice?.isSpeaking && voice?.isLiveMode && "text-[#34d399]"
            )}
          >
            {voiceStatusText}
          </span>
          {voice?.isLiveMode && (
            <span className="px-1.5 py-0.5 rounded-sm border border-[#34d399]/40 bg-[#34d399]/10 text-[8px] font-mono uppercase tracking-[0.25em] text-[#34d399] animate-pulse">
              LIVE
            </span>
          )}
        </div>
      )}

      <div className="flex items-end gap-2.5 p-4">
        {/* Input field */}
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              voice?.isListening
                ? "Listening... release backtick to send"
                : "Command FRIDAY... (hold ` to talk)"
            }
            disabled={disabled || voice?.isListening}
            rows={1}
            className={cn(
              "w-full px-4 py-3 rounded-lg frost-input",
              "text-[13px] font-light text-[#e0f0ff] placeholder-[#1e3a50]",
              "focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
              "max-h-32 scrollbar-thin",
              voice?.isListening && "border-[#00b4ff]/30 shadow-[0_0_20px_rgba(0,180,255,0.1)]"
            )}
            style={{ minHeight: "48px" }}
          />
        </div>

        {/* Mute Button */}
        {voice && (
          <button
            type="button"
            onClick={voice.toggleMute}
            title={voice.isMuted ? "Unmute (M)" : "Mute (M)"}
            className={cn(
              "p-3 rounded-lg transition-all duration-300",
              voice.isMuted
                ? "bg-[#00b4ff]/15 border border-[#00b4ff]/25 text-[#00dcff]"
                : "bg-[#071422] border border-[rgba(0,180,255,0.08)] text-[#5a8aaa] hover:text-[#e0f0ff] hover:border-[rgba(0,180,255,0.2)]"
            )}
          >
            {voice.isMuted ? (
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
        )}

        {/* Live Voice Mode Toggle — phone-call style continuous conversation */}
        {voice && (
          <button
            type="button"
            onClick={voice.toggleLiveMode}
            title={voice.isLiveMode ? "End live voice conversation" : "Start live voice conversation"}
            className={cn(
              "p-3 rounded-lg transition-all duration-300 relative",
              voice.isLiveMode
                ? "bg-[#34d399] text-black shadow-[0_0_18px_rgba(52,211,153,0.55)] animate-recording-pulse"
                : "bg-[#071422] border border-[rgba(0,180,255,0.08)] text-[#5a8aaa] hover:text-[#34d399] hover:border-[#34d399]/30 hover:shadow-[0_0_10px_rgba(52,211,153,0.25)]"
            )}
          >
            {voice.isLiveMode ? (
              // Hangup icon — rotated phone
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A11.05 11.05 0 0112 21a11.05 11.05 0 01-9-8.21l2.5-2.5a1 1 0 011.41 0l2 2a1 1 0 010 1.41l-1.2 1.2a8.5 8.5 0 005.59 5.59l1.2-1.2a1 1 0 011.41 0l2 2a1 1 0 010 1.41z" transform="rotate(135 12 12)" />
              </svg>
            ) : (
              // Phone-call icon
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            )}
          </button>
        )}

        {/* Mic Button */}
        <button
          type="button"
          onClick={handleMicClick}
          disabled={!voice}
          title={voice?.isListening ? "Stop recording" : "Start recording (hold `)"}
          className={cn(
            "p-3 rounded-lg transition-all duration-300",
            voice?.isListening
              ? "bg-[#00b4ff] text-black shadow-glow-accent animate-recording-pulse"
              : voice
              ? "bg-[#071422] border border-[rgba(0,180,255,0.08)] text-[#5a8aaa] hover:text-[#e0f0ff] hover:border-[rgba(0,180,255,0.2)] hover:shadow-glow-sm"
              : "bg-[#071422] border border-[rgba(0,180,255,0.04)] text-[#1e3a50] opacity-40 cursor-not-allowed"
          )}
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasInput || disabled}
          className={cn(
            "p-3 rounded-lg transition-all duration-300",
            hasInput && !disabled
              ? "bg-gradient-to-r from-[#00b4ff] to-[#00dcff] text-black shadow-glow-accent hover:shadow-glow-lg active:scale-95"
              : "bg-[#071422] border border-[rgba(0,180,255,0.04)] text-[#1e3a50] opacity-30 cursor-not-allowed"
          )}
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>

      {/* TTS fallback badge */}
      {voice && voice.ttsAvailable === false && (
        <div className="flex justify-center pb-2">
          <span className="text-[8px] font-mono text-[#ffa726]/40 uppercase tracking-[0.2em]">
            TTS offline — browser voice active
          </span>
        </div>
      )}
    </div>
  );
}
