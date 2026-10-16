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
  prefill = "",
  prefillKey = 0,
  tone = "deck",
}: {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  voice: DeckVoice;
  focusSignal?: number;
  prefill?: string;
  prefillKey?: number;
  tone?: "deck" | "console";
}) {
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!prefillKey) return;
    setText(prefill);
    areaRef.current?.focus();
  }, [prefillKey, prefill]);

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

  const plain = tone === "console";
  const iconBtn = plain
    ? "flex h-9 w-9 items-center justify-center rounded border border-line text-muted hover:border-line-strong hover:text-ink"
    : "flex h-9 w-9 items-center justify-center rounded border border-deck-line text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-deck-amber";

  return (
    <form
      onSubmit={submit}
      className={plain ? "rounded-lg border border-line bg-panel p-2" : "rounded-hud border border-deck-line bg-deck-panel p-2"}
    >
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={voice.toggleLiveMode}
          className={`min-h-12 rounded border px-3 text-base ${plain ? "" : "font-deckdisplay text-lg"} ${
            voice.isLiveMode
              ? plain ? "border-accent bg-raised text-ink" : "border-deck-hot bg-deck-raised text-deck-ink"
              : plain ? "border-line text-muted" : "border-deck-line text-deck-dim"
          }`}
        >
          {voice.isLiveMode ? "End hands-free" : "Hands-free"}
        </button>
        <button
          type="button"
          onPointerDown={() => voice.startListening()}
          onPointerUp={() => voice.stopListening()}
          onPointerLeave={() => voice.isListening && voice.stopListening()}
          className={`min-h-12 rounded border px-3 text-base ${plain ? "" : "font-deckdisplay text-lg"} ${
            voice.isListening
              ? plain ? "border-accent text-ink" : "border-deck-hot text-deck-ink"
              : plain ? "border-line text-muted" : "border-deck-line text-deck-dim"
          }`}
        >
          Hold to talk
        </button>
      </div>
      {voice.isListening && (
        <p className={plain ? "px-1 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-accent" : "px-1 pb-1.5 font-deckmono text-[10px] uppercase tracking-wider text-deck-hot"}>
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
          className={`min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed focus:outline-none ${plain ? "text-ink placeholder:text-faint" : "text-deck-ink placeholder:text-deck-faint"}`}
        />

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
