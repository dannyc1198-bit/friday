"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { getGreeting } from "@/lib/utils";
import NeuralBrain from "@/components/NeuralBrain";
import BootSequence from "@/components/BootSequence";
import { WaveformPresence, PresenceMode } from "./WaveformPresence";
import { HealthChips } from "./HealthChips";
import { MissionCard } from "./MissionCard";
import { FleetCard } from "./FleetCard";
import { MarketCard } from "./MarketCard";
import { IntelCard } from "./IntelCard";
import { BrainCard } from "./BrainCard";
import { HistoryCard } from "./HistoryCard";
import { DeckMessage } from "./DeckMessage";
import { DeckInput } from "./DeckInput";
import { Icons } from "./deck-lib";

// FRIDAY — Flight Deck.
// One screen: the conversation in the middle, truth on both sides.
// Left rail: her mind (brain, log). Right rail: Danny's world (mission, fleet,
// markets, intel). Every reading is live or honestly OFFLINE — nothing invented.

export default function Deck() {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stopTask,
    newConversation,
    loadConversation,
  } = useChat();

  const voice = useVoice({
    messages,
    isLoading,
    onTranscript: sendMessage,
    enabled: true,
  });

  const [coreOnline, setCoreOnline] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const presence: PresenceMode = !coreOnline
    ? "offline"
    : voice.isSpeaking
    ? "speaking"
    : isLoading
    ? "thinking"
    : "idle";

  // keep the log pinned to the newest entry
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Ctrl+Enter (Cmd+Enter on Mac) anywhere on the deck toggles live voice —
  // continuous conversation mode. Works while typing too; DeckInput carves
  // Ctrl+Enter out of its send handler so this is the only owner.
  const { toggleLiveMode } = voice;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.repeat) {
        e.preventDefault();
        toggleLiveMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleLiveMode]);

  const suggestions = [
    "What's the fleet status?",
    "What have you learned about me lately?",
    "Anything I should know from the news?",
  ];

  return (
    <div className="relative isolate flex h-screen flex-col bg-deck-void font-deckbody text-deck-ink selection:bg-deck-amber/30">
      {/* Ambient neural web — a live reading, not decoration: it fires
          harder while she's actually working on a request. */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30" aria-hidden>
        <NeuralBrain intensity={isLoading ? 0.65 : 0.08} />
      </div>

      {/* ── Top bar: wordmark · presence · truth chips ── */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-deck-line px-4">
        <div className="shrink-0">
          <h1 className="font-deckdisplay text-lg font-bold uppercase tracking-[0.34em] text-deck-ink">
            Friday
          </h1>
        </div>
        <WaveformPresence mode={presence} className="h-10 min-w-0 flex-1" />
        <Link
          href="/learning"
          className="shrink-0 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-deck-amber"
        >
          Learning Lab
        </Link>
        <Link
          href="/brain"
          className="shrink-0 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-deck-amber"
        >
          Neural Core
        </Link>
        <div className="hidden shrink-0 md:block">
          <HealthChips onStatus={setCoreOnline} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* ── Left rail: her mind ── */}
        <aside className="hidden min-h-0 space-y-3 overflow-y-auto border-r border-deck-line p-3 [scrollbar-width:thin] xl:block">
          <BrainCard />
          <HistoryCard
            activeId={activeConvId}
            onLoad={(id, msgs) => {
              loadConversation(id, msgs);
              setActiveConvId(id);
            }}
          />
        </aside>

        {/* ── Center: the conversation ── */}
        <main className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-deck-line px-4 py-1.5">
            <span className="font-deckmono text-[10px] uppercase tracking-[0.2em] text-deck-faint">
              {presence === "offline"
                ? "core offline"
                : presence === "thinking"
                ? "working…"
                : presence === "speaking"
                ? "speaking"
                : voice.isLiveMode
                ? "live — she's listening"
                : "on station"}
            </span>
            <button
              onClick={() => {
                newConversation();
                setActiveConvId(null);
              }}
              className="flex items-center gap-1.5 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-deck-amber"
            >
              {Icons.plus} New
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            <div className="mx-auto w-full max-w-3xl px-5">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-5 pt-24 text-center">
                  <p className="font-deckdisplay text-xl font-medium text-deck-ink">
                    {getGreeting()}, boss.
                  </p>
                  <p className="max-w-sm text-[13px] leading-relaxed text-deck-dim">
                    Everything on this deck is a live reading. Where do we start?
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="rounded border border-deck-line px-3 py-1.5 font-deckmono text-[11px] text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => <DeckMessage key={m.id} message={m} />)
              )}
              <div ref={endRef} className="h-2" />
            </div>
          </div>

          {error && (
            <p className="border-t border-deck-alert/30 bg-deck-alert/10 px-4 py-1.5 font-deckmono text-[11px] text-deck-alert">
              {error}
            </p>
          )}

          <div className="mx-auto w-full max-w-3xl px-5 pb-4 pt-2">
            <DeckInput
              onSend={sendMessage}
              isLoading={isLoading}
              onStop={() => {
                stopTask();
                voice.stopSpeaking();
              }}
              voice={voice}
            />
          </div>
        </main>

        {/* ── Right rail: Danny's world ── */}
        <aside className="hidden min-h-0 space-y-3 overflow-y-auto border-l border-deck-line p-3 [scrollbar-width:thin] xl:block">
          <MissionCard />
          <FleetCard />
          <MarketCard />
          <IntelCard />
        </aside>
      </div>

      {/* Boot overlay — once per browser session (sessionStorage.fridayBooted) */}
      <BootSequence />
    </div>
  );
}
