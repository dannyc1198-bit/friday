"use client";

import { useVoiceChat } from "@/hooks/useVoiceChat";

// ─── VoiceChatButton ────────────────────────────────────────
//
// Self-contained live voice chat UI:
//   - Floating mic button (toggles the session)
//   - Pulsing indicator + phase label when active
//   - Floating overlay showing live transcript + FRIDAY's response
//   - Inline error state with retry
//
// The hook owns all audio I/O, lifecycle, and rearm. This component is
// pure presentation + click-to-toggle. Place anywhere — it positions itself
// fixed in the bottom-right corner.

const PHASE_LABEL: Record<string, { text: string; tone: string }> = {
  idle:      { text: "Idle",         tone: "text-zinc-500" },
  listening: { text: "Listening...", tone: "text-cyan-300" },
  thinking:  { text: "Thinking...",  tone: "text-amber-300" },
  speaking:  { text: "Speaking...",  tone: "text-emerald-300" },
};

export function VoiceChatButton() {
  const vc = useVoiceChat();
  const label = PHASE_LABEL[vc.phase] ?? PHASE_LABEL.idle;

  // Pulse intensity follows phase — listening = soft cyan, speaking = green, etc.
  const ringColor =
    vc.phase === "listening" ? "ring-cyan-400/60" :
    vc.phase === "thinking"  ? "ring-amber-400/60" :
    vc.phase === "speaking"  ? "ring-emerald-400/60" :
                               "ring-zinc-700/40";

  const buttonBg =
    vc.isActive && vc.phase === "listening" ? "bg-cyan-500 text-black shadow-[0_0_25px_rgba(34,211,238,0.55)]" :
    vc.isActive && vc.phase === "thinking"  ? "bg-amber-400 text-black shadow-[0_0_22px_rgba(251,191,36,0.55)]" :
    vc.isActive && vc.phase === "speaking"  ? "bg-emerald-400 text-black shadow-[0_0_22px_rgba(52,211,153,0.55)]" :
                                              "bg-[#071422] border border-[rgba(0,180,255,0.15)] text-[#5a8aaa] hover:text-[#00dcff] hover:border-[#00b4ff]/40";

  return (
    <>
      {/* ── Overlay: live transcript + response ───────────── */}
      {vc.isActive && (
        <div className="fixed bottom-24 right-6 z-40 w-[min(420px,calc(100vw-3rem))] pointer-events-none">
          <div className="rounded-lg border border-[rgba(0,180,255,0.15)] bg-[#020a14]/95 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden">
            {/* Header strip */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,180,255,0.08)]">
              <span className={`w-1.5 h-1.5 rounded-full ${
                vc.phase === "listening" ? "bg-cyan-400 animate-pulse" :
                vc.phase === "thinking"  ? "bg-amber-400 animate-pulse" :
                vc.phase === "speaking"  ? "bg-emerald-400 animate-pulse" :
                                           "bg-zinc-600"
              }`} />
              <span className={`text-[9px] font-mono uppercase tracking-[0.25em] ${label.tone}`}>
                {label.text}
              </span>
              <span className="ml-auto text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-600">
                LIVE
              </span>
            </div>

            {/* Live transcript while user is speaking */}
            {vc.interimText && (
              <div className="px-3 py-2 border-b border-[rgba(0,180,255,0.06)]">
                <div className="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-600 mb-0.5">you</div>
                <p className="text-sm italic text-zinc-400 leading-snug">{vc.interimText}</p>
              </div>
            )}

            {/* Last finalized user turn */}
            {!vc.interimText && vc.userText && (
              <div className="px-3 py-2 border-b border-[rgba(0,180,255,0.06)]">
                <div className="text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-600 mb-0.5">you</div>
                <p className="text-sm text-zinc-300 leading-snug">{vc.userText}</p>
              </div>
            )}

            {/* FRIDAY's response (streams in) */}
            {vc.assistantText && (
              <div className="px-3 py-2">
                <div className="text-[8px] font-mono uppercase tracking-[0.25em] text-cyan-500/70 mb-0.5">friday</div>
                <p className="text-sm text-cyan-100 leading-snug whitespace-pre-wrap">{vc.assistantText}</p>
              </div>
            )}

            {/* Error state */}
            {vc.error && (
              <div className="px-3 py-2 border-t border-red-500/20 bg-red-500/5 flex items-start gap-2 pointer-events-auto">
                <div className="flex-1">
                  <div className="text-[8px] font-mono uppercase tracking-[0.25em] text-red-400/80 mb-0.5">error</div>
                  <p className="text-[11px] text-red-300/80 leading-snug">{vc.error}</p>
                </div>
                <button
                  onClick={vc.retry}
                  className="px-2 py-1 rounded text-[9px] font-mono uppercase tracking-[0.2em] text-red-300 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── The mic button itself ─────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Phase label (only when active and no overlay error to keep things clean) */}
        {vc.isActive && !vc.error && (
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#020a14]/80 backdrop-blur-sm border border-[rgba(0,180,255,0.1)]">
            <span className={`text-[9px] font-mono uppercase tracking-[0.25em] ${label.tone}`}>
              {label.text}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={vc.toggle}
          disabled={!vc.supported}
          title={
            !vc.supported
              ? "Web Speech API not supported in this browser"
              : vc.isActive
              ? "End live voice conversation"
              : "Start live voice conversation"
          }
          className={`relative p-4 rounded-full transition-all duration-300 ring-2 ${ringColor} ${buttonBg} ${
            vc.isActive && vc.phase === "listening" ? "animate-pulse" : ""
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {vc.isActive ? (
            // X / hangup icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            // Mic icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
