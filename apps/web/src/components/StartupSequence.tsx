"use client";

import { useState, useEffect } from "react";
import { getGreeting } from "@/lib/utils";

interface StartupSequenceProps {
  userName: string;
  onComplete: () => void;
}

export function StartupSequence({ userName, onComplete }: StartupSequenceProps) {
  const [phase, setPhase] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  const greeting = getGreeting();
  const fullGreeting = `${greeting}, Mr. ${userName}`;

  // Cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Startup sequence phases
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Phase 0: Initial boot (0-500ms)
    timers.push(setTimeout(() => setPhase(1), 500));

    // Phase 1: System init (500-1500ms)
    timers.push(setTimeout(() => setPhase(2), 1500));

    // Phase 2: Type greeting (1500-3500ms)
    timers.push(setTimeout(() => setPhase(3), 1500));

    return () => timers.forEach(clearTimeout);
  }, []);

  // Typing effect for greeting
  useEffect(() => {
    if (phase !== 3) return;

    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullGreeting.length) {
        setDisplayText(fullGreeting.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
        // Wait a moment then complete
        setTimeout(() => setPhase(4), 1500);
      }
    }, 60);

    return () => clearInterval(interval);
  }, [phase, fullGreeting]);

  // Fade out and complete
  useEffect(() => {
    if (phase === 4) {
      setTimeout(onComplete, 1000);
    }
  }, [phase, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center transition-opacity duration-1000 ${
        phase === 4 ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Animated background grid */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />

        {/* Horizontal scan lines */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="h-px bg-blue-400/50"
              style={{ marginTop: `${i * 20}px` }}
            />
          ))}
        </div>

        {/* Animated circles */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`absolute w-96 h-96 border border-blue-500/30 rounded-full transition-all duration-1000 ${
              phase >= 1 ? "scale-100 opacity-100" : "scale-0 opacity-0"
            }`}
          />
          <div
            className={`absolute w-[500px] h-[500px] border border-blue-400/20 rounded-full transition-all duration-1000 delay-200 ${
              phase >= 1 ? "scale-100 opacity-100" : "scale-0 opacity-0"
            }`}
          />
          <div
            className={`absolute w-[650px] h-[650px] border border-blue-300/10 rounded-full transition-all duration-1000 delay-300 ${
              phase >= 2 ? "scale-100 opacity-100" : "scale-0 opacity-0"
            }`}
          />
        </div>

        {/* Corner brackets */}
        <div className={`absolute top-8 left-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
          <div className="w-16 h-16 border-l-2 border-t-2 border-blue-500/50" />
        </div>
        <div className={`absolute top-8 right-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
          <div className="w-16 h-16 border-r-2 border-t-2 border-blue-500/50" />
        </div>
        <div className={`absolute bottom-8 left-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
          <div className="w-16 h-16 border-l-2 border-b-2 border-blue-500/50" />
        </div>
        <div className={`absolute bottom-8 right-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
          <div className="w-16 h-16 border-r-2 border-b-2 border-blue-500/50" />
        </div>
      </div>

      {/* Central content */}
      <div className="relative z-10 text-center">
        {/* JARVIS logo */}
        <div
          className={`mb-8 transition-all duration-700 ${
            phase >= 1 ? "opacity-100 scale-100" : "opacity-0 scale-90"
          }`}
        >
          <div className="relative inline-block">
            <div className="absolute -inset-1 bg-blue-500/20 blur-xl rounded-full" />
            <h1 className="relative text-6xl font-bold tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400">
              JARVIS
            </h1>
          </div>
        </div>

        {/* System status */}
        <div
          className={`mb-8 space-y-2 font-mono text-sm transition-all duration-500 ${
            phase >= 2 ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="text-blue-400/70">
            <span className="text-green-400">[OK]</span> Neural interface initialized
          </div>
          <div className="text-blue-400/70">
            <span className="text-green-400">[OK]</span> Voice recognition active
          </div>
          <div className="text-blue-400/70">
            <span className="text-green-400">[OK]</span> All systems operational
          </div>
        </div>

        {/* Greeting */}
        <div
          className={`transition-all duration-500 ${
            phase >= 3 ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="text-3xl font-light text-blue-100">
            {displayText}
            <span
              className={`inline-block w-0.5 h-8 bg-blue-400 ml-1 align-middle ${
                showCursor ? "opacity-100" : "opacity-0"
              }`}
            />
          </p>
          <p className="mt-4 text-blue-400/60 text-lg">
            What shall we accomplish today?
          </p>
        </div>
      </div>

      {/* Animated arc reactor glow */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
          phase >= 1 ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-4 h-4 bg-blue-400 rounded-full animate-pulse shadow-[0_0_60px_30px_rgba(59,130,246,0.3)]" />
        </div>
      </div>
    </div>
  );
}
