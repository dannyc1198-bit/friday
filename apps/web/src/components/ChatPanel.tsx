"use client";

import { Message } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import { useAutoScroll } from "@/hooks/useAutoScroll";

interface ChatPanelProps {
  messages: Message[];
}

export function ChatPanel({ messages }: ChatPanelProps) {
  const scrollRef = useAutoScroll<HTMLDivElement>([messages]);

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin"
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
