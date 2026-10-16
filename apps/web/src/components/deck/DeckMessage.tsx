"use client";

import { Message } from "@/types";
import { formatTime } from "@/lib/utils";
import { toolLabel } from "./deck-lib";
import { messageSegments, obsidianOpenHref } from "@/lib/message-segments";

// Transcript entries, not chat bubbles. A flight deck keeps a log:
// speaker tag, timestamp, cognition chips, then the words.

export function DeckMessage({ message, tone = "deck" }: { message: Message; tone?: "deck" | "console" }) {
  const isUser = message.role === "user";
  const plain = tone === "console";

  return (
    <article className={plain ? "border-b border-line py-4" : "border-b border-deck-line py-3.5 first:pt-1 last:border-b-0"}>
      <header className="flex items-baseline gap-2">
        <span
          className={`${plain ? "text-xs font-semibold" : "font-deckdisplay text-[10px] font-semibold uppercase tracking-[0.24em]"} ${
            isUser ? (plain ? "text-muted" : "text-deck-dim") : plain ? "text-accent" : "text-deck-amber"
          }`}
        >
          {isUser ? "You" : "Friday"}
        </span>
        <time className={plain ? "font-mono text-[10px] text-faint" : "font-deckmono text-[9px] text-deck-faint"}>
          {formatTime(new Date(message.timestamp))}
        </time>
      </header>

      {message.activity && message.activity.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {message.activity.map((a) => (
            <span
              key={a.id}
              className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-deckmono text-[9px] uppercase tracking-wider ${
                a.status === "error"
                  ? "border-deck-alert/40 text-deck-alert"
                  : a.status === "running"
                  ? "border-deck-line-bright text-deck-hot"
                  : "border-deck-line text-deck-dim"
              }`}
            >
              <span
                className={`h-1 w-1 rounded-full ${
                  a.status === "running"
                    ? "animate-pulse bg-deck-hot"
                    : a.status === "error"
                    ? "bg-deck-alert"
                    : "bg-deck-ok"
                }`}
              />
              {toolLabel(a.tool)}
              {a.detail && <span className="normal-case text-deck-faint">{a.detail}</span>}
            </span>
          ))}
        </div>
      )}

      <div
        className={`mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed ${
          plain ? (isUser ? "text-muted" : "text-ink") : isUser ? "text-deck-dim" : "text-deck-ink"
        }`}
      >
        {messageSegments(message.content || "").map((segment, index) => {
          if (segment.type === "link") {
            return (
              <a key={index} href={segment.href} target="_blank" rel="noreferrer" className="underline decoration-deck-line-bright underline-offset-2">
                {segment.label}
              </a>
            );
          }
          if (segment.type === "note") {
            return (
              <a key={index} href={obsidianOpenHref(segment.note)} className="mx-0.5 inline-flex rounded border border-deck-line px-1.5 py-0.5 font-deckmono text-[10px] uppercase tracking-wider text-deck-hot">
                {segment.label}
              </a>
            );
          }
          return <span key={index}>{segment.text}</span>;
        })}
        {message.isStreaming && (
          <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse bg-deck-amber align-middle" />
        )}
      </div>
    </article>
  );
}
