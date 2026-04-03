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
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { useHealth } from "@/hooks/useHealth";
import { useSidecar } from "@/hooks/useSidecar";
import { useAgents } from "@/hooks/useAgents";
import { mockConversations } from "@/data/mockConversations";
import { Conversation } from "@/types";
import { generateId } from "@/lib/utils";

export default function Home() {
  const [showStartup, setShowStartup] = useState(true);
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
      if (lower === "stop" || lower === "jarvis stop" || lower === "jarvis, stop") {
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
    enabled: !showStartup,
  });

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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showControlPanel]);

  return (
    <>
      {showStartup && (
        <IronManStartup onComplete={() => setShowStartup(false)} />
      )}

      <ToolControlPanel
        isOpen={showControlPanel}
        onClose={() => setShowControlPanel(false)}
      />

      <div className={`flex h-screen bg-background transition-opacity duration-500 ${showStartup ? "opacity-0" : "opacity-100"}`}>
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
