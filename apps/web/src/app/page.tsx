"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { InputBar } from "@/components/InputBar";
import { StatusChip } from "@/components/StatusChip";
import { IronManStartup } from "@/components/IronManStartup";
import { ToolControlPanel } from "@/components/ToolControlPanel";
import { CameraFeed } from "@/components/CameraFeed";
import { KitchenStatus } from "@/components/KitchenStatus";
import { AgentDashboard } from "@/components/AgentDashboard";
import { SystemOverview } from "@/components/SystemOverview";
import { FridayOrb } from "@/components/JarvisOrb";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { useWakeDetection } from "@/hooks/useWakeDetection";
import { useHealth } from "@/hooks/useHealth";
import { useSidecar } from "@/hooks/useSidecar";
import { useAgents } from "@/hooks/useAgents";
import { mockConversations } from "@/data/mockConversations";
import { Conversation } from "@/types";
import { generateId, cn } from "@/lib/utils";

// ─── Startup YouTube track ─────────────────────────────────
const STARTUP_YOUTUBE_URL = "https://www.youtube.com/results?search_query=the+clash+should+i+stay+or+should+i+go+official+music+video";

// ─── Launch startup apps via Next.js API route ─────────────
async function launchStartupApps() {
  try {
    await fetch("/api/startup", { method: "POST" });
  } catch {
    // Non-critical — don't block boot if apps fail to open
  }
}

export default function Home() {
  // Dormant = waiting for double clap. Startup = boot animation. Neither = full UI.
  const [isDormant, setIsDormant] = useState(true);
  const [showStartup, setShowStartup] = useState(false);
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [conversations, setConversations] =
    useState<Conversation[]>(mockConversations);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  const { messages, isLoading, sendMessage, stopTask, clearMessages, setInitialMessages } =
    useChat();
  const { status } = useHealth();
  const sidecar = useSidecar();
  const { agents, tasks, loading: agentLoading, dispatchTask } = useAgents();

  const isAwake = !isDormant && !showStartup;

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      const conversation = conversations.find((c) => c.id === id);
      if (conversation) {
        setInitialMessages(conversation.messages);
      }
    },
    [conversations, setInitialMessages]
  );

  const handleNewChat = useCallback(() => {
    const newConversation: Conversation = {
      id: generateId(),
      title: "New Conversation",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    clearMessages();
  }, [clearMessages]);

  const handleSendMessage = useCallback(
    (content: string) => {
      const lower = content.toLowerCase().trim();
      if (lower === "stop" || lower === "friday stop" || lower === "friday, stop") {
        stopTask();
        return;
      }

      sendMessage(content);

      if (activeConversationId && messages.length === 0) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  title: content.slice(0, 30) + (content.length > 30 ? "..." : ""),
                  updatedAt: new Date(),
                }
              : c
          )
        );
      }
    },
    [activeConversationId, messages.length, sendMessage, stopTask]
  );

  const voice = useVoice({
    messages,
    isLoading,
    onTranscript: handleSendMessage,
    enabled: isAwake,
  });

  // ─── Double Clap → Wake FRIDAY ─────────────────────────────
  const handleDoubleClap = useCallback(() => {
    if (!isDormant) return; // Only respond when dormant

    // 1. Wake up — start the boot sequence
    setIsDormant(false);
    setShowStartup(true);

    // 2. Open YouTube with "Should I Stay or Should I Go"
    window.open(STARTUP_YOUTUBE_URL, "_blank");

    // 3. Launch startup apps (Telegram, Claude Code)
    launchStartupApps();

    // 4. FRIDAY says hello (TTS)
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello sir. Wavelength Solutions online and ready to take action as you request, boss." }),
    })
      .then((res) => {
        if (res.ok && (res.headers.get("content-type") || "").includes("audio")) return res.blob();
        return null;
      })
      .then((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = new Audio(url);
          a.onended = () => URL.revokeObjectURL(url);
          a.onerror = () => URL.revokeObjectURL(url);
          a.play();
        } else if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance("Hello sir. Wavelength Solutions online and ready to take action as you request, boss.");
          const v = speechSynthesis.getVoices();
          const gb = v.find((x) => x.lang === "en-GB") || v.find((x) => x.lang.startsWith("en"));
          if (gb) u.voice = gb;
          speechSynthesis.speak(u);
        }
      })
      .catch(() => {
        if ("speechSynthesis" in window) {
          speechSynthesis.speak(new SpeechSynthesisUtterance("Hello sir. Wavelength Solutions online and ready to take action as you request, boss."));
        }
      });
  }, [isDormant]);

  // Wake detection: say "morning friday" THEN double clap
  const { wakeState } = useWakeDetection({ onWake: handleDoubleClap, enabled: isDormant });

  // Auto-wake via URL param: ?wake=true (allows remote triggering)
  useEffect(() => {
    if (isDormant && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("wake") === "true") {
        // Small delay to let the UI render first
        const t = setTimeout(() => handleDoubleClap(), 500);
        return () => clearTimeout(t);
      }
    }
  }, [isDormant, handleDoubleClap]);

  // ─── Morning Briefing — fires once after startup sequence completes ──
  const handleStartupComplete = useCallback(() => {
    setShowStartup(false);

    // Fetch briefing script from orchestrator and speak it via TTS
    fetch("/api/briefing/morning")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { script?: string } | null) => {
        const script = data?.script;
        if (!script) return;

        fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: script }),
        })
          .then((r) => r.ok ? r.blob() : null)
          .then((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = new Audio(url);
              a.onended = () => URL.revokeObjectURL(url);
              a.onerror = () => URL.revokeObjectURL(url);
              a.play().catch(() => {});
            } else if ("speechSynthesis" in window) {
              const u = new SpeechSynthesisUtterance(script);
              const voices = speechSynthesis.getVoices();
              const gb = voices.find((v) => v.lang === "en-GB") || voices.find((v) => v.lang.startsWith("en"));
              if (gb) u.voice = gb;
              speechSynthesis.speak(u);
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

  // ─── Proactive Alerts — poll every 30s while awake ───────────────
  useEffect(() => {
    if (!isAwake) return;

    const speakAlert = (text: string, alertId: string) => {
      // Mark read first to prevent double-speak
      fetch(`/api/proactive/alerts/${alertId}`, { method: "DELETE" }).catch(() => {});

      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((r) => r.ok ? r.blob() : null)
        .then((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = new Audio(url);
            a.onended = () => URL.revokeObjectURL(url);
            a.onerror = () => URL.revokeObjectURL(url);
            a.play().catch(() => {});
          } else if ("speechSynthesis" in window) {
            const u = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(u);
          }
        })
        .catch(() => {});
    };

    const poll = () => {
      fetch("/api/proactive/alerts")
        .then((r) => r.ok ? r.json() : null)
        .then((data: { alerts?: Array<{ id: string; message: string; priority: string }> } | null) => {
          const alerts = data?.alerts ?? [];
          // Speak only the highest-priority unread alert per poll cycle
          const highPriority = alerts.find((a) => a.priority === "high");
          const toSpeak = highPriority ?? alerts[0];
          if (toSpeak) {
            speakAlert(toSpeak.message, toSpeak.id);
          }
        })
        .catch(() => {});
    };

    const interval = setInterval(poll, 30 * 1000);
    return () => clearInterval(interval);
  }, [isAwake]);

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, messages, updatedAt: new Date() }
            : c
        )
      );
    }
  }, [activeConversationId, messages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowControlPanel((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setShowRightPanel((prev) => !prev);
      }
      if (e.key === "Escape" && showControlPanel) {
        setShowControlPanel(false);
      }
      // Enter key wakes FRIDAY from dormant
      if (e.key === "Enter" && isDormant) {
        e.preventDefault();
        handleDoubleClap();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showControlPanel, isDormant, handleDoubleClap]);

  return (
    <>
      {/* ─── DORMANT SCREEN — waiting for double clap ─── */}
      {isDormant && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center overflow-hidden">
          {/* Ambient background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/[0.03] rounded-full blur-[120px]" />

          {/* Scanlines overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.15) 2px, rgba(6,182,212,0.15) 4px)" }}
          />

          {/* Corner brackets */}
          <div className="absolute top-6 left-6 w-16 h-16 border-l border-t border-cyan-500/20" />
          <div className="absolute top-6 right-6 w-16 h-16 border-r border-t border-cyan-500/20" />
          <div className="absolute bottom-6 left-6 w-16 h-16 border-l border-b border-cyan-500/20" />
          <div className="absolute bottom-6 right-6 w-16 h-16 border-r border-b border-cyan-500/20" />

          {/* Sleeping orb */}
          <div className="relative flex items-center justify-center">
            {/* Outer glow ring */}
            <div className="absolute w-44 h-44 rounded-full border border-cyan-500/10 jarvis-orb-breathe-ring" />
            <div className="absolute w-56 h-56 rounded-full border border-cyan-500/[0.05]" />

            {/* Glow behind orb */}
            <div className="absolute w-32 h-32 bg-cyan-400/10 rounded-full blur-2xl jarvis-orb-breathe" />

            {/* Core orb */}
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/15 shadow-[0_0_40px_rgba(34,211,238,0.15),inset_0_0_30px_rgba(34,211,238,0.1)] jarvis-orb-breathe relative">
              {/* Inner highlight */}
              <div className="absolute inset-3 rounded-full bg-gradient-to-br from-white/10 to-transparent" />
              {/* Center eye */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400/40 shadow-[0_0_12px_rgba(34,211,238,0.4)] jarvis-orb-center-pulse" />
            </div>
          </div>

          {/* Status text */}
          <div className="mt-10 flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 jarvis-orb-center-pulse" />
            <span className="font-mono text-sm tracking-[0.35em] uppercase text-cyan-400/40">
              STANDBY
            </span>
          </div>

          {/* Wake instruction — changes based on state */}
          <p className={`mt-6 text-sm font-light tracking-widest font-mono transition-colors duration-300 ${
            wakeState === "armed"
              ? "text-cyan-400/80 animate-pulse"
              : "text-cyan-600/30"
          }`}>
            {wakeState === "armed"
              ? "// ARMED — DOUBLE CLAP NOW"
              : '// SAY "MORNING FRIDAY" THEN CLAP TWICE'}
          </p>

          {/* Manual wake button */}
          <button
            onClick={handleDoubleClap}
            className="mt-8 px-8 py-3 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-400/60 font-mono text-xs tracking-[0.3em] uppercase hover:bg-cyan-500/15 hover:text-cyan-400/90 hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] transition-all duration-500 active:scale-95"
          >
            WAKE FRIDAY
          </button>
          <p className="mt-3 font-mono text-[10px] text-cyan-700/25 tracking-wider">
            or press ENTER
          </p>

          {/* Bottom status bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 font-mono text-[10px] text-cyan-700/30 tracking-wider">
            <span>FRIDAY v2.0</span>
            <span className="text-cyan-500/20">|</span>
            <span>{wakeState === "armed" ? "ARMED" : "SYSTEMS IDLE"}</span>
            <span className="text-cyan-500/20">|</span>
            <span>MIC ACTIVE</span>
          </div>
        </div>
      )}

      {/* ─── BOOT SEQUENCE ─── */}
      {showStartup && (
        <IronManStartup onComplete={handleStartupComplete} />
      )}

      <ToolControlPanel
        isOpen={showControlPanel}
        onClose={() => setShowControlPanel(false)}
      />

      <div className={`flex h-screen bg-background transition-opacity duration-500 ${!isAwake ? "opacity-0" : "opacity-100"}`}>
        {/* Executing banner */}
        {isLoading && (
          <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 py-2 bg-orange-500/90 text-black font-mono text-sm font-bold animate-pulse">
            <span>EXECUTING...</span>
            <button
              onClick={stopTask}
              className="px-3 py-0.5 bg-black/20 rounded text-xs hover:bg-black/40 transition-colors"
            >
              STOP
            </button>
          </div>
        )}

        {/* Left Sidebar — Conversations */}
        <Sidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
        />

        {/* Center — Chat */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
            <h1 className="text-sm font-semibold text-text-primary truncate">
              {activeConversation?.title || "New Conversation"}
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRightPanel((prev) => !prev)}
                className="px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                title="Toggle Dashboard (Ctrl+B)"
              >
                {showRightPanel ? "Hide" : "Show"} HUD
              </button>
              <button
                onClick={() => setShowControlPanel(true)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Open Control Center (Ctrl+K)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <kbd className="hidden sm:inline px-1 py-0.5 text-[10px] bg-black/20 rounded">Ctrl+K</kbd>
              </button>
              <StatusChip status={status} />
            </div>
          </header>

          <ChatPanel messages={messages} />

          {/* FRIDAY Voice Orb — hero when empty, compact when chatting */}
          <div className={cn(
            "flex justify-center",
            messages.length === 0
              ? "flex-1 items-center -mt-20"
              : "py-3 border-t border-gray-800/50"
          )}>
            <FridayOrb
              isListening={voice.isListening}
              isTranscribing={voice.isTranscribing}
              isSpeaking={voice.isSpeaking}
              isMuted={voice.isMuted}
              isLoading={isLoading}
              variant={messages.length === 0 ? "hero" : "compact"}
              onClick={voice.isListening ? voice.stopListening : voice.startListening}
            />
          </div>

          <InputBar onSend={handleSendMessage} disabled={isLoading} voice={voice} />
        </div>

        {/* Right Sidebar — HUD Dashboard */}
        {showRightPanel && (
          <div className="w-80 border-l border-gray-800 bg-gray-950 overflow-y-auto flex flex-col gap-3 p-3">
            {/* Camera Feed */}
            <CameraFeed
              frameUrl={sidecar.frameUrl}
              connected={sidecar.connected}
              analysis={sidecar.status?.last_analysis as Record<string, unknown>}
            />

            {/* Kitchen Nagger Status */}
            <KitchenStatus
              messLevel={sidecar.status?.mess_level ?? 0}
              consecutiveNags={sidecar.status?.consecutive_nags ?? 0}
              totalNagsToday={sidecar.status?.total_nags_today ?? 0}
              totalCleanupsToday={sidecar.status?.total_cleanups_today ?? 0}
              dailyEvents={sidecar.status?.daily_events ?? []}
            />

            {/* Agent Dashboard */}
            <AgentDashboard
              agents={agents}
              tasks={tasks}
              loading={agentLoading}
              onDispatch={dispatchTask}
            />

            {/* System Overview */}
            <SystemOverview
              orchestratorStatus={status}
              sidecarConnected={sidecar.connected}
              voiceMode={sidecar.status?.voice_mode ?? "off"}
            />
          </div>
        )}
      </div>
    </>
  );
}
