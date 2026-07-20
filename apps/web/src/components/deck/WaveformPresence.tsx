"use client";

import { useEffect, useRef } from "react";

// FRIDAY's presence. No face, no orb — a wavelength.
// Idle: a barely-breathing line. Thinking: restless ripple. Speaking: full voice.
// Reduced motion: a static calm trace.

export type PresenceMode = "idle" | "thinking" | "speaking" | "offline";

const TARGET_AMP: Record<PresenceMode, number> = {
  offline: 0.02,
  idle: 0.1,
  thinking: 0.4,
  speaking: 1.0,
};

const SPEED: Record<PresenceMode, number> = {
  offline: 0.1,
  idle: 0.35,
  thinking: 1.6,
  speaking: 2.4,
};

export function WaveformPresence({
  mode,
  className,
}: {
  mode: PresenceMode;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let amp = TARGET_AMP[modeRef.current];
    let speed = SPEED[modeRef.current];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const draw = (t: number) => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      const mid = h / 2;
      const m = modeRef.current;

      // ease toward the mode's amplitude/speed so transitions feel alive
      amp += (TARGET_AMP[m] - amp) * 0.06;
      speed += (SPEED[m] - speed) * 0.06;

      const time = (t / 1000) * speed;
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      const maxA = mid - 3;
      for (let x = 0; x <= w; x += 2) {
        const p = x / w;
        const envelope = Math.sin(Math.PI * p); // fade at both ends
        const y =
          (Math.sin(p * 9 + time * 1.2) * 0.5 +
            Math.sin(p * 17 - time * 0.8) * 0.3 +
            Math.sin(p * 31 + time * 2.1) * 0.2) *
          amp *
          maxA *
          envelope;
        if (x === 0) ctx.moveTo(x, mid + y);
        else ctx.lineTo(x, mid + y);
      }
      const lit = m === "speaking" || m === "thinking";
      ctx.strokeStyle = m === "offline" ? "#2e4e68" : lit ? "#00dcff" : "#00b4ff";
      ctx.lineWidth = 1.4;
      ctx.shadowColor = "rgba(0,180,255,0.5)";
      ctx.shadowBlur = lit ? 8 : 3;
      ctx.stroke();

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
