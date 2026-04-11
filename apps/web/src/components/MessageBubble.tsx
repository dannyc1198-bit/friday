"use client";

import { Message } from "@/types";
import { cn, formatTime } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 group", isUser ? "justify-end" : "justify-start")}>
      {/* FRIDAY avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 mt-1 rounded-full bg-gradient-to-br from-[#00b4ff]/20 to-[#00dcff]/10 border border-[#00b4ff]/20 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-[#00dcff] shadow-[0_0_8px_rgba(0,220,255,0.5)]" />
        </div>
      )}

      <div className={cn("relative max-w-[75%] px-4 py-3", isUser ? "msg-user" : "msg-assistant")}>
        {/* Sender label */}
        <div className={cn(
          "text-[9px] font-mono uppercase tracking-[0.2em] mb-1.5",
          isUser ? "text-[#00b4ff]/60 text-right" : "text-[#00dcff]/50"
        )}>
          {isUser ? "DANNY" : "F.R.I.D.A.Y."}
        </div>

        <p className="text-[13px] leading-relaxed text-[#e0f0ff] whitespace-pre-wrap font-light">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-[#00dcff] animate-cursor-blink" />
          )}
        </p>

        <p className={cn(
          "text-[9px] font-mono mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
          isUser ? "text-[#00b4ff]/40 text-right" : "text-[#5a8aaa]/50"
        )}>
          {formatTime(message.timestamp)}
        </p>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 mt-1 rounded-full bg-gradient-to-br from-[#00b4ff]/30 to-[#0070a0]/20 border border-[#00b4ff]/20 flex items-center justify-center">
          <span className="text-[9px] font-display font-bold text-[#00dcff]">D</span>
        </div>
      )}
    </div>
  );
}
