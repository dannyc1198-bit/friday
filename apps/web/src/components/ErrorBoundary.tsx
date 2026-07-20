"use client";

// Per-region error boundary — a crashing panel degrades to a labeled fault
// readout instead of white-screening the whole command window.

import { Component, ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error(`[ErrorBoundary:${this.props.label}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="hud-window p-4 m-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff5252] status-dot-glow" style={{ color: "#ff5252" }} />
            <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-[#ff5252]/80">
              {this.props.label} fault
            </span>
          </div>
          <p className="mt-2 font-mono text-[9px] text-[#5a8aaa] leading-relaxed break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 px-3 py-1.5 rounded-sm border border-[#00b4ff]/20 font-mono text-[8px] tracking-[0.25em] uppercase text-[#5a8aaa] hover:text-[#00dcff] hover:border-[#00b4ff]/40 transition-all"
          >
            Reinitialize
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
