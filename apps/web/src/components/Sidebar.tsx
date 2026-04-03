"use client";

import { Conversation } from "@/types";
import { ConversationItem } from "./ConversationItem";
import { APP_NAME } from "@/lib/constants";
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
    <div className="w-72 h-full bg-JARVIS-sidebar border-r border-JARVIS-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-JARVIS-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-JARVIS-accent to-blue-700 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold text-JARVIS-text">
            {APP_NAME}
          </span>
        </div>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg",
            "bg-JARVIS-accent hover:bg-JARVIS-accent-hover",
            "text-white font-medium text-sm transition-colors"
          )}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Chat
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            onClick={() => onSelectConversation(conversation.id)}
          />
        ))}
      </div>
    </div>
  );
}
