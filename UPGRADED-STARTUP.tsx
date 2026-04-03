// UPGRADED JARVIS STARTUP SEQUENCE
// Copy this to: apps/web/src/components/StartupSequence.tsx
//
// AUDIO FILES NEEDED (put in apps/web/public/sounds/):
// 1. shoot-to-thrill.mp3 - AC/DC song for the epic boot
// 2. hud-beep.mp3 - Optional HUD sound effect

"use client";

import { useState, useEffect, useRef } from "react";

interface StartupSequenceProps {
  userName: string;
  onComplete: () => void;
}

const diagnostics = [
  { system: "POWER", status: "Arc reactor initializing...", delay: 0 },
  { system: "POWER", status: "Core temperature: STABLE", delay: 180 },
  { system: "POWER", status: "Output: 3.2 gigajoules/sec", delay: 360 },
  { system: "NEURAL", status: "Loading neural pathways...", delay: 540 },
  { system: "NEURAL", status: "Cognitive matrix: ONLINE", delay: 720 },
  { system: "CRYPTO", status: "Encryption protocols: AES-512", delay: 900 },
  { system: "COMM", status: "Establishing quantum uplink...", delay: 1080 },
  { system: "COMM", status: "Satellite connection: SECURE", delay: 1260 },
  { system: "AI", status: "GPT-4 Neural Core: CONNECTED", delay: 1440 },
  { system: "VOICE", status: "Speech synthesis: CALIBRATED", delay: 1620 },
  { system: "VISION", status: "Optical systems: STANDBY", delay: 1800 },
  { system: "HOME", status: "Dancave systems: ONLINE", delay: 1980 },
  { system: "MEDIA", status: "Audio/Visual systems: READY", delay: 2160 },
  { system: "WINDOWS", status: "PC integration: ACTIVE", delay: 2340 },
  { system: "DEFENSE", status: "Security protocols: ARMED", delay: 2520 },
  { system: "JARVIS", status: "All systems operational", delay: 2700 },
];

export function StartupSequence({ userName, onComplete }: StartupSequenceProps) {
  const [phase, setPhase] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [visibleDiagnostics, setVisibleDiagnostics] = useState<number[]>([]);
  const [arcReactorPower, setArcReactorPower] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hexCodes, setHexCodes] = useState<string[]>([]);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // YOUR CUSTOM GREETING
  const fullGreeting = "Good morning boss, what are we working on in the Dancave today? Possibly more leads for Wavelength, or some other personal projects?";

  // Hex code generator for lab aesthetic
  useEffect(() => {
    const interval = setInterval(() => {
      setHexCodes(Array(8).fill(0).map(() => Math.random().toString(16).substring(2, 10).toUpperCase()));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setShowCursor((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase >= 1) {
      const interval = setInterval(() => {
        setArcReactorPower((prev) => {
          if (prev >= 100) { clearInterval(interval); return 100; }
          return prev + 1;
        });
      }, 30);
      return () => clearInterval(interval);
    }
  }, [phase]);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => setPhase(1), 800));
    timers.push(setTimeout(() => setPhase(2), 2000));
    timers.push(setTimeout(() => {
      setPhase(3);
      try {
        musicRef.current = new Audio("/sounds/shoot-to-thrill.mp3");
        musicRef.current.volume = 0.5;
        musicRef.current.play().catch(() => {});
      } catch (e) {}
    }, 5500));
    return () => {
      timers.forEach(clearTimeout);
      if (musicRef.current) musicRef.current.pause();
    };
  }, []);

  useEffect(() => {
    if (phase >= 2) {
      diagnostics.forEach((diag, index) => {
        setTimeout(() => setVisibleDiagnostics((prev) => [...prev, index]), diag.delay);
      });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 3) return;
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullGreeting.length) {
        setDisplayText(fullGreeting.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => setPhase(4), 3500);
      }
    }, 28);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === 4) {
      if (musicRef.current) {
        const fade = setInterval(() => {
          if (musicRef.current && musicRef.current.volume > 0.05) {
            musicRef.current.volume -= 0.02;
          } else {
            clearInterval(fade);
            if (musicRef.current) musicRef.current.pause();
          }
        }, 50);
      }
      setTimeout(onComplete, 1800);
    }
  }, [phase, onComplete]);

  return (
    <div className={`fixed inset-0 z-50 bg-black transition-opacity duration-1500 ${phase === 4 ? "opacity-0" : "opacity-100"}`}>
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-950/50 via-black to-black" />
        <div className="absolute inset-0 opacity-[0.015]" style={{backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.5) 2px, rgba(6,182,212,0.5) 4px)"}} />
        {phase >= 1 && <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: `linear-gradient(rgba(6,182,212,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.8) 1px, transparent 1px)`, backgroundSize: "60px 60px"}} />}
        {phase >= 1 && <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent animate-scan" />}
      </div>

      {/* Arc Reactor */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {phase >= 1 && (
          <>
            <div className="absolute w-[800px] h-[800px] rounded-full border border-cyan-500/5 animate-spin-slow" />
            <div className="absolute w-[650px] h-[650px] rounded-full border border-cyan-400/10 animate-spin-slow-reverse" />
            <div className="absolute w-[500px] h-[500px] rounded-full border-2 border-cyan-400/20 animate-spin-medium" />
            <div className="absolute w-[350px] h-[350px] rounded-full border border-cyan-300/30 animate-spin-medium-reverse" />
          </>
        )}
        <div className={`absolute transition-all duration-700 ${phase >= 1 ? "scale-100 opacity-100" : "scale-0 opacity-0"}`}>
          <div className="absolute -inset-48 rounded-full" style={{background: `radial-gradient(circle, rgba(6,182,212,${arcReactorPower / 180}) 0%, rgba(6,182,212,${arcReactorPower / 400}) 40%, transparent 70%)`}} />
          <div className="relative w-52 h-52">
            <div className="absolute inset-0 rounded-full border-4 border-cyan-400" style={{boxShadow: `0 0 ${arcReactorPower * 2}px ${arcReactorPower}px rgba(6,182,212,0.5), inset 0 0 ${arcReactorPower}px rgba(6,182,212,0.3)`}} />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              <defs><filter id="arcGlow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
                <path key={i} d="M50 50 L50 15 L56 22 Z" fill={arcReactorPower > i * 8 ? "rgba(6,182,212,0.9)" : "rgba(6,182,212,0.1)"} filter="url(#arcGlow)" transform={`rotate(${angle} 50 50)`} className="transition-all duration-200" />
              ))}
              <circle cx="50" cy="50" r="22" fill="none" stroke="rgba(6,182,212,0.5)" strokeWidth="2" />
              <circle cx="50" cy="50" r="16" fill={`rgba(6,182,212,${arcReactorPower / 100})`} filter="url(#arcGlow)" />
              <circle cx="50" cy="50" r="8" fill={`rgba(255,255,255,${arcReactorPower / 100})`} />
            </svg>
          </div>
        </div>
      </div>

      {/* HUD */}
      {phase >= 2 && (
        <>
          <div className="absolute top-8 left-8 font-mono animate-slideIn">
            <div className="border border-cyan-500/40 bg-black/80 backdrop-blur-md rounded-sm overflow-hidden">
              <div className="bg-cyan-500/10 px-4 py-2 border-b border-cyan-500/30">
                <span className="text-cyan-400 text-sm font-bold tracking-[0.2em]">SYSTEM STATUS</span>
              </div>
              <div className="p-4 space-y-2">
                {[{label:"CPU",value:12+Math.floor(arcReactorPower*0.1)},{label:"MEM",value:18+Math.floor(arcReactorPower*0.15)},{label:"GPU",value:8+Math.floor(arcReactorPower*0.08)},{label:"PWR",value:arcReactorPower}].map((stat,i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-cyan-300/60 w-8">{stat.label}</span>
                    <div className="w-32 h-2 bg-cyan-950 rounded-sm overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-sm transition-all duration-300" style={{width:`${stat.value}%`}} />
                    </div>
                    <span className="text-cyan-400 w-12 text-right">{stat.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute top-8 right-8 font-mono text-right animate-slideIn">
            <div className="border border-cyan-500/40 bg-black/80 backdrop-blur-md rounded-sm overflow-hidden">
              <div className="bg-cyan-500/10 px-4 py-2 border-b border-cyan-500/30">
                <span className="text-cyan-400 text-sm font-bold tracking-[0.2em]">DANCAVE</span>
              </div>
              <div className="p-4">
                <div className="text-cyan-400 text-5xl font-bold tracking-wider">{currentTime.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</div>
                <div className="text-cyan-500/50 text-xl mt-1">:{currentTime.toLocaleTimeString("en-US",{second:"2-digit"}).slice(-2)}</div>
                <div className="text-cyan-300/40 text-sm mt-3 pt-3 border-t border-cyan-500/20">{currentTime.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-8 left-8 font-mono text-[10px] text-cyan-500/30 animate-slideIn">
            {hexCodes.map((hex,i) => <div key={i} className="leading-tight">0x{hex}</div>)}
          </div>
          <div className="absolute top-6 left-6 w-32 h-32 border-l-2 border-t-2 border-cyan-500/40" />
          <div className="absolute top-6 right-6 w-32 h-32 border-r-2 border-t-2 border-cyan-500/40" />
          <div className="absolute bottom-6 left-6 w-32 h-32 border-l-2 border-b-2 border-cyan-500/40" />
          <div className="absolute bottom-6 right-6 w-32 h-32 border-r-2 border-b-2 border-cyan-500/40" />
        </>
      )}

      {/* Main */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8">
        <div className={`text-center mb-8 transition-all duration-1000 ${phase >= 1 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-12"}`}>
          <h1 className="text-[10rem] font-bold tracking-[0.5em] text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 via-cyan-400 to-cyan-600 drop-shadow-[0_0_80px_rgba(6,182,212,0.8)] leading-none">JARVIS</h1>
          <div className="text-cyan-400/25 text-sm tracking-[0.6em] mt-4">JUST A RATHER VERY INTELLIGENT SYSTEM</div>
        </div>

        <div className={`w-full max-w-4xl transition-all duration-700 ${phase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="bg-black/90 border border-cyan-500/40 rounded backdrop-blur-md overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-cyan-950/50 border-b border-cyan-500/30">
              <div className="flex gap-2"><div className="w-3 h-3 rounded-full bg-red-500/80" /><div className="w-3 h-3 rounded-full bg-yellow-500/80" /><div className="w-3 h-3 rounded-full bg-green-500/80" /></div>
              <span className="font-mono text-cyan-400/70 text-sm tracking-wider">JARVIS BOOT SEQUENCE v4.2.0</span>
              <span className="ml-auto font-mono text-cyan-500/40 text-xs">dancave://system/init</span>
            </div>
            <div className="p-6 font-mono text-sm h-72 overflow-hidden">
              {diagnostics.map((diag,index) => (
                <div key={index} className={`flex items-center gap-4 mb-1.5 transition-all duration-300 ${visibleDiagnostics.includes(index) ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"}`}>
                  <span className="text-cyan-600 w-24 text-right font-semibold">[{diag.system}]</span>
                  <span className="text-cyan-100/80 flex-1">{diag.status}</span>
                  {visibleDiagnostics.includes(index) && <span className={`w-3 h-3 rounded-full ${index === diagnostics.length - 1 ? "bg-green-400 animate-pulse" : "bg-cyan-400"}`} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`text-center mt-12 max-w-4xl transition-all duration-1000 ${phase >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <p className="text-2xl font-light text-cyan-50 leading-relaxed">
            <span className="text-cyan-400 text-4xl">&ldquo;</span>{displayText}
            <span className={`inline-block w-0.5 h-7 bg-cyan-400 ml-1 align-middle ${showCursor && phase === 3 ? "opacity-100" : "opacity-0"}`} />
            {displayText.length === fullGreeting.length && <span className="text-cyan-400 text-4xl">&rdquo;</span>}
          </p>
        </div>

        <div className={`absolute bottom-14 left-1/2 -translate-x-1/2 transition-all duration-500 ${phase >= 1 && phase < 4 ? "opacity-100" : "opacity-0"}`}>
          <div className="flex items-center gap-5 font-mono">
            <span className="text-cyan-400/50 text-sm tracking-[0.2em]">ARC REACTOR</span>
            <div className="w-56 h-3 bg-cyan-950 rounded-sm overflow-hidden border border-cyan-500/30">
              <div className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-cyan-300 rounded-sm transition-all" style={{width:`${arcReactorPower}%`,boxShadow:"0 0 20px rgba(6,182,212,0.8)"}} />
            </div>
            <span className="text-cyan-400 text-lg font-bold w-14">{arcReactorPower}%</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scan { 0% { top: 0%; } 100% { top: 100%; } }
        .animate-scan { animation: scan 3s linear infinite; }
        .animate-spin-slow { animation: spin 120s linear infinite; }
        .animate-spin-slow-reverse { animation: spin 100s linear infinite reverse; }
        .animate-spin-medium { animation: spin 60s linear infinite; }
        .animate-spin-medium-reverse { animation: spin 45s linear infinite reverse; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slideIn { animation: slideIn 0.6s ease-out forwards; }
      `}</style>
    </div>
  );
}
