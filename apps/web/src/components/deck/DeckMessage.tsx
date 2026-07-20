"use client";

import { Message } from "@/types";
import { formatTime } from "@/lib/utils";
import { toolLabel } from "./deck-lib";

// Transcript entries, not chat bubbles. A flight deck keeps a log:
// speaker tag, timestamp, cognition chips, then the words.

export function DeckMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <article className="border-b border-deck-line py-3.5 first:pt-1 last:border-b-0">
      <header className="flex items-baseline gap-2">
        <span
          className={`font-deckdisplay text-[10px] font-semibold uppercase tracking-[0.24em] ${
            isUser ? "text-deck-dim" : "text-deck-amber"
          }`}
        >
          {isUser ? "You" : "Friday"}
        </span>
        <time className="font-deckmono text-[9px] text-deck-faint">
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
          isUser ? "text-deck-dim" : "text-deck-ink"
        }`}
      >
        {message.content}
        {message.isStreaming && (
          <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse bg-deck-amber align-middle" />
        )}
      </div>
    </article>
  );
}
