
"use client";

// ChatGPT-inspired voice orb — soft glowing sphere with breathing animation.
// States: idle (dim), listening (blue pulse), thinking (amber shimmer), speaking (bright expand)

import { useEffect, useRef } from "react";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface VoiceOrbProps {
  state: OrbState;
  size?: number; // diameter in px, default 220
}

const STATE_COLORS: Record<OrbState, { primary: string; secondary: string; glow: string }> = {
  idle:      { primary: "59, 130, 246",  secondary: "147, 197, 253", glow: "59, 130, 246"  }, // blue
  listening: { primary: "99, 179, 237",  secondary: "255, 255, 255", glow: "99, 179, 237"  }, // sky blue
  thinking:  { primary: "251, 191, 36",  secondary: "253, 230, 138", glow: "251, 191, 36"  }, // amber
  speaking:  { primary: "110, 231, 183", secondary: "255, 255, 255", glow: "16, 185, 129"  }, // emerald
};

export function VoiceOrb({ state, size = 220 }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const targetAmplitude = useRef<number>(0);
  const currentAmplitude = useRef<number>(0);

  const AMPLITUDES: Record<OrbState, number> = {
    idle: 0.05,
    listening: 0.18,
    thinking: 0.12,
    speaking: 0.30,
  };

  useEffect(() => {
    targetAmplitude.current = AMPLITUDES[state];
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const baseR = size * 0.38;

    function draw(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);

      const colors = STATE_COLORS[state];
      const amp = currentAmplitude.current;

      // Outer glow rings
      for (let i = 3; i >= 1; i--) {
        const ringR = baseR + (amp * baseR * 0.6) + (i * 14);
        const alpha = (0.06 - i * 0.015) + amp * 0.04;
        const grd = ctx.createRadialGradient(cx, cy, baseR, cx, cy, ringR);
        grd.addColorStop(0, `rgba(${colors.glow}, ${alpha})`);
        grd.addColorStop(1, `rgba(${colors.glow}, 0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Organic blob shape using bezier control points
      const POINTS = 7;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < POINTS; i++) {
        const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
        const freq1 = state === "speaking" ? 2.1 : 1.4;
        const freq2 = state === "speaking" ? 3.7 : 2.8;
        const wave =
          Math.sin(t * freq1 + i * 1.1) * 0.5 +
          Math.sin(t * freq2 + i * 2.3) * 0.3;
        const r = baseR * (1 + amp * wave);
        pts.push({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        });
      }

      // Draw smooth closed curve
      ctx.beginPath();
      for (let i = 0; i < POINTS; i++) {
        const curr = pts[i];
        const next = pts[(i + 1) % POINTS];
        const cpx = (curr.x + next.x) / 2;
        const cpy = (curr.y + next.y) / 2;
        if (i === 0) ctx.moveTo(cpx, cpy);
        else ctx.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
      }
      ctx.closePath();

      // Radial gradient fill — painterly soft sphere
      const gradient = ctx.createRadialGradient(
        cx - baseR * 0.25, cy - baseR * 0.25, baseR * 0.1,
        cx, cy, baseR * 1.15
      );
      gradient.addColorStop(0,    `rgba(255, 255, 255, 0.9)`);
      gradient.addColorStop(0.25, `rgba(${colors.secondary}, 0.85)`);
      gradient.addColorStop(0.65, `rgba(${colors.primary}, 0.80)`);
      gradient.addColorStop(1,    `rgba(${colors.primary}, 0.55)`);

      ctx.fillStyle = gradient;
      ctx.fill();

      // Specular highlight (top-left sheen)
      const shine = ctx.createRadialGradient(
        cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.05,
        cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.5
      );
      shine.addColorStop(0, "rgba(255,255,255,0.45)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.fill();
    }

    function tick(ts: number) {
      const t = ts * 0.001;
      const dt = t - timeRef.current;
      timeRef.current = t;

      // Smooth amplitude lerp
      const speed = state === "idle" ? 2 : 5;
      currentAmplitude.current +=
        (targetAmplitude.current - currentAmplitude.current) * Math.min(dt * speed, 1);

      draw(t);
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [state, size]);

  return <canvas ref={canvasRef} style={{ display: "block" }} />;
}
