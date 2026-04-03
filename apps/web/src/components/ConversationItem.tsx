"use client";

import { Conversation } from "@/types";
import { cn, formatDate, truncate } from "@/lib/utils";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onClick,
}: ConversationItemProps) {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const preview = lastMessage
    ? truncate(lastMessage.content, 50)
    : "No messages yet";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg transition-colors",
        "hover:bg-JARVIS-card",
        isActive && "bg-JARVIS-card border border-JARVIS-border"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-JARVIS-text truncate pr-2">
          {conversation.title}
        </h3>
        <span className="text-xs text-JARVIS-muted whitespace-nowrap">
          {formatDate(conversation.updatedAt)}
        </span>
      </div>
      <p className="text-xs text-JARVIS-muted truncate">{preview}</p>
    </button>
  );
}
