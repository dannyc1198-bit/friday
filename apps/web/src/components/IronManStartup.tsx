"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { getRandomStartupTrack } from "@/config/music-playlist";
import { getPersonalizedGreeting, userConfig } from "@/config/user-config";
import {
  getStartupBriefing,
  StartupBriefing,
  CryptoPrice,
  StockPrice,
  WeatherData,
  TodoItem,
} from "@/services/startup-briefing";

// Lazy-load canvas/WebGL components (no SSR)
const CircuitAnimation = dynamic(() => import("./CircuitAnimation"), { ssr: false });
const ArcReactor3D = dynamic(() => import("./ArcReactor3D"), { ssr: false });

interface IronManStartupProps {
  onComplete: () => void;
  voicePackId?: string;
}

// Startup phase enum for readability
type StartupPhase =
  | "CIRCUIT_LINES"   // 0-1.5s
  | "ARC_REACTOR"     // 1.5-3.0s
  | "IDENTITY"        // 3.0-4.0s
  | "HUD_PANELS"      // 4.0-5.5s
  | "STATUS_FILL"     // 5.5-7.0s
  | "BRIEFING"        // 7.0-18.0s (existing panels)
  | "READY";          // 18.0s+ (fade out & transition)

// Boot sequence messages (shown during STATUS_FILL)
const bootMessages = [
  { text: "STARK INDUSTRIES", delay: 0, duration: 400 },
  { text: "INITIALIZING SYSTEM...", delay: 400, duration: 300 },
  { text: "LOADING CORE MODULES", delay: 700, duration: 200 },
  { text: "NEURAL INTERFACE: ONLINE", delay: 900, duration: 200 },
  { text: "VOICE RECOGNITION: ACTIVE", delay: 1100, duration: 200 },
  { text: "SECURITY PROTOCOLS: ENGAGED", delay: 1300, duration: 200 },
  { text: "ARC REACTOR: NOMINAL", delay: 1500, duration: 200 },
  { text: "ALL SYSTEMS OPERATIONAL", delay: 1700, duration: 300 },
];

// Crypto display component
function CryptoPanel({ crypto }: { crypto: CryptoPrice[] }) {
  return (
  <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-4 backdrop-blur-sm">
    <div className="text-blue-400 text-xs font-mono mb-2 flex items-center gap-2">
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
      CRYPTO
    </div>
    <div className="space-y-2">
      {crypto.map((c) => (
        <div key={c.symbol} className="flex justify-between items-center">
          <span className="text-blue-100 font-mono">{c.symbol}</span>
          <div className="text-right">
            <span className="text-blue-100 font-mono">${c.price.toFixed(4)}</span>
            <span
              className={`ml-2 text-xs font-mono ${
                c.changePercent >= 0 ? "text-green-400" : "text-blue-400"
              }`}
            >
              {c.changePercent >= 0 ? "+" : ""}
              {c.changePercent.toFixed(2)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);
}

// Stock display component
function StockPanel({ stocks }: { stocks: StockPrice[] }) {
  return (
  <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-4 backdrop-blur-sm">
    <div className="text-blue-400 text-xs font-mono mb-2 flex items-center gap-2">
      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      STOCKS
    </div>
    <div className="space-y-2">
      {stocks.map((s) => (
        <div key={s.symbol} className="flex justify-between items-center">
          <div>
            <span className="text-blue-100 font-mono">{s.symbol}</span>
            <span className="text-blue-500/50 text-xs ml-1">{s.name}</span>
          </div>
          <div className="text-right">
            <span className="text-blue-100 font-mono">${s.price.toFixed(2)}</span>
            <span
              className={`ml-2 text-xs font-mono ${
                s.changePercent >= 0 ? "text-green-400" : "text-blue-400"
              }`}
            >
              {s.changePercent >= 0 ? "+" : ""}
              {s.changePercent.toFixed(2)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);
}

// Weather display component
function WeatherPanel({ weather }: { weather: WeatherData | null }) {
  return (
  <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-4 backdrop-blur-sm">
    <div className="text-blue-400 text-xs font-mono mb-2 flex items-center gap-2">
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
      WEATHER
    </div>
    {weather ? (
      <div className="flex items-center gap-4">
        <span className="text-4xl">{weather.icon}</span>
        <div>
          <div className="text-2xl text-blue-100 font-light">{weather.temp}°F</div>
          <div className="text-blue-400/70 text-sm">{weather.condition}</div>
          <div className="text-blue-500/50 text-xs">
            Humidity: {weather.humidity}% | Wind: {weather.windSpeed} mph
          </div>
        </div>
      </div>
    ) : (
      <div className="text-blue-500/50 text-sm">Loading weather data...</div>
    )}
  </div>
);
}

// Email display component
function EmailPanel({ emails }: { emails: { unreadCount: number; importantCount: number } }) {
  return (
  <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-4 backdrop-blur-sm">
    <div className="text-blue-400 text-xs font-mono mb-2 flex items-center gap-2">
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
      INBOX STATUS
    </div>
    <div className="flex items-center gap-6">
      <div className="text-center">
        <div className="text-3xl text-blue-100 font-light">{emails.unreadCount}</div>
        <div className="text-blue-500/70 text-xs">Unread</div>
      </div>
      <div className="text-center">
        <div className="text-3xl text-yellow-400 font-light">{emails.importantCount}</div>
        <div className="text-blue-500/70 text-xs">Important</div>
      </div>
      {emails.unreadCount === 0 && (
        <div className="text-green-400 text-sm ml-4">Inbox clear</div>
      )}
    </div>
  </div>
);
}

// Todo display component
function TodoPanel({ todos }: { todos: TodoItem[] }) {
  return (
  <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-4 backdrop-blur-sm">
    <div className="text-blue-400 text-xs font-mono mb-2 flex items-center gap-2">
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
      TODAY&apos;S TASKS
    </div>
    {todos.length > 0 ? (
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {todos.slice(0, 5).map((todo) => (
          <div key={todo.id} className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                todo.priority === "high"
                  ? "bg-blue-400"
                  : todo.priority === "medium"
                  ? "bg-yellow-400"
                  : "bg-green-400"
              }`}
            />
            <span className="text-blue-100 text-sm">{todo.title}</span>
          </div>
        ))}
        {todos.length > 5 && (
          <div className="text-blue-500/50 text-xs">+{todos.length - 5} more tasks</div>
        )}
      </div>
    ) : (
      <div className="text-green-400 text-sm">No pending tasks</div>
    )}
  </div>
);}

export function IronManStartup({ onComplete, voicePackId = "JARVIS-classic" }: IronManStartupProps) {
  const [startupPhase, setStartupPhase] = useState<StartupPhase>("CIRCUIT_LINES");
  const [phase, setPhase] = useState(0); // numeric phase kept for existing render logic
  const [currentMessage, setCurrentMessage] = useState("");
  const [JARVISLetters, setJARVISLetters] = useState<string[]>([]);
  const [showArcReactor, setShowArcReactor] = useState(false);
  const [showHUD, setShowHUD] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [typedGreeting, setTypedGreeting] = useState("");
  const [hexCodes, setHexCodes] = useState<string[]>([]);
  const [circleProgress, setCircleProgress] = useState(0);
  const [briefing, setBriefing] = useState<StartupBriefing | null>(null);
  const [briefingPhase, setBriefingPhase] = useState(0); // 0: crypto, 1: weather, 2: emails, 3: todos
  const [showCircuit, setShowCircuit] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bootSoundRef = useRef<HTMLAudioElement | null>(null);

  const personalGreeting = getPersonalizedGreeting();
  const fullGreeting = `${personalGreeting}. Welcome to the ${userConfig.preferences.workspaceName}.`;

  // Generate random hex codes for HUD effect
  const generateHexCodes = useCallback(() => {
    const codes: string[] = [];
    for (let i = 0; i < 20; i++) {
      codes.push(Math.random().toString(16).substr(2, 8).toUpperCase());
    }
    return codes;
  }, []);

  // Fetch briefing data on mount — prefer backend (real data), fallback to frontend
  useEffect(() => {
    async function fetchBriefing() {
      try {
        const res = await fetch("/api/briefing/morning", { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          // Map backend format to StartupBriefing if needed
          if (data.sections) {
            // Backend returns MorningBriefingResult — use frontend service as base
            // but the backend data confirms orchestrator is alive
            const frontendBriefing = await getStartupBriefing();
            setBriefing(frontendBriefing);
            return;
          }
          setBriefing(data);
          return;
        }
      } catch {
        // Orchestrator not running — fall back to frontend service
      }
      // Fallback: use frontend service (may have placeholder data but won't crash)
      getStartupBriefing().then(setBriefing);
    }
    fetchBriefing();
  }, []);

  // ── Phase state machine ──────────────────────────────────────────
  //
  // CIRCUIT_LINES    0-1.5s     circuit animation from center
  // ARC_REACTOR      1.5-3.0s   arc reactor progress ring
  // IDENTITY         3.0-4.0s   J.A.R.V.I.S. text assembles
  // HUD_PANELS       4.0-5.5s   HUD panels slide in, boot messages
  // STATUS_FILL      5.5-7.0s   loading bars fill, greeting types
  // BRIEFING         7.0-18.0s  briefing panels (crypto, weather, etc.)
  // READY            18.0s+     fade out and transition to main UI

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Play boot sound
    bootSoundRef.current = new Audio("/sounds/JARVIS/startup.mp3");
    bootSoundRef.current.volume = 0.5;
    bootSoundRef.current.play().catch(() => {});

    // ── CIRCUIT_LINES: 0-1.5s ──
    // Circuit animation is shown immediately (showCircuit = true by default)

    // ── ARC_REACTOR: 1.5s ──
    timers.push(setTimeout(() => {
      setStartupPhase("ARC_REACTOR");
      setPhase(1);
      setShowArcReactor(true);
    }, 1500));

    // ── IDENTITY: 3.0s ──
    timers.push(setTimeout(() => {
      setStartupPhase("IDENTITY");
      setPhase(2);
      "J.A.R.V.I.S.".split("").forEach((letter, i) => {
        timers.push(setTimeout(() => {
          setJARVISLetters(prev => [...prev, letter]);
        }, i * 70)); // faster letter assembly to fit 1s window
      });
    }, 3000));

    // ── HUD_PANELS: 4.0s ──
    timers.push(setTimeout(() => {
      setStartupPhase("HUD_PANELS");
      setPhase(3);
      setShowHUD(true);
      setHexCodes(generateHexCodes());

      // Start music from playlist
      const track = getRandomStartupTrack();
      audioRef.current = new Audio(track.src);
      audioRef.current.volume = 0.3;
      audioRef.current.play().catch(() => {
        audioRef.current = new Audio("/sounds/shoot-to-thrill.mp3");
        audioRef.current.volume = 0.3;
        audioRef.current.play().catch(() => {});
      });

      bootMessages.forEach((msg) => {
        timers.push(setTimeout(() => {
          setCurrentMessage(msg.text);
        }, msg.delay));
      });
    }, 4000));

    // ── STATUS_FILL: 5.5s ──
    timers.push(setTimeout(() => {
      setStartupPhase("STATUS_FILL");
      setPhase(4);

      // Fill progress ring over 1.5s
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 4;
        setCircleProgress(Math.min(progress, 100));
        if (progress >= 100) clearInterval(progressInterval);
      }, 60);
      timers.push(progressInterval as unknown as NodeJS.Timeout);
    }, 5500));

    // Greeting starts typing at 6.0s
    timers.push(setTimeout(() => {
      setPhase(5);
    }, 6000));

    // ── BRIEFING: 7.0s ──
    timers.push(setTimeout(() => {
      setStartupPhase("BRIEFING");
      setPhase(6);
      setShowBriefing(true);

      // Animate through briefing panels
      timers.push(setTimeout(() => setBriefingPhase(1), 2000));
      timers.push(setTimeout(() => setBriefingPhase(2), 4000));
      timers.push(setTimeout(() => setBriefingPhase(3), 6000));
    }, 7000));

    // ── READY: 18.0s ──
    timers.push(setTimeout(() => {
      setStartupPhase("READY");
      setPhase(7);
      if (audioRef.current) {
        const fadeOut = setInterval(() => {
          if (audioRef.current && audioRef.current.volume > 0.05) {
            audioRef.current.volume -= 0.05;
          } else {
            clearInterval(fadeOut);
            if (audioRef.current) audioRef.current.pause();
          }
        }, 100);
      }
    }, 18000));

    // Complete (19.5s)
    timers.push(setTimeout(() => {
      onComplete();
    }, 19500));

    return () => {
      timers.forEach(clearTimeout);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (bootSoundRef.current) {
        bootSoundRef.current.pause();
        bootSoundRef.current = null;
      }
    };
  }, [generateHexCodes, onComplete]);

  // Typing effect for greeting
  useEffect(() => {
    if (phase !== 5) return;

    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullGreeting.length) {
        setTypedGreeting(fullGreeting.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [phase, fullGreeting]);

  // Continuously update hex codes
  useEffect(() => {
    if (!showHUD) return;

    const interval = setInterval(() => {
      setHexCodes(generateHexCodes());
    }, 200);

    return () => clearInterval(interval);
  }, [showHUD, generateHexCodes]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden transition-opacity duration-1000 ${
        phase === 7 ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Circuit lines animation — first phase, persists as background texture */}
      {showCircuit && <CircuitAnimation />}

      {/* Scanlines overlay */}
      <div className="absolute inset-0 pointer-events-none z-50 opacity-10">
        <div
          className="w-full h-full"
          style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
          }}
        />
      </div>

      {/* Arc Reactor — Three.js 3D (replaces SVG placeholder) */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ${
          showArcReactor ? "opacity-100 scale-100" : "opacity-0 scale-0"
        } ${showBriefing ? "scale-50 -translate-y-[200px]" : ""}`}
      >
        <div className="absolute -inset-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <ArcReactor3D size={400} className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2" />

        {/* Progress ring overlay during STATUS_FILL phase */}
        {circleProgress < 100 && phase >= 4 && (
          <svg width="400" height="400" className="absolute -top-[200px] -left-[200px] pointer-events-none">
            <circle
              cx="200"
              cy="200"
              r="195"
              fill="none"
              stroke="rgb(6, 182, 212)"
              strokeWidth="2"
              strokeDasharray={`${circleProgress * 12.25} 1225`}
              strokeLinecap="round"
              transform="rotate(-90 200 200)"
              className="transition-all duration-100"
            />
          </svg>
        )}
      </div>

      {/* J.A.R.V.I.S. title */}
      <div
        className={`absolute transition-all duration-500 ${
          phase >= 2 ? "opacity-100" : "opacity-0"
        } ${showBriefing ? "top-8 left-1/2 -translate-x-1/2" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-[-120px]"}`}
      >
        <h1 className={`font-bold tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-200 to-cyan-400 drop-shadow-[0_0_30px_rgba(6,182,212,0.8)] transition-all duration-500 ${showBriefing ? "text-3xl" : "text-6xl md:text-7xl"}`}>
          {JARVISLetters.join("")}
        </h1>
        {!showBriefing && (
          <div className="text-center mt-2 text-blue-500/60 text-sm tracking-[0.3em]">
            JUST A RATHER VERY INTELLIGENT SYSTEM
          </div>
        )}
      </div>

      {/* Boot messages */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-[60px] transition-all duration-500 ${
          phase >= 3 && !showBriefing ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="font-mono text-blue-400 text-lg tracking-wider animate-pulse">
          {currentMessage}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < Math.floor(circleProgress / 12.5) ? "bg-blue-400" : "bg-blue-900"
              }`}
            />
          ))}
        </div>
      </div>

      {/* HUD Elements - Left side */}
      <div
        className={`absolute left-8 top-1/4 font-mono text-xs space-y-1 transition-all duration-500 ${
          showHUD && !showBriefing ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
        }`}
      >
        {["PWR_CORE: 100%", "SYS_MEM: 847.2 TB", "CPU_LOAD: 2.4%", "NET_STAT: CONNECTED"].map((data, i) => (
          <div key={i} className="text-blue-500/70">
            <span className="text-blue-400">[</span>
            {data}
            <span className="text-blue-400">]</span>
          </div>
        ))}
      </div>

      {/* HUD Elements - Right side */}
      <div
        className={`absolute right-8 top-1/4 font-mono text-xs space-y-1 text-right transition-all duration-500 ${
          showHUD && !showBriefing ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"
        }`}
      >
        {["SEC_LVL: ALPHA", "TEMP: 72.4°F", "UPTIME: 00:00:01", "BANDWIDTH: 10 Gbps"].map((data, i) => (
          <div key={i} className="text-blue-500/70">
            <span className="text-blue-400">[</span>
            {data}
            <span className="text-blue-400">]</span>
          </div>
        ))}
      </div>

      {/* Hex code streams */}
      <div
        className={`absolute left-8 bottom-1/4 font-mono text-[10px] space-y-0.5 transition-all duration-500 ${
          showHUD && !showBriefing ? "opacity-60" : "opacity-0"
        }`}
      >
        {hexCodes.slice(0, 10).map((code, i) => (
          <div key={i} className="text-blue-600/50">
            0x{code}
          </div>
        ))}
      </div>

      <div
        className={`absolute right-8 bottom-1/4 font-mono text-[10px] space-y-0.5 text-right transition-all duration-500 ${
          showHUD && !showBriefing ? "opacity-60" : "opacity-0"
        }`}
      >
        {hexCodes.slice(10).map((code, i) => (
          <div key={i} className="text-blue-600/50">
            0x{code}
          </div>
        ))}
      </div>

      {/* Corner brackets */}
      <div className={`absolute top-8 left-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
        <div className="w-20 h-20 border-l-2 border-t-2 border-cyan-500/50" />
        <div className="absolute top-2 left-2 text-blue-500/50 text-xs font-mono">STARK IND.</div>
      </div>
      <div className={`absolute top-8 right-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
        <div className="w-20 h-20 border-r-2 border-t-2 border-cyan-500/50" />
        <div className="absolute top-2 right-2 text-blue-500/50 text-xs font-mono">v3.4.1</div>
      </div>
      <div className={`absolute bottom-8 left-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
        <div className="w-20 h-20 border-l-2 border-b-2 border-cyan-500/50" />
      </div>
      <div className={`absolute bottom-8 right-8 transition-all duration-500 ${phase >= 1 ? "opacity-100" : "opacity-0"}`}>
        <div className="w-20 h-20 border-r-2 border-b-2 border-cyan-500/50" />
        <div className="absolute bottom-2 right-2 text-blue-500/50 text-xs font-mono">DANCAVE</div>
      </div>

      {/* Greeting */}
      <div
        className={`absolute transition-all duration-500 ${
          phase >= 5 && !showBriefing ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        } bottom-32 left-1/2 -translate-x-1/2 max-w-2xl text-center`}
      >
        <p className="text-2xl md:text-3xl font-light text-blue-100 leading-relaxed">
          {typedGreeting}
          <span className="inline-block w-0.5 h-7 bg-blue-400 ml-1 align-middle animate-pulse" />
        </p>
      </div>

      {/* Briefing Panels */}
      {showBriefing && briefing && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-5xl px-8">
          <div className="grid grid-cols-3 gap-4">
            {/* Crypto Panel */}
            <div
              className={`transition-all duration-500 ${
                briefingPhase >= 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
            >
              <CryptoPanel crypto={briefing.crypto} />
            </div>

            {/* Stocks Panel */}
            <div
              className={`transition-all duration-500 ${
                briefingPhase >= 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
              <StockPanel stocks={briefing.stocks} />
            </div>

            {/* Weather Panel */}
            <div
              className={`transition-all duration-500 ${
                briefingPhase >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
            >
              <WeatherPanel weather={briefing.weather} />
            </div>

            {/* Email Panel */}
            <div
              className={`transition-all duration-500 ${
                briefingPhase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
            >
              <EmailPanel emails={briefing.emails} />
            </div>

            {/* Todo Panel - spans 2 columns */}
            <div
              className={`col-span-2 transition-all duration-500 ${
                briefingPhase >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
            >
              <TodoPanel todos={briefing.todos} />
            </div>
          </div>

          {/* Briefing Summary */}
          <div
            className={`mt-6 text-center transition-all duration-500 ${
              briefingPhase >= 3 ? "opacity-100" : "opacity-0"
            }`}
          >
            <p className="text-blue-100 text-lg font-light">{briefing.greeting}</p>
          </div>
        </div>
      )}

      {/* Status bar at bottom */}
      <div
        className={`absolute bottom-8 left-1/2 -translate-x-1/2 transition-all duration-500 ${
          phase >= 4 ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-4 font-mono text-xs text-blue-500/70">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            ONLINE
          </span>
          <span>|</span>
          <span>SECURE CONNECTION</span>
          <span>|</span>
          <span>{new Date().toLocaleDateString()}</span>
          <span>|</span>
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
