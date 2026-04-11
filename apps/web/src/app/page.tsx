"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { InputBar } from "@/components/InputBar";
import { StatusChip } from "@/components/StatusChip";
import { DramaticStartup } from "@/components/DramaticStartup";
import { ToolControlPanel } from "@/components/ToolControlPanel";
import { CameraFeed } from "@/components/CameraFeed";
import { CryptoPanel, SystemPanel, AgentPanel, BusinessPanel, AlertsPanel, ComputePanel, NetworkPanel } from "@/components/hud";
import { KitchenStatus } from "@/components/KitchenStatus";
import { useProactiveInsights } from "@/hooks/useProactiveInsights";
import dynamic from "next/dynamic";
const NeuralOrb = dynamic(() => import("@/components/NeuralOrb").then(m => ({ default: m.NeuralOrb })), { ssr: false });
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

async function launchStartupApps() {
  try { await fetch("/api/startup", { method: "POST" }); } catch { /* non-critical */ }
}

export default function Home() {
  const [isDormant, setIsDormant] = useState(true);
  const [showStartup, setShowStartup] = useState(false);
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const { messages, isLoading, sendMessage, stopTask, clearMessages, setInitialMessages } = useChat();
  const { status } = useHealth();
  const sidecar = useSidecar();
  const { agents, tasks, loading: agentLoading, dispatchTask } = useAgents();

  const isAwake = !isDormant && !showStartup;
  const { insights, learningStats, dismissInsight } = useProactiveInsights(isAwake);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    const conversation = conversations.find((c) => c.id === id);
    if (conversation) setInitialMessages(conversation.messages);
  }, [conversations, setInitialMessages]);

  const handleNewChat = useCallback(() => {
    const newConversation: Conversation = {
      id: generateId(), title: "New Conversation", messages: [], createdAt: new Date(), updatedAt: new Date(),
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    clearMessages();
  }, [clearMessages]);

  const handleSendMessage = useCallback((content: string) => {
    const lower = content.toLowerCase().trim();
    if (lower === "stop" || lower === "friday stop" || lower === "friday, stop") { stopTask(); return; }
    sendMessage(content);
    if (activeConversationId && messages.length === 0) {
      setConversations((prev) => prev.map((c) =>
        c.id === activeConversationId ? { ...c, title: content.slice(0, 30) + (content.length > 30 ? "..." : ""), updatedAt: new Date() } : c
      ));
    }
  }, [activeConversationId, messages.length, sendMessage, stopTask]);

  const voice = useVoice({ messages, isLoading, onTranscript: handleSendMessage, enabled: isAwake });

  // ─── Double Clap → Wake FRIDAY ─────────────────────────────
  const handleDoubleClap = useCallback(() => {
    if (!isDormant) return;
    setIsDormant(false);
    setShowStartup(true);
    window.open(STARTUP_YOUTUBE_URL, "_blank");
    launchStartupApps();

    fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello sir. Wavelength Solutions online and ready to take action as you request, boss." }),
    })
      .then((res) => { if (res.ok && (res.headers.get("content-type") || "").includes("audio")) return res.blob(); return null; })
      .then((blob) => {
        if (blob) { const url = URL.createObjectURL(blob); const a = new Audio(url); a.onended = () => URL.revokeObjectURL(url); a.onerror = () => URL.revokeObjectURL(url); a.play(); }
        else if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance("Hello sir. Wavelength Solutions online and ready to take action as you request, boss."); const v = speechSynthesis.getVoices(); const gb = v.find((x) => x.lang === "en-GB") || v.find((x) => x.lang.startsWith("en")); if (gb) u.voice = gb; speechSynthesis.speak(u); }
      })
      .catch(() => { if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance("Hello sir. Wavelength Solutions online and ready to take action as you request, boss.")); });
  }, [isDormant]);

  const { wakeState } = useWakeDetection({ onWake: handleDoubleClap, enabled: isDormant });

  useEffect(() => {
    if (isDormant && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("wake") === "true") { const t = setTimeout(() => handleDoubleClap(), 500); return () => clearTimeout(t); }
    }
  }, [isDormant, handleDoubleClap]);

  // ─── Morning Briefing ─────────────────────────────────────
  const handleStartupComplete = useCallback(() => {
    setShowStartup(false);
    fetch("/api/briefing/morning").then((r) => r.ok ? r.json() : null).then((data: { script?: string } | null) => {
      const script = data?.script; if (!script) return;
      fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: script }) })
        .then((r) => r.ok ? r.blob() : null)
        .then((blob) => { if (blob) { const url = URL.createObjectURL(blob); const a = new Audio(url); a.onended = () => URL.revokeObjectURL(url); a.onerror = () => URL.revokeObjectURL(url); a.play().catch(() => {}); } else if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(script); const voices = speechSynthesis.getVoices(); const gb = voices.find((v) => v.lang === "en-GB") || voices.find((v) => v.lang.startsWith("en")); if (gb) u.voice = gb; speechSynthesis.speak(u); } })
        .catch(() => {});
    }).catch(() => {});
  }, []);

  // ─── Proactive Alerts ─────────────────────────────────────
  useEffect(() => {
    if (!isAwake) return;
    const speakAlert = (text: string, alertId: string) => {
      fetch(`/api/proactive/alerts/${alertId}`, { method: "DELETE" }).catch(() => {});
      fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
        .then((r) => r.ok ? r.blob() : null)
        .then((blob) => { if (blob) { const url = URL.createObjectURL(blob); const a = new Audio(url); a.onended = () => URL.revokeObjectURL(url); a.onerror = () => URL.revokeObjectURL(url); a.play().catch(() => {}); } else if ("speechSynthesis" in window) { speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } })
        .catch(() => {});
    };
    const poll = () => {
      fetch("/api/proactive/alerts").then((r) => r.ok ? r.json() : null).then((data: { alerts?: Array<{ id: string; message: string; priority: string }> } | null) => {
        const alerts = data?.alerts ?? []; const highPriority = alerts.find((a) => a.priority === "high"); const toSpeak = highPriority ?? alerts[0]; if (toSpeak) speakAlert(toSpeak.message, toSpeak.id);
      }).catch(() => {});
    };
    const interval = setInterval(poll, 30 * 1000);
    return () => clearInterval(interval);
  }, [isAwake]);

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      setConversations((prev) => prev.map((c) => c.id === activeConversationId ? { ...c, messages, updatedAt: new Date() } : c));
    }
  }, [activeConversationId, messages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setShowControlPanel((prev) => !prev); }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") { e.preventDefault(); setShowRightPanel((prev) => !prev); }
      if (e.key === "Escape" && showControlPanel) setShowControlPanel(false);
      if (e.key === "Enter" && isDormant) { e.preventDefault(); handleDoubleClap(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showControlPanel, isDormant, handleDoubleClap]);

  return (
    <>
      {/* ═══ DORMANT — Cinematic standby screen ═══ */}
      {isDormant && (
        <div className="fixed inset-0 z-[60] bg-[#020a14] flex flex-col items-center justify-center overflow-hidden">
          {/* Deep ambient light */}
          <div className="ambient-glow ambient-glow-orb" />
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00b4ff]/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00b4ff]/20 to-transparent" />

          {/* Scanlines */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,180,255,0.1) 3px, rgba(0,180,255,0.1) 6px)" }}
          />

          {/* Corner brackets — larger, more dramatic */}
          <div className="absolute top-8 left-8 w-20 h-20 border-l border-t border-[#00b4ff]/15" />
          <div className="absolute top-8 right-8 w-20 h-20 border-r border-t border-[#00b4ff]/15" />
          <div className="absolute bottom-8 left-8 w-20 h-20 border-l border-b border-[#00b4ff]/15" />
          <div className="absolute bottom-8 right-8 w-20 h-20 border-r border-b border-[#00b4ff]/15" />

          {/* Inner brackets */}
          <div className="absolute top-8 left-8 w-6 h-6 border-l-2 border-t-2 border-[#00b4ff]/25" />
          <div className="absolute top-8 right-8 w-6 h-6 border-r-2 border-t-2 border-[#00b4ff]/25" />
          <div className="absolute bottom-8 left-8 w-6 h-6 border-l-2 border-b-2 border-[#00b4ff]/25" />
          <div className="absolute bottom-8 right-8 w-6 h-6 border-r-2 border-b-2 border-[#00b4ff]/25" />

          {/* Sleeping orb — premium version */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-52 h-52 rounded-full border border-[#00b4ff]/[0.06] jarvis-orb-breathe-ring" />
            <div className="absolute w-40 h-40 rounded-full border border-[#00b4ff]/[0.08] jarvis-orb-breathe-ring" style={{ animationDelay: "-1s" }} />
            <div className="absolute w-64 h-64 rounded-full border border-[#00b4ff]/[0.03]" />

            <div className="absolute w-36 h-36 rounded-full bg-[#00b4ff]/[0.04] blur-3xl jarvis-orb-breathe" />

            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#00b4ff]/15 to-[#00dcff]/8 shadow-[0_0_60px_rgba(0,180,255,0.12),inset_0_0_40px_rgba(0,180,255,0.08)] jarvis-orb-breathe relative border border-[#00b4ff]/10">
              <div className="absolute inset-4 rounded-full bg-gradient-to-br from-white/[0.07] to-transparent" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#00dcff]/30 shadow-[0_0_15px_rgba(0,220,255,0.4)] jarvis-orb-center-pulse" />
            </div>
          </div>

          {/* Status */}
          <div className="mt-12 flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00dcff]/40 jarvis-orb-center-pulse" />
            <span className="font-display text-sm font-semibold tracking-[0.4em] uppercase text-[#00dcff]/30">
              Standby
            </span>
          </div>

          {/* Wake instruction */}
          <p className={`mt-8 text-[11px] font-mono tracking-[0.2em] transition-all duration-500 ${
            wakeState === "armed"
              ? "text-[#00dcff]/80 text-glow animate-pulse"
              : "text-[#1e3a50]"
          }`}>
            {wakeState === "armed"
              ? "// ARMED — DOUBLE CLAP NOW"
              : '// SAY "MORNING FRIDAY" THEN CLAP TWICE'}
          </p>

          {/* Wake button — premium */}
          <button
            onClick={handleDoubleClap}
            className="mt-10 px-10 py-3.5 rounded-md border border-[#00b4ff]/20 bg-[#00b4ff]/[0.04] text-[#00dcff]/50 font-display text-xs font-semibold tracking-[0.35em] uppercase hover:bg-[#00b4ff]/10 hover:text-[#00dcff]/90 hover:border-[#00b4ff]/40 hover:shadow-glow-md transition-all duration-500 active:scale-[0.97]"
          >
            Initialize FRIDAY
          </button>
          <p className="mt-3 font-mono text-[9px] text-[#1e3a50] tracking-[0.2em]">
            or press ENTER
          </p>

          {/* Bottom telemetry bar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-5 font-mono text-[9px] tracking-[0.15em]">
            <span className="text-[#1e3a50]">F.R.I.D.A.Y. v2.0</span>
            <span className="text-[#0a1a2e]">|</span>
            <span className={wakeState === "armed" ? "text-[#00dcff]/60" : "text-[#1e3a50]"}>
              {wakeState === "armed" ? "ARMED" : "IDLE"}
            </span>
            <span className="text-[#0a1a2e]">|</span>
            <span className="text-[#1e3a50]">MIC ACTIVE</span>
            <span className="text-[#0a1a2e]">|</span>
            <span className="text-[#1e3a50]">WAVELENGTH SOLUTIONS</span>
          </div>
        </div>
      )}

      {/* ═══ BOOT SEQUENCE ═══ */}
      {showStartup && <DramaticStartup onComplete={handleStartupComplete} />}

      <ToolControlPanel isOpen={showControlPanel} onClose={() => setShowControlPanel(false)} />

      {/* ═══ MAIN COMMAND CENTER ═══ */}
      <div className={`flex h-screen bg-[#020a14] hud-grid-bg hud-scanlines transition-opacity duration-700 ${!isAwake ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        {/* Ambient lighting */}
        <div className="ambient-glow ambient-glow-top" />

        {/* Executing Banner — cinematic sweep */}
        {isLoading && (
          <div className="fixed top-0 left-0 right-0 z-50 exec-banner">
            <div className="relative z-10 flex items-center justify-center gap-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-black/30 animate-pulse" />
                <span className="text-[11px] font-display font-bold tracking-[0.3em] uppercase text-black/80">
                  Executing
                </span>
              </div>
              <button
                onClick={stopTask}
                className="px-4 py-1 bg-black/20 rounded text-[10px] font-mono tracking-[0.15em] text-black/70 hover:bg-black/30 hover:text-black transition-colors uppercase"
              >
                Abort
              </button>
            </div>
          </div>
        )}

        {/* Left — Sidebar */}
        <Sidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
        />

        {/* Center — Chat + Orb */}
        <div className="flex-1 flex flex-col h-full min-w-0 relative">
          {/* Header bar — command center style */}
          <header className="relative flex items-center justify-between px-5 py-2.5 bg-[#020a14]/90 backdrop-blur-xl border-b border-[rgba(0,180,255,0.05)]">
            {/* Bottom edge glow */}
            <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#00b4ff]/15 to-transparent" />

            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00dcff] shadow-[0_0_6px_rgba(0,220,255,0.5)] animate-pulse" />
              <h1 className="text-[10px] font-display font-semibold uppercase tracking-[0.25em] text-[#5a8aaa]">
                {activeConversation?.title || "F.R.I.D.A.Y. — Active Session"}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRightPanel((prev) => !prev)}
                className="px-3 py-1.5 rounded text-[9px] font-mono tracking-[0.15em] uppercase text-[#5a8aaa] hover:text-[#e0f0ff] hover:bg-[#00b4ff]/5 transition-all duration-300"
                title="Toggle Dashboard (Ctrl+B)"
              >
                {showRightPanel ? "Hide" : "Show"} HUD
              </button>
              <button
                onClick={() => setShowControlPanel(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#00b4ff]/[0.06] border border-[#00b4ff]/10 text-[#00dcff]/70 hover:bg-[#00b4ff]/10 hover:text-[#00dcff] hover:border-[#00b4ff]/20 transition-all duration-300"
                title="Control Center (Ctrl+K)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <kbd className="hidden sm:inline text-[8px] font-mono text-[#5a8aaa]">Ctrl+K</kbd>
              </button>
              <StatusChip status={status} />
            </div>
          </header>

          {/* Chat area */}
          <ChatPanel messages={messages} />

          {/* Proactive Insight Banner */}
          {insights.length > 0 && messages.length === 0 && (
            <div className="px-6 py-2">
              <div className="max-w-md mx-auto">
                {insights.slice(0, 2).map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-start gap-3 px-4 py-2.5 mb-1.5 rounded-md bg-[#0a1a2e]/60 border border-[rgba(0,180,255,0.08)] backdrop-blur-sm group"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      insight.priority === "high" ? "bg-[#ff5252]" : insight.priority === "medium" ? "bg-[#ffa726]" : "bg-[#00dcff]"
                    } status-dot-glow`} style={{ color: insight.priority === "high" ? "#ff5252" : insight.priority === "medium" ? "#ffa726" : "#00dcff" }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[8px] font-display font-semibold uppercase tracking-[0.2em] text-[#5a8aaa]">
                        {insight.title}
                      </span>
                      <p className="text-[11px] font-light text-[#e0f0ff]/70 mt-0.5 leading-relaxed">
                        {insight.message}
                      </p>
                    </div>
                    <button
                      onClick={() => dismissInsight(insight.id)}
                      className="text-[#1e3a50] hover:text-[#5a8aaa] transition-colors opacity-0 group-hover:opacity-100 mt-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Neural Orb — hero (empty) or compact (chatting) */}
          <div className={cn(
            "flex justify-center relative z-10",
            messages.length === 0
              ? "flex-1 items-center -mt-16"
              : "py-3 border-t border-[rgba(0,180,255,0.04)]"
          )}>
            {messages.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[500px] h-[500px] rounded-full bg-[#00b4ff]/[0.02] blur-[100px]" />
              </div>
            )}
            <NeuralOrb
              isListening={voice.isListening}
              isThinking={isLoading}
              isSpeaking={voice.isSpeaking}
              isMuted={voice.isMuted}
              size={messages.length === 0 ? "hero" : "compact"}
            />
          </div>

          <InputBar onSend={handleSendMessage} disabled={isLoading} voice={voice} />
        </div>

        {/* Right — HUD Dashboard */}
        {showRightPanel && (
          <div className="w-[320px] border-l border-[rgba(0,180,255,0.05)] bg-[#020a14]/95 backdrop-blur-2xl overflow-y-auto flex flex-col gap-2 p-2 scrollbar-thin relative">
            {/* Top glow */}
            <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[#00b4ff]/15 to-transparent" />

            {/* Dashboard label */}
            <div className="px-2 py-2">
              <span className="text-[8px] font-display font-semibold uppercase tracking-[0.3em] text-[#1e3a50]">
                Telemetry Dashboard
              </span>
            </div>

            <CryptoPanel />
            <BusinessPanel />
            <SystemPanel />
            <AgentPanel />
            <ComputePanel />
            <NetworkPanel />
            <AlertsPanel />

            <CameraFeed
              frameUrl={sidecar.frameUrl}
              connected={sidecar.connected}
              analysis={sidecar.status?.last_analysis as Record<string, unknown>}
            />

            {/* Kitchen Nagger — wired to sidecar */}
            {sidecar.status && (
              <KitchenStatus
                messLevel={sidecar.status.mess_level}
                consecutiveNags={sidecar.status.consecutive_nags}
                totalNagsToday={sidecar.status.total_nags_today}
                totalCleanupsToday={sidecar.status.total_cleanups_today}
                dailyEvents={sidecar.status.daily_events}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
