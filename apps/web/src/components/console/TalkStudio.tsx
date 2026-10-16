"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseTabCommand } from "@/lib/app-tabs";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { getGreeting } from "@/lib/utils";
import { DeckMessage } from "@/components/deck/DeckMessage";
import { DeckInput } from "@/components/deck/DeckInput";
import { LiveTalk } from "@/components/deck/LiveTalk";
import { readDemo, useDemo } from "@/components/deck/demo";
import { PageHeader } from "./States";

export function TalkStudio() {
  const params = useSearchParams();
  const initial = params.get("prefill") || "";
  const { demo } = useDemo();
  const router = useRouter();
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
  const [note, setNote] = useState("");
  const [agentLive, setAgentLive] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; firstUser: string }>>([]);
  const [prefill] = useState(initial);
  const [prefillKey] = useState(initial ? 1 : 0);
  const endRef = useRef<HTMLDivElement>(null);

  const voice = useVoice({
    messages,
    isLoading,
    onTranscript: (text) => {
      if (readDemo()) {
        setNote("Demo mode does not send. Nothing left this browser.");
        return;
      }
      const tab = parseTabCommand(text, "/talk");
      if (tab) {
        setNote(`Opening ${tab}.`);
        router.push(tab);
        return;
      }
      sendMessage(text);
    },
    enabled: !demo,
    suppressMic: agentLive || demo,
  });

  const { toggleLiveMode, isLiveMode } = voice;
  const wantsVoice = params.get("voice") === "1";
  const voiceStarted = useRef(false);
  useEffect(() => {
    if (!wantsVoice || demo || voiceStarted.current) return;
    voiceStarted.current = true;
    if (!isLiveMode) toggleLiveMode();
  }, [wantsVoice, demo, isLiveMode, toggleLiveMode]);
  useEffect(() => {
    if (demo && isLiveMode) toggleLiveMode();
  }, [demo, isLiveMode, toggleLiveMode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.repeat) {
        event.preventDefault();
        if (readDemo()) {
          setNote("Demo mode keeps live voice off.");
          return;
        }
        toggleLiveMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleLiveMode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const suggestions = ["What's the fleet status?", "What have you learned about me lately?", "Anything I should know from the news?"];

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6 md:px-8">
      <PageHeader kicker="Conversation" title="Talk" detail="Drafts stay drafts. Demo mode keeps the microphone off and does not send." />
      <LiveTalk active={voice.isLiveMode && !demo} muted={voice.isMuted} onAgent={setAgentLive} />
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{voice.isLiveMode ? "Hands-free is on" : "Hands-free is off"}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-line px-2 py-1 hover:bg-raised"
            onClick={() => {
              if (demo) {
                setNote("Demo mode shows the sample thread only.");
                setHistory([]);
                setHistoryOpen(true);
                return;
              }
              setHistoryOpen((open) => !open);
              if (!historyOpen) {
                fetch("/api/deck/conversations")
                  .then((res) => res.json())
                  .then((body: { conversations?: Array<{ id: string; firstUser: string }> }) => setHistory(body.conversations || []))
                  .catch(() => setHistory([]));
              }
            }}
          >
            History
          </button>
          <button type="button" className="rounded border border-line px-2 py-1 hover:bg-raised" onClick={() => newConversation()}>
            New
          </button>
        </div>
      </div>
      {historyOpen && (
        <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-line bg-panel p-3 text-sm">
          {demo && <p className="text-brass">Sample thread only. Saved conversations stay hidden.</p>}
          {!demo && history.length === 0 && <p className="text-muted">No saved conversations yet.</p>}
          {!demo && history.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full truncate py-1 text-left text-muted hover:text-ink"
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
                  .catch(() => setNote("That conversation could not be opened."));
              }}
            >
              {item.firstUser || item.id}
            </button>
          ))}
        </div>
      )}
      {approval && !demo && (
        <div className="mb-3 rounded-lg border border-brass/40 bg-brass/10 px-4 py-3 text-sm">
          <p>Approve this browser submission exactly as staged: {approval.detail}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => decideApproval(true)} className="rounded border border-ok px-3 py-1 text-ok">Approve</button>
            <button type="button" onClick={() => decideApproval(false)} className="rounded border border-line px-3 py-1 text-muted">Reject</button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-start justify-center gap-3">
            <p className="text-lg font-medium text-ink">{demo ? "Sample thread is empty until demo data loads." : `${getGreeting()}.`}</p>
            <p className="max-w-md text-sm text-muted">
              {demo ? "Turn demo off to talk to Friday." : "Ask for a draft. Nothing is sent, spent, or traded from this page."}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
                  onClick={() => {
                    if (demo) {
                      setNote("Demo mode does not send. Nothing left this browser.");
                      return;
                    }
                    sendMessage(item);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <DeckMessage key={message.id} message={message} tone="console" />)
        )}
        <div ref={endRef} />
      </div>
      {note && <p className="py-2 text-sm text-brass">{note}</p>}
      {error && <p className="py-2 text-sm text-danger">{error}</p>}
      <DeckInput
        tone="console"
        onSend={(text) => {
          if (demo) {
            setNote("Demo mode does not send. Nothing left this browser.");
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
        prefill={prefill}
        prefillKey={prefillKey}
      />
    </div>
  );
}
