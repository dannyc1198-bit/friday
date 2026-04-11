"use client";

import { Conversation } from "@/types";
import { ConversationItem } from "./ConversationItem";
import { cn } from "@/lib/utils";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: SidebarProps) {
  return (
    <div className="w-64 h-full bg-[#060e1a] border-r border-[rgba(0,180,255,0.06)] flex flex-col">
      {/* Header — Stark Industries style */}
      <div className="p-4 border-b border-[rgba(0,180,255,0.06)]">
        <div className="flex items-center gap-3 mb-5">
          {/* Logo mark */}
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#00b4ff]/20 to-[#00dcff]/5 border border-[#00b4ff]/15" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-[#00dcff]/60 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-[#00dcff] shadow-[0_0_6px_rgba(0,220,255,0.6)]" />
              </div>
            </div>
          </div>
          <div>
            <h1 className="text-sm font-display font-bold tracking-[0.15em] text-[#e0f0ff] uppercase">
              F.R.I.D.A.Y.
            </h1>
            <p className="text-[8px] font-mono tracking-[0.25em] text-[#5a8aaa] uppercase">
              Command Terminal
            </p>
          </div>
        </div>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md",
            "bg-[#00b4ff]/10 border border-[#00b4ff]/20",
            "text-[#00dcff] font-mono text-[11px] tracking-[0.15em] uppercase",
            "hover:bg-[#00b4ff]/20 hover:border-[#00b4ff]/35 hover:shadow-glow-sm",
            "active:scale-[0.98] transition-all duration-300"
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </button>
      </div>

      {/* Session history label */}
      <div className="px-4 py-2.5">
        <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-[#1e3a50]">
          Session History
        </span>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            onClick={() => onSelectConversation(conversation.id)}
          />
        ))}
      </div>

      {/* Bottom status */}
      <div className="px-4 py-3 border-t border-[rgba(0,180,255,0.04)]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#66ffb2] status-dot-glow" style={{ color: '#66ffb2' }} />
          <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#5a8aaa]">
            Systems Nominal
          </span>
        </div>
      </div>
    </div>
  );
}
