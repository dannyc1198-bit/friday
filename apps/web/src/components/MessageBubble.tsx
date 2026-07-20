"use client";

import { Message, ToolActivity } from "@/types";
import { cn, formatTime } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

// ─── Cognition chips ─────────────────────────────────────────
// Each tool call FRIDAY makes materializes as a HUD readout above her reply:
// brain ops get the mind glyph, everything else the gear. Running chips pulse;
// settled chips lock to done/error color.

const CHIP_META: Record<string, { glyph: string; label: string }> = {
  brain_recall:    { glyph: "◉", label: "RECALL" },
  brain_remember:  { glyph: "✎", label: "REMEMBER" },
  brain_status:    { glyph: "◉", label: "MIND" },
  brain_reflect:   { glyph: "✦", label: "REFLECT" },
  memory_save:     { glyph: "✎", label: "NOTE" },
  memory_search:   { glyph: "◉", label: "SEARCH" },
  obsidian_search: { glyph: "◈", label: "VAULT" },
  obsidian_read:   { glyph: "◈", label: "VAULT READ" },
  obsidian_create: { glyph: "◈", label: "VAULT WRITE" },
  obsidian_edit:   { glyph: "◈", label: "VAULT EDIT" },
  obsidian_daily:  { glyph: "◈", label: "DAILY NOTE" },
};

function chipMeta(tool: string): { glyph: string; label: string } {
  return CHIP_META[tool] || { glyph: "⚙", label: tool.replace(/_/g, " ").toUpperCase() };
}

function ActivityChip({ activity }: { activity: ToolActivity }) {
  const meta = chipMeta(activity.tool);
  const isBrain = activity.tool.startsWith("brain_") || activity.tool.startsWith("memory_") || activity.tool.startsWith("obsidian_");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-[3px] rounded-sm border font-mono text-[8px] tracking-[0.18em] uppercase transition-all duration-500",
        activity.status === "running" &&
          "border-[#00dcff]/40 bg-[#00b4ff]/10 text-[#00dcff] animate-pulse shadow-[0_0_10px_rgba(0,220,255,0.15)]",
        activity.status === "done" &&
          (isBrain
            ? "border-[#66ffb2]/25 bg-[#66ffb2]/[0.06] text-[#66ffb2]/80"
            : "border-[#00b4ff]/20 bg-[#00b4ff]/[0.05] text-[#5a8aaa]"),
        activity.status === "error" && "border-[#ff5252]/30 bg-[#ff5252]/[0.06] text-[#ff5252]/80"
      )}
    >
      <span className="text-[9px] leading-none">{meta.glyph}</span>
      <span>{meta.label}</span>
      {activity.detail && (
        <span className="normal-case tracking-normal text-[8px] opacity-70 max-w-[180px] truncate">
          {activity.detail}
        </span>
      )}
      {activity.status === "done" && <span className="text-[8px]">✓</span>}
      {activity.status === "error" && <span className="text-[8px]">✕</span>}
    </span>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasActivity = !isUser && message.activity && message.activity.length > 0;

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

        {/* Cognition trace — what she did before/while answering */}
        {hasActivity && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {message.activity!.map((a) => (
              <ActivityChip key={a.id} activity={a} />
            ))}
          </div>
        )}

        {(message.content || message.isStreaming) && (
          <p className="text-[13px] leading-relaxed text-[#e0f0ff] whitespace-pre-wrap font-light">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-1 bg-[#00dcff] animate-cursor-blink" />
            )}
          </p>
        )}

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
