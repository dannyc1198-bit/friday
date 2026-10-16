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
import { AgentsCard } from "./AgentsCard";
import { DeckMessage } from "./DeckMessage";
import { DeckInput } from "./DeckInput";
import { Icons } from "./deck-lib";
import {
  AllyBoard,
  ArcReactor,
  ContentBoard,
  FocusBar,
  FocusId,
  TodayBoard,
  WavelengthBoard,
  IntegrationList,
  LearnBoard,
} from "./Workspaces";
import { LiveTalk } from "./LiveTalk";
import { NeuralCoreBoard } from "./NeuralCore";
import { CommandPalette, focusItems } from "./CommandPalette";
import { MindspaceBoard } from "./Mindspace";
import { readDemo, useDemo } from "./demo";

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
    approval,
    decideApproval,
  } = useChat();

  const [coreOnline, setCoreOnline] = useState(true);
  const [focus, setFocus] = useState<FocusId>("today");
  const [focusSignal, setFocusSignal] = useState(0);
  const [agentLive, setAgentLive] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [talkNote, setTalkNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [prefillKey, setPrefillKey] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; firstUser: string }>>([]);
  const { demo, toggle } = useDemo();

  const voice = useVoice({
    messages,
    isLoading,
    onTranscript: (text) => {
      if (readDemo()) {
        setTalkNote("Demo mode does not send. Nothing left this browser.");
        return;
      }
      sendMessage(text);
    },
    enabled: !demo,
    suppressMic: agentLive || demo,
  });

  function ask(prompt: string) {
    if (demo) {
      setTalkNote("Demo mode does not send. Nothing left this browser.");
      return;
    }
    setFocus("talk");
    sendMessage(prompt);
  }

  function afterGreeting() {
    if (readDemo()) {
      setFocus("today");
      return;
    }
    const muted = window.localStorage.getItem("JARVIS-voice-muted") === "true";
    const mic = "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    setFocus("talk");
    if (!muted && mic) voice.toggleLiveMode();
    else setFocusSignal((n) => n + 1);
  }

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
  const { toggleLiveMode, isLiveMode } = voice;
  useEffect(() => {
    if (demo && isLiveMode) toggleLiveMode();
  }, [demo, isLiveMode, toggleLiveMode]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.repeat) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.repeat) {
        e.preventDefault();
        if (readDemo()) {
          setTalkNote("Demo mode keeps live voice off.");
          return;
        }
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
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-deck-line px-4 py-2 sm:gap-4">
        <ArcReactor />
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
        <button
          type="button"
          onClick={() => setFocus("neural")}
          className="shrink-0 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-deck-amber"
        >
          Neural Core
        </button>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="shrink-0 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink"
        >
          Commands
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={demo}
          className={`shrink-0 rounded border px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider ${
            demo ? "border-deck-gold text-deck-gold" : "border-deck-line text-deck-dim"
          }`}
        >
          {demo ? "Demo on" : "Demo off"}
        </button>
        <div className="hidden shrink-0 md:block">
          <HealthChips onStatus={setCoreOnline} />
        </div>
      </header>

      {demo && (
        <p className="border-b border-deck-gold/70 bg-deck-panel px-4 py-2 text-center font-deckmono text-xs uppercase tracking-[0.18em] text-deck-gold">
          Demo · sample data · no personal notes · no keys
        </p>
      )}

      <FocusBar value={focus} onChange={setFocus} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {focus === "today" && <TodayBoard onAct={ask} />}
        {focus === "wavelength" && <WavelengthBoard onAct={ask} />}
        {focus === "content" && <ContentBoard onAct={ask} />}
        {focus === "ally" && <AllyBoard onAct={ask} />}
        {focus === "learn" && <LearnBoard />}
        {focus === "neural" && <NeuralCoreBoard />}
        {focus === "mindspace" && (
          <MindspaceBoard
            onTalk={(prefix) => {
              if (demo) {
                setTalkNote("Demo mode does not send. Nothing left this browser.");
                return;
              }
              setPrefill(prefix);
              setPrefillKey((n) => n + 1);
              setFocus("talk");
            }}
          />
        )}
        {focus === "agents" && (
          <div className="mx-auto grid w-full max-w-3xl gap-4 px-5 py-6">
            <AgentsCard />
            <IntegrationList />
          </div>
        )}
        {focus === "talk" && (
        <main className="flex h-full min-h-0 flex-col">
          <LiveTalk
            active={voice.isLiveMode && !demo}
            muted={voice.isMuted}
            onAgent={setAgentLive}
          />
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
                if (demo) {
                  setTalkNote("Demo mode shows the sample thread only.");
                  setHistory([]);
                  setHistoryOpen(true);
                  return;
                }
                setHistoryOpen((open) => !open);
                if (!historyOpen) {
                  fetch("/api/deck/conversations")
                    .then((res) => res.json())
                    .then((body: { conversations?: Array<{ id: string; firstUser: string }> }) => {
                      setHistory(body.conversations || []);
                    })
                    .catch(() => setHistory([]));
                }
              }}
              className="flex items-center gap-1.5 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink"
            >
              History
            </button>
            <button
              onClick={() => {
                newConversation();
              }}
              className="flex items-center gap-1.5 rounded border border-deck-line px-2 py-1 font-deckmono text-[10px] uppercase tracking-wider text-deck-dim transition-colors hover:border-deck-line-bright hover:text-deck-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-deck-amber"
            >
              {Icons.plus} New
            </button>
          </div>
          {historyOpen && (
            <div className="max-h-40 overflow-y-auto border-b border-deck-line px-4 py-2">
              {demo && <p className="text-sm text-deck-gold">SAMPLE thread only. Saved conversations stay hidden.</p>}
              {!demo && history.length === 0 && <p className="text-sm text-deck-dim">No saved conversations yet.</p>}
              {!demo && history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    fetch(`/api/deck/conversations/${encodeURIComponent(item.id)}`)
                      .then((res) => res.json())
                      .then((body: { turns?: Array<{ role: "user" | "assistant"; content: string; timestamp: string }> }) => {
                        const msgs = (body.turns || [])
                          .filter((turn) => turn.role === "user" || turn.role === "assistant")
                          .map((turn, index) => ({
                            id: `${item.id}-${index}`,
                            role: turn.role,
                            content: turn.content,
                            timestamp: new Date(turn.timestamp),
                          }));
                        loadConversation(item.id, msgs);
                        setHistoryOpen(false);
                      })
                      .catch(() => setTalkNote("That conversation could not be opened."));
                  }}
                  className="block w-full truncate py-1 text-left text-sm text-deck-dim hover:text-deck-ink"
                >
                  {item.firstUser || item.id}
                </button>
              ))}
            </div>
          )}
          {approval && !demo && (
            <div className="border-b border-deck-gold/40 bg-deck-gold/10 px-4 py-2 text-sm text-deck-ink">
              <p>Approve this browser submission exactly as staged: {approval.detail}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => decideApproval(true)} className="rounded border border-deck-ok px-2 py-1 text-deck-ok">Approve</button>
                <button onClick={() => decideApproval(false)} className="rounded border border-deck-line px-2 py-1 text-deck-dim">Reject</button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            <div className="mx-auto w-full max-w-3xl px-5">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-5 pt-24 text-center">
                  <p className="font-deckdisplay text-xl font-medium text-deck-ink">
                    {demo ? "Sample deck." : `${getGreeting()}, boss.`}
                  </p>
                  <p className="max-w-sm text-[13px] leading-relaxed text-deck-dim">
                    {demo
                      ? "This is labelled sample data. Turn demo off to talk to Friday."
                      : "Everything on this deck is a live reading. Where do we start?"}
                  </p>
                  {talkNote && <p className="max-w-sm text-sm text-deck-gold">{talkNote}</p>}
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          if (demo) {
                            setTalkNote("Demo mode does not send. Nothing left this browser.");
                            return;
                          }
                          sendMessage(s);
                        }}
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
              onSend={(text) => {
                if (demo) {
                  setTalkNote("Demo mode does not send. Nothing left this browser.");
                  return;
                }
                sendMessage(text);
              }}
              isLoading={isLoading}
              onStop={() => {
                stopTask();
                voice.stopSpeaking();
              }}
              voice={voice}
              focusSignal={focusSignal}
              prefill={prefill}
              prefillKey={prefillKey}
            />
          </div>
        </main>
        )}
      </div>

      {/* Boot overlay — once per browser session (sessionStorage.fridayBooted) */}
      <BootSequence onFinished={afterGreeting} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={focusItems(setFocus, [
          {
            id: "demo",
            label: demo ? "Turn demo off" : "Turn demo on",
            hint: "Sample",
            run: toggle,
          },
          {
            id: "setup",
            label: "Show setup",
            hint: "Checklist",
            run: () => {
              setFocus("today");
              window.dispatchEvent(new Event("friday-setup"));
            },
          },
        ])}
      />
    </div>
  );
}
