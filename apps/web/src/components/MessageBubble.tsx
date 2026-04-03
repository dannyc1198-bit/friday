"use client";

import { Message } from "@/types";
import { cn, formatTime } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2",
          isUser
            ? "bg-primary text-white rounded-br-md"
            : "bg-surface border border-border text-text-primary rounded-bl-md"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
          )}
        </p>
        <p
          className={cn(
            "text-xs mt-1",
            isUser ? "text-blue-200" : "text-text-muted"
          )}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
