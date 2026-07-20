"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── TYPES ──────────────────────────────────────────────────────────
interface DramaticStartupProps {
  onComplete: () => void;
}

type Phase =
  | "BLACKOUT"       // 0-2s:  Black screen, audio, cyan trace line
  | "BOOT_TEXT"      // 2-4s:  Terminal typing sequence
  | "HUD_ASSEMBLY"   // 4-6s:  Corner brackets, scan line, grid
  | "ORB_POWERUP"    // 6-8s:  Particle coalescence into sphere
  | "DATA_WINDOWS"   // 8-10s: HUD panels slide in
  | "FRIDAY_SPEAKS"  // 10-12s: Identity text reveal
  | "TRANSITION";    // 12s+:  Fade to main UI

// ─── BOOT SEQUENCE LINES ────────────────────────────────────────────
const BOOT_LINES: BootLine[] = [
  { text: "> INITIALIZING F.R.I.D.A.Y. NEURAL CORE..." },
  { text: "> LOADING ANTHROPIC CLAUDE INTERFACE... OK", suffix: "OK", suffixColor: "green" },
  { text: "> MOUNTING 152 TOOLS ACROSS 22 MODULES... OK", suffix: "OK", suffixColor: "green" },
  { text: "> ENCRYPTING VAULT (AES-256-GCM)... OK", suffix: "OK", suffixColor: "green" },
  { text: "> PROACTIVE MONITOR... ONLINE", suffix: "ONLINE", suffixColor: "green" },
  { text: "> VOICE I/O... STANDING BY", suffix: "STANDING BY", suffixColor: "amber" },
  { text: "> ALL SYSTEMS NOMINAL" },
];

interface BootLine {
  text: string;
  suffix?: string;
  suffixColor?: "green" | "amber";
}

// ─── HUD DATA PANELS ────────────────────────────────────────────────
const LEFT_PANELS = [
  { label: "NEURAL CORE", value: "ACTIVE", green: true },
  { label: "TOOL REGISTRY", value: "152 LOADED", green: true },
  { label: "MEMORY BANK", value: "847.2 TB", green: true },
  { label: "VAULT STATUS", value: "ENCRYPTED", green: true },
];

const RIGHT_PANELS = [
  { label: "THREAT LEVEL", value: "MINIMAL", green: true },
  { label: "NET UPLINK", value: "10 Gbps", green: true },
  { label: "CPU LOAD", value: "2.4%", green: true },
  { label: "POWER CORE", value: "ARC REACTOR", green: false },
];

const TOP_PANELS = [
  { label: "SEC PROTOCOL", value: "ALPHA-7" },
  { label: "ENCRYPTION", value: "AES-256-GCM" },
  { label: "AI MODEL", value: "CLAUDE OPUS" },
];

// ─── PARTICLE SYSTEM ────────────────────────────────────────────────
interface Particle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  size: number;
  delay: number;
  duration: number;
}

function generateParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 150 + Math.random() * 200;
    particles.push({
      id: i,
      startX: Math.cos(angle) * radius,
      startY: Math.sin(angle) * radius,
      endX: (Math.random() - 0.5) * 20,
      endY: (Math.random() - 0.5) * 20,
      size: 1 + Math.random() * 3,
      delay: Math.random() * 1.2,
      duration: 0.8 + Math.random() * 1.2,
    });
  }
  return particles;
}

// ─── TYPING LINE COMPONENT ──────────────────────────────────────────
function TypingLine({
  line,
  onComplete,
}: {
  line: BootLine;
  onComplete: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState(true);
  const completedRef = useRef(false);

  useEffect(() => {
    const flashTimer = setTimeout(() => setFlash(false), 80);

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx <= line.text.length) {
        setDisplayed(line.text.slice(0, idx));
      } else {
        clearInterval(interval);
        setDone(true);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      }
    }, 50);

    return () => {
      clearInterval(interval);
      clearTimeout(flashTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasSuffix = line.suffix && done;
  const mainText = hasSuffix
    ? displayed.slice(0, displayed.length - line.suffix!.length)
    : displayed;
  const suffixText = hasSuffix ? line.suffix : "";

  const suffixColorClass =
    line.suffixColor === "green"
      ? "text-green-400 drop-shadow-[0_0_6px_rgba(74,222,128,0.6)]"
      : line.suffixColor === "amber"
      ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : "text-cyan-400";

  return (
    <div className={`transition-all duration-75 ${flash ? "bg-cyan-500/10" : ""}`}>
      <span className="text-cyan-400">{hasSuffix ? mainText : displayed}</span>
      {hasSuffix && <span className={suffixColorClass}>{suffixText}</span>}
      {!done && (
        <span className="inline-block w-2 h-4 bg-cyan-400 ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
}

// ─── ORB COMPONENT ──────────────────────────────────────────────────
function NeuralOrb({ active }: { active: boolean }) {
  const particles = useMemo(() => generateParticles(80), []);

  return (
    <div className="relative w-64 h-64">
      {/* Outer glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,162,255,0.3) 0%, transparent 70%)",
        }}
        animate={
          active
            ? { scale: [1, 1.3, 1], opacity: [0.3, 0.8, 0.3] }
            : { scale: 0, opacity: 0 }
        }
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Core sphere */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 80,
          height: 80,
          background:
            "radial-gradient(circle at 35% 35%, #4FC3F7, #00A2FF 40%, #1565C0 80%, #0D47A1)",
          boxShadow: active
            ? "0 0 60px rgba(0,162,255,0.8), 0 0 120px rgba(0,212,255,0.4), inset 0 0 30px rgba(79,195,247,0.5)"
            : "none",
        }}
        animate={
          active
            ? { scale: [0, 0.5, 1], opacity: [0, 0.5, 1] }
            : { scale: 0, opacity: 0 }
        }
        transition={{ duration: 1.5, ease: "easeOut" }}
      />

      {/* Bloom layer */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 120,
          height: 120,
          background:
            "radial-gradient(circle, rgba(0,212,255,0.4) 0%, rgba(0,162,255,0.1) 50%, transparent 70%)",
        }}
        animate={
          active
            ? { scale: [0, 1.2, 1], opacity: [0, 1, 0.7] }
            : { scale: 0, opacity: 0 }
        }
        transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
      />

      {/* Particles coalescing */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute top-1/2 left-1/2 rounded-full bg-cyan-400"
          style={{ width: p.size, height: p.size }}
          initial={{ x: p.startX, y: p.startY, opacity: 0 }}
          animate={
            active
              ? { x: p.endX, y: p.endY, opacity: [0, 1, 0.8] }
              : { opacity: 0, x: p.startX, y: p.startY }
          }
          transition={{ duration: p.duration, delay: p.delay, ease: "easeInOut" }}
        />
      ))}

      {/* Orbital ring 1 — horizontal */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-500/40"
        style={{ width: 140, height: 140 }}
        animate={
          active
            ? { rotate: 360, scale: [0, 1], opacity: [0, 0.6] }
            : { scale: 0, opacity: 0 }
        }
        transition={{
          rotate: { duration: 8, repeat: Infinity, ease: "linear" },
          scale: { duration: 1, delay: 0.8 },
          opacity: { duration: 1, delay: 0.8 },
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
      </motion.div>

      {/* Orbital ring 2 — tilted */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/30"
        style={{ width: 180, height: 180, transform: "rotateX(60deg)" }}
        animate={
          active
            ? { rotate: -360, scale: [0, 1], opacity: [0, 0.4] }
            : { scale: 0, opacity: 0 }
        }
        transition={{
          rotate: { duration: 12, repeat: Infinity, ease: "linear" },
          scale: { duration: 1.2, delay: 1.2 },
          opacity: { duration: 1.2, delay: 1.2 },
        }}
      >
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(0,162,255,0.8)]" />
      </motion.div>

      {/* Orbital ring 3 — perpendicular */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/20"
        style={{ width: 220, height: 220, transform: "rotateY(60deg)" }}
        animate={
          active
            ? { rotate: 360, scale: [0, 1], opacity: [0, 0.3] }
            : { scale: 0, opacity: 0 }
        }
        transition={{
          rotate: { duration: 15, repeat: Infinity, ease: "linear" },
          scale: { duration: 1.4, delay: 1.5 },
          opacity: { duration: 1.4, delay: 1.5 },
        }}
      >
        <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-cyan-300 shadow-[0_0_4px_rgba(0,212,255,0.6)]" />
      </motion.div>
    </div>
  );
}

// ─── HUD PANEL COMPONENT ────────────────────────────────────────────
function HudPanel({
  label,
  value,
  green,
  index,
  from,
  textAlign,
}: {
  label: string;
  value: string;
  green?: boolean;
  index: number;
  from: "left" | "right" | "top";
  textAlign?: "left" | "right" | "center";
}) {
  const initial =
    from === "left"
      ? { x: -300, opacity: 0 }
      : from === "right"
      ? { x: 300, opacity: 0 }
      : { y: -200, opacity: 0 };

  const animate =
    from === "left" || from === "right"
      ? { x: 0, opacity: 1 }
      : { y: 0, opacity: 1 };

  return (
    <motion.div
      className={`relative bg-black/70 border border-cyan-500/30 backdrop-blur-sm px-4 py-2 font-mono text-xs tracking-widest uppercase overflow-hidden ${
        textAlign === "right" ? "text-right" : textAlign === "center" ? "text-center" : "text-left"
      }`}
      initial={initial}
      animate={animate}
      transition={{
        type: "spring",
        stiffness: 120,
        damping: 15,
        delay: index * 0.12,
      }}
    >
      {/* Cyan flash on entry */}
      <motion.div
        className="absolute inset-0 bg-cyan-400/20"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.5, delay: index * 0.12 }}
      />
      <div className="text-cyan-500/60 text-[10px]">{label}</div>
      <div className={green ? "text-green-400" : "text-cyan-400"}>{value}</div>
    </motion.div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────
export function DramaticStartup({ onComplete }: DramaticStartupProps) {
  const [phase, setPhase] = useState<Phase>("BLACKOUT");
  const [bootLineIndex, setBootLineIndex] = useState(0);
  const [scanLineY, setScanLineY] = useState(-10);
  const [showGrid, setShowGrid] = useState(false);
  const [hexFlash, setHexFlash] = useState(false);
  const [fridayText, setFridayText] = useState("");
  const [subtitleText, setSubtitleText] = useState("");
  const [greetingText, setGreetingText] = useState("");
  const [fadingOut, setFadingOut] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Phase ordering for comparisons
  const PHASE_ORDER: Phase[] = [
    "BLACKOUT",
    "BOOT_TEXT",
    "HUD_ASSEMBLY",
    "ORB_POWERUP",
    "DATA_WINDOWS",
    "FRIDAY_SPEAKS",
    "TRANSITION",
  ];

  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const isAtLeast = useCallback(
    (p: Phase) => phaseIndex >= PHASE_ORDER.indexOf(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phaseIndex]
  );

  // ── Phase state machine ──
  useEffect(() => {
    const timers = timersRef.current;

    // Wire audio (will fail silently if file not present yet)
    try {
      audioRef.current = new Audio("/sounds/startup.mp3");
      audioRef.current.volume = 0.6;
      audioRef.current.play().catch(() => {});
    } catch {
      // Audio not available
    }

    // Phase 2: BOOT_TEXT at 2s
    timers.push(setTimeout(() => setPhase("BOOT_TEXT"), 2000));

    // Phase 3: HUD_ASSEMBLY at 4s
    timers.push(
      setTimeout(() => {
        setPhase("HUD_ASSEMBLY");
        // Scan line sweeps top to bottom
        let y = -10;
        const scanInterval = setInterval(() => {
          y += 2;
          setScanLineY(y);
          if (y > 110) clearInterval(scanInterval);
        }, 20);
        // Grid fade in
        timers.push(setTimeout(() => setShowGrid(true), 400));
        // Hex pattern flash
        timers.push(
          setTimeout(() => {
            setHexFlash(true);
            timers.push(setTimeout(() => setHexFlash(false), 300));
          }, 800)
        );
      }, 4000)
    );

    // Phase 4: ORB_POWERUP at 6s
    timers.push(setTimeout(() => setPhase("ORB_POWERUP"), 6000));

    // Phase 5: DATA_WINDOWS at 8s
    timers.push(setTimeout(() => setPhase("DATA_WINDOWS"), 8000));

    // Phase 6: FRIDAY_SPEAKS at 10s
    timers.push(setTimeout(() => setPhase("FRIDAY_SPEAKS"), 10000));

    // Phase 7: TRANSITION at 12s
    timers.push(
      setTimeout(() => {
        setPhase("TRANSITION");
        setFadingOut(true);
        // Fade out audio
        if (audioRef.current) {
          const fadeOut = setInterval(() => {
            if (audioRef.current && audioRef.current.volume > 0.05) {
              audioRef.current.volume = Math.max(0, audioRef.current.volume - 0.05);
            } else {
              clearInterval(fadeOut);
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
              }
            }
          }, 80);
        }
      }, 12000)
    );

    // Complete callback at 13.5s (after 1.5s fade)
    timers.push(
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        onComplete();
      }, 13500)
    );

    return () => {
      timers.forEach(clearTimeout);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [onComplete]);

  // ── FRIDAY text typing effect ──
  useEffect(() => {
    if (phase !== "FRIDAY_SPEAKS") return;

    const fridayFull = "F.R.I.D.A.Y. ONLINE";
    const subtitleFull = "Female Replacement Intelligent Digital Assistant Youth";
    const greetingFull = "Hello Danny. All systems operational.";
    const intervals: ReturnType<typeof setInterval>[] = [];

    let idx = 0;
    const t1 = setInterval(() => {
      idx++;
      if (idx <= fridayFull.length) {
        setFridayText(fridayFull.slice(0, idx));
      } else {
        clearInterval(t1);
        // Start subtitle after main title
        let si = 0;
        const t2 = setInterval(() => {
          si++;
          if (si <= subtitleFull.length) {
            setSubtitleText(subtitleFull.slice(0, si));
          } else {
            clearInterval(t2);
            // Start greeting after subtitle
            let gi = 0;
            const t3 = setInterval(() => {
              gi++;
              if (gi <= greetingFull.length) {
                setGreetingText(greetingFull.slice(0, gi));
              } else {
                clearInterval(t3);
              }
            }, 30);
            intervals.push(t3);
          }
        }, 25);
        intervals.push(t2);
      }
    }, 60);
    intervals.push(t1);

    return () => intervals.forEach(clearInterval);
  }, [phase]);

  // Boot line completion — advance to next line
  const handleBootLineComplete = useCallback(() => {
    setBootLineIndex((prev) => prev + 1);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-black overflow-hidden select-none"
      animate={{ opacity: fadingOut ? 0 : 1 }}
      transition={{ duration: 1.5 }}
      style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace" }}
    >
      {/* ═══════════════════════════════════════════════════════════════
          PHASE 1: BLACKOUT — CYAN TRACE LINE (0-2s)
          ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {phase === "BLACKOUT" && (
          <motion.div
            className="absolute top-1/2 left-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, #00D4FF 20%, #00A2FF 50%, #00D4FF 80%, transparent 100%)",
              boxShadow:
                "0 0 20px rgba(0,212,255,0.6), 0 0 60px rgba(0,162,255,0.3), 0 0 100px rgba(0,162,255,0.15)",
            }}
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          />
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          PHASE 2: SYSTEM BOOT TEXT (2-4s)
          ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {(phase === "BOOT_TEXT" || phase === "HUD_ASSEMBLY") && (
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl px-8 font-mono text-sm tracking-widest uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "BOOT_TEXT" ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="space-y-1">
              {BOOT_LINES.map((line, i) => {
                if (i > bootLineIndex) return null;
                return (
                  <TypingLine
                    key={i}
                    line={line}
                    onComplete={handleBootLineComplete}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          PHASE 3: HUD ASSEMBLY (4-6s)
          ═══════════════════════════════════════════════════════════ */}

      {/* Scan line — sweeps top to bottom */}
      {isAtLeast("HUD_ASSEMBLY") && scanLineY <= 110 && (
        <div
          className="absolute left-0 w-full h-[2px] pointer-events-none z-30"
          style={{
            top: `${scanLineY}%`,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.5) 15%, rgba(0,162,255,0.8) 50%, rgba(0,212,255,0.5) 85%, transparent 100%)",
            boxShadow: "0 0 40px rgba(0,212,255,0.3), 0 -2px 8px rgba(0,212,255,0.15)",
          }}
        />
      )}

      {/* Grid lines background */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-0"
        animate={{ opacity: showGrid ? 0.07 : 0 }}
        transition={{ duration: 2 }}
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,162,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,162,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Hexagonal pattern flash */}
      <AnimatePresence>
        {hexFlash && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            exit={{ opacity: 0 }}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%2300A2FF' stroke-width='0.5'/%3E%3Cpath d='M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='%2300D4FF' stroke-width='0.5'/%3E%3C/svg%3E")`,
              backgroundSize: "56px 100px",
            }}
          />
        )}
      </AnimatePresence>

      {/* Corner brackets — animate in from edges */}
      {isAtLeast("HUD_ASSEMBLY") && (
        <>
          {/* Top-left */}
          <motion.div
            className="absolute top-6 left-6 z-30"
            initial={{ x: -120, y: -120, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="w-20 h-20 border-l-2 border-t-2 border-cyan-500/60" />
            <div className="absolute top-3 left-3 text-cyan-500/50 text-[10px] font-mono tracking-[0.2em] uppercase">
              STARK IND.
            </div>
          </motion.div>

          {/* Top-right */}
          <motion.div
            className="absolute top-6 right-6 z-30"
            initial={{ x: 120, y: -120, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 }}
          >
            <div className="w-20 h-20 border-r-2 border-t-2 border-cyan-500/60" />
            <div className="absolute top-3 right-3 text-cyan-500/50 text-[10px] font-mono tracking-[0.2em] uppercase">
              F.R.I.D.A.Y.
            </div>
          </motion.div>

          {/* Bottom-left */}
          <motion.div
            className="absolute bottom-6 left-6 z-30"
            initial={{ x: -120, y: 120, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1], delay: 0.2 }}
          >
            <div className="w-20 h-20 border-l-2 border-b-2 border-cyan-500/60" />
            <div className="absolute bottom-3 left-3 text-cyan-500/50 text-[10px] font-mono tracking-[0.2em] uppercase">
              SECURE
            </div>
          </motion.div>

          {/* Bottom-right */}
          <motion.div
            className="absolute bottom-6 right-6 z-30"
            initial={{ x: 120, y: 120, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1], delay: 0.3 }}
          >
            <div className="w-20 h-20 border-r-2 border-b-2 border-cyan-500/60" />
            <div className="absolute bottom-3 right-3 text-cyan-500/50 text-[10px] font-mono tracking-[0.2em] uppercase">
              DANCAVE
            </div>
          </motion.div>
        </>
      )}

      {/* CRT scanlines overlay — persists from phase 3 onward */}
      {isAtLeast("HUD_ASSEMBLY") && (
        <div
          className="absolute inset-0 pointer-events-none z-40 opacity-[0.04]"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px)",
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PHASE 4: ORB POWER-UP (6-8s)
          ═══════════════════════════════════════════════════════════ */}
      {isAtLeast("ORB_POWERUP") && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <NeuralOrb active={true} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PHASE 5: DATA WINDOWS (8-10s)
          ═══════════════════════════════════════════════════════════ */}
      {isAtLeast("DATA_WINDOWS") && (
        <>
          {/* Left panels — slide from left */}
          <div className="absolute left-6 top-32 z-20 space-y-2 w-48">
            {LEFT_PANELS.map((panel, i) => (
              <HudPanel
                key={panel.label}
                label={panel.label}
                value={panel.value}
                green={panel.green}
                index={i}
                from="left"
                textAlign="left"
              />
            ))}
          </div>

          {/* Right panels — slide from right */}
          <div className="absolute right-6 top-32 z-20 space-y-2 w-48">
            {RIGHT_PANELS.map((panel, i) => (
              <HudPanel
                key={panel.label}
                label={panel.label}
                value={panel.value}
                green={panel.green}
                index={i}
                from="right"
                textAlign="right"
              />
            ))}
          </div>

          {/* Top panels — drop from top */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex gap-4">
            {TOP_PANELS.map((panel, i) => (
              <HudPanel
                key={panel.label}
                label={panel.label}
                value={panel.value}
                index={i}
                from="top"
                textAlign="center"
              />
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PHASE 6: FRIDAY SPEAKS (10-12s)
          ═══════════════════════════════════════════════════════════ */}
      {isAtLeast("FRIDAY_SPEAKS") && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 text-center max-w-3xl w-full px-8">
          {/* Main title: F.R.I.D.A.Y. ONLINE */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <h1
              className="text-4xl md:text-5xl font-bold font-mono tracking-[0.5em] uppercase"
              style={{
                color: "#00D4FF",
                textShadow:
                  "0 0 20px rgba(0,212,255,0.8), 0 0 40px rgba(0,162,255,0.4), 0 0 80px rgba(0,162,255,0.2)",
              }}
            >
              {fridayText}
              {fridayText.length < 19 && (
                <span className="inline-block w-[3px] h-10 bg-cyan-400 ml-1 animate-pulse align-middle" />
              )}
            </h1>
          </motion.div>

          {/* Subtitle */}
          {subtitleText && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.5, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-3 text-cyan-500/50 text-xs font-mono tracking-[0.3em] uppercase"
            >
              {subtitleText}
            </motion.p>
          )}

          {/* Greeting */}
          {greetingText && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-6 text-xl md:text-2xl font-light tracking-wider"
              style={{
                color: "#E3F2FD",
                textShadow: "0 0 20px rgba(0,162,255,0.4)",
              }}
            >
              &ldquo;{greetingText}&rdquo;
            </motion.p>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STATUS BAR (bottom — appears with HUD assembly)
          ═══════════════════════════════════════════════════════════ */}
      {isAtLeast("HUD_ASSEMBLY") && (
        <motion.div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 font-mono text-[10px] tracking-[0.2em] uppercase text-cyan-500/40 flex items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(74,222,128,0.6)]" />
            ONLINE
          </span>
          <span className="text-cyan-500/20">|</span>
          <span>SECURE CONNECTION</span>
          <span className="text-cyan-500/20">|</span>
          <span>AES-256-GCM</span>
          <span className="text-cyan-500/20">|</span>
          <span>{new Date().toLocaleDateString()}</span>
          <span className="text-cyan-500/20">|</span>
          <span>{new Date().toLocaleTimeString()}</span>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          VIGNETTE — dark edges for cinematic depth
          ═══════════════════════════════════════════════════════════ */}
      <div
        className="absolute inset-0 pointer-events-none z-50"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />
    </motion.div>
  );
}

export default DramaticStartup;
