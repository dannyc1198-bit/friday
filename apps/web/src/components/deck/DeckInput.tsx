"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import { Icons } from "./deck-lib";

// The console. One line that grows, three controls that say what they do:
// talk to her, hear her, stop her.

export interface DeckVoice {
  isListening: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isLiveMode: boolean;
  interimTranscript: string;
  toggleMute: () => void;
  toggleLiveMode: () => void;
  startListening: () => void;
  stopListening: () => void;
  stopSpeaking: () => void;
}

export function DeckInput({
  onSend,
  isLoading,
  onStop,
  voice,
  focusSignal = 0,
}: {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  voice: DeckVoice;
  focusSignal?: number;
}) {
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // auto-grow up to ~5 lines
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 132) + "px";
  }, [text]);

  useEffect(() => {
    if (!focusSignal) return;
    areaRef.current?.focus();
  }, [focusSignal]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || isLoading) return;
    onSend(t);
    setText("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter belongs to the live-voice toggle (window-level, Deck.tsx)
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      submit();
    }
  };

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded border border-deck-line text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-deck-amber";

  return (
    <form
      onSubmit={submit}
      className="rounded-hud border border-deck-line bg-deck-panel p-2"
    >
      {voice.isListening && (
        <p className="px-1 pb-1.5 font-deckmono text-[10px] uppercase tracking-wider text-deck-hot">
          {voice.isLiveMode ? "live — " : ""}listening
          {voice.interimTranscript ? ` — ${voice.interimTranscript}` : "…"}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          data-friday-input="true"
          placeholder="Talk to FRIDAY…"
          aria-label="Message FRIDAY"
          className="min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-deck-ink placeholder:text-deck-faint focus:outline-none"
        />

        {/* live voice — continuous conversation (Ctrl+Enter) */}
        <button
          type="button"
          onClick={voice.toggleLiveMode}
          title={
            voice.isLiveMode
              ? "End live voice (Ctrl+Enter)"
              : "Live voice — continuous conversation (Ctrl+Enter)"
          }
          className={`${iconBtn} w-auto px-2 font-deckmono text-[10px] tracking-wider ${
            voice.isLiveMode
              ? "border-deck-line-bright text-deck-hot shadow-deck-amber animate-pulse"
              : ""
          }`}
        >
          LIVE
        </button>

        {/* hear her / mute her */}
        <button
          type="button"
          onClick={voice.toggleMute}
          title={voice.isMuted ? "Unmute FRIDAY's voice" : "Mute FRIDAY's voice"}
          className={`${iconBtn} ${!voice.isMuted ? "text-deck-amber" : ""}`}
        >
          {voice.isMuted ? Icons.speakerOff : Icons.speaker}
        </button>

        {/* talk to her */}
        <button
          type="button"
          onClick={voice.isListening ? voice.stopListening : voice.startListening}
          title={voice.isListening ? "Stop listening" : "Talk (mic)"}
          className={`${iconBtn} ${
            voice.isListening
              ? "border-deck-line-bright text-deck-hot shadow-deck-amber animate-pulse"
              : ""
          }`}
        >
          {Icons.mic}
        </button>

        {/* send / stop */}
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            title="Stop"
            className={`${iconBtn} border-deck-alert/40 text-deck-alert hover:border-deck-alert`}
          >
            {Icons.stop}
          </button>
        ) : (
          <button
            type="submit"
            title="Send"
            disabled={!text.trim()}
            className={`${iconBtn} disabled:opacity-40 ${
              text.trim() ? "border-deck-line-bright text-deck-amber" : ""
            }`}
          >
            {Icons.send}
          </button>
        )}
      </div>
    </form>
  );
}
