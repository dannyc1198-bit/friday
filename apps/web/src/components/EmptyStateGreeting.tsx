"use client";

// Empty-state greeting layer that wraps the hero NeuralOrb.
// Renders: ambient glow → greeting tagline → orb (children) → prompt chips.
// Only shown before the first message lands.

import { ReactNode } from "react";
import { getGreeting } from "@/lib/utils";
import { USER_NAME } from "@/lib/constants";

interface PromptSuggestion {
  /** Short label shown on the chip — keep it 1–3 words, uppercase-friendly. */
  label: string;
  /** Full natural-language prompt sent to FRIDAY when the chip is clicked. */
  prompt: string;
  /** Optional single glyph (emoji / one char) shown left of the label. */
  glyph?: string;
}

// Chips shown every time chat is empty — Danny's daily go-tos.
const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  { glyph: "☀",  label: "Morning brief",     prompt: "Run my morning briefing." },
  { glyph: "📈", label: "Crypto pulse",      prompt: "What's BTC and ETH doing right now?" },
  { glyph: "🛠",  label: "Wavelength",        prompt: "Wavelength Solutions status — clients, revenue, blockers." },
  { glyph: "💻", label: "Code agent",        prompt: "Spin up the code agent — what's open in the repo?" },
  { glyph: "📅", label: "Today's plate",     prompt: "What's on my plate today?" },
];

interface EmptyStateGreetingProps {
  /** Hero NeuralOrb is rendered between greeting and chips. */
  children: ReactNode;
  /** Fired when a chip is clicked — wire to your sendMessage handler. */
  onPromptSelect: (prompt: string) => void;
}

export function EmptyStateGreeting({ children, onPromptSelect }: EmptyStateGreetingProps) {
  const greeting = getGreeting();

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative z-10 -mt-8 px-4">
      {/* Ambient halo behind the orb — bleeds through everything */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] rounded-full bg-[#00b4ff]/[0.02] blur-[100px]" />
      </div>

      {/* Greeting — above the orb */}
      <div className="text-center mb-6 relative z-10">
        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#5a8aaa]/55">
          {greeting}, {USER_NAME}
        </p>
        <p className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.25em] text-[#1e3a50]">
          // wavelength solutions online
        </p>
      </div>

      {/* Hero orb slot */}
      {children}

      {/* Prompt chips — below the orb */}
      {PROMPT_SUGGESTIONS.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-2xl relative z-10">
          {PROMPT_SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => onPromptSelect(s.prompt)}
              className="group flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#00b4ff]/[0.04] border border-[#00b4ff]/10 text-[10px] font-mono uppercase tracking-[0.18em] text-[#5a8aaa] hover:text-[#00dcff] hover:bg-[#00b4ff]/10 hover:border-[#00b4ff]/30 hover:shadow-[0_0_16px_rgba(0,180,255,0.15)] transition-all duration-300"
            >
              {s.glyph && (
                <span className="text-[#00b4ff]/60 group-hover:text-[#00dcff] transition-colors">
                  {s.glyph}
                </span>
              )}
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
