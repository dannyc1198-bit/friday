"use client";

// Dynamic full-screen HUD panel route.
// /hud/system-vitals → SystemPanel rendered full-screen.
// Drag the tab to another monitor and you have a dedicated dashboard.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AgentPanel,
  AlertsPanel,
  BusinessPanel,
  ComputePanel,
  CryptoPanel,
  NetworkPanel,
  SystemPanel,
} from "@/components/hud";

interface PanelMeta {
  title: string;
  Component: React.ComponentType;
}

const PANEL_REGISTRY: Record<string, PanelMeta> = {
  "system-vitals":  { title: "System Vitals",  Component: SystemPanel },
  "ai-compute":     { title: "AI Compute",     Component: ComputePanel },
  "agent-roster":   { title: "Agent Roster",   Component: AgentPanel },
  "activity-feed":  { title: "Activity Feed",  Component: AlertsPanel },
  "network":        { title: "Network",        Component: NetworkPanel },
  "market-feed":    { title: "Market Feed",    Component: CryptoPanel },
  "revenue-intel":  { title: "Revenue Intel",  Component: BusinessPanel },
};

export default function HudPanelPage({ params }: { params: { slug: string } }) {
  const meta = PANEL_REGISTRY[params.slug];
  if (!meta) notFound();

  const { title, Component } = meta;

  return (
    <div className="min-h-screen bg-[#020a14] text-[#e0f0ff] flex flex-col">
      <header className="border-b border-[rgba(0,180,255,0.08)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#5a8aaa] hover:text-[#00dcff] transition-colors"
            aria-label="Back to main FRIDAY console"
          >
            ← back
          </Link>
          <div className="h-4 w-px bg-[rgba(0,180,255,0.15)]" />
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-2 h-2 rounded-full bg-[#00dcff] shadow-[0_0_8px_#00dcff]" />
            <h1 className="text-xs font-display font-semibold uppercase tracking-[0.3em] text-[#e0f0ff] group-hover:text-[#00dcff] transition-colors">
              F.R.I.D.A.Y. — {title}
            </h1>
          </Link>
        </div>
        <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#5a8aaa]">
          dedicated view · drag tab to another monitor
        </div>
      </header>

      {/* Panel rendered at natural size, centered, capped at a comfortable reading width.
          Scrolls vertically if the panel is taller than the viewport. */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="mx-auto max-w-[1100px] [&_.hud-window]:!w-full [&_.hud-window]:!max-w-none">
          <Component />
        </div>
      </main>

      <footer className="border-t border-[rgba(0,180,255,0.05)] px-6 py-2 text-[9px] font-mono uppercase tracking-[0.2em] text-[#5a8aaa] flex justify-between">
        <span>{params.slug}</span>
        <span>F.R.I.D.A.Y. v2.0 · {new Date().toLocaleTimeString()}</span>
      </footer>
    </div>
  );
}
