"use client";

import { useRef, useEffect } from "react";

const CIRCUIT_COLOR = "#00d4ff";
const CIRCUIT_GLOW = 15;
const DURATION = 1500; // 1.5 seconds
const MAX_BRANCHES = 3;
const SEGMENT_LENGTH = 30;
const FADE_OPACITY = 0.15;
const TICK = 16; // ~60fps

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface TraceLine {
  segments: Segment[];
  x: number;
  y: number;
  dx: number;
  dy: number;
  progress: number; // 0-1 how far through animation
  branches: number;
  alive: boolean;
}

function pickDirection(current: { dx: number; dy: number }): { dx: number; dy: number } {
  // 90-degree turns only (or continue straight)
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  // Bias toward continuing straight; 60% straight, 40% turn
  if (Math.random() < 0.6) return current;
  const perpendicular = dirs.filter(
    (d) => !(d.dx === current.dx && d.dy === current.dy) && !(d.dx === -current.dx && d.dy === -current.dy)
  );
  return perpendicular[Math.floor(Math.random() * perpendicular.length)];
}

function createLine(cx: number, cy: number): TraceLine {
  const angle = Math.random() * Math.PI * 2;
  // Snap to 90-degree directions
  const snap = Math.round(angle / (Math.PI / 2)) % 4;
  const dirs = [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 },
  ];
  const dir = dirs[snap];
  return {
    segments: [],
    x: cx,
    y: cy,
    dx: dir.dx,
    dy: dir.dy,
    progress: 0,
    branches: 0,
    alive: true,
  };
}

export default function CircuitAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<TraceLine[]>([]);
  const startTimeRef = useRef<number>(0);
  const fadingRef = useRef(false);
  const fadeAlphaRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Spawn initial lines (8 lines radiating from center)
    const initialCount = 8;
    linesRef.current = [];
    for (let i = 0; i < initialCount; i++) {
      linesRef.current.push(createLine(cx, cy));
    }

    startTimeRef.current = performance.now();
    fadingRef.current = false;
    fadeAlphaRef.current = 1;

    let animId: number;

    const draw = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / DURATION, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // After duration, start fading to FADE_OPACITY
      if (t >= 1 && !fadingRef.current) {
        fadingRef.current = true;
      }

      if (fadingRef.current) {
        fadeAlphaRef.current = Math.max(fadeAlphaRef.current - 0.02, FADE_OPACITY);
      }

      const globalAlpha = fadeAlphaRef.current;

      // Advance lines
      if (t < 1) {
        for (const line of linesRef.current) {
          if (!line.alive) continue;

          // Move forward
          const newDir = pickDirection({ dx: line.dx, dy: line.dy });
          line.dx = newDir.dx;
          line.dy = newDir.dy;

          const nx = line.x + line.dx * SEGMENT_LENGTH;
          const ny = line.y + line.dy * SEGMENT_LENGTH;

          // Bounds check
          if (nx < 0 || nx > canvas.width || ny < 0 || ny > canvas.height) {
            line.alive = false;
            continue;
          }

          line.segments.push({ x1: line.x, y1: line.y, x2: nx, y2: ny });
          line.x = nx;
          line.y = ny;
          line.progress = t;

          // Random branching
          if (Math.random() < 0.15 && line.branches < MAX_BRANCHES) {
            line.branches++;
            const branch = createLine(line.x, line.y);
            // Give branch a perpendicular direction
            const perp = pickDirection({ dx: line.dx, dy: line.dy });
            branch.dx = perp.dx;
            branch.dy = perp.dy;
            branch.branches = line.branches; // inherit branch count toward limit
            linesRef.current.push(branch);
          }
        }
      }

      // Draw all segments
      for (const line of linesRef.current) {
        const segs = line.segments;
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const isTip = line.alive && i === segs.length - 1 && t < 1;

          ctx.save();
          ctx.globalAlpha = globalAlpha;
          ctx.strokeStyle = CIRCUIT_COLOR;
          ctx.lineWidth = isTip ? 2.5 : 1.5;
          ctx.shadowColor = CIRCUIT_COLOR;
          ctx.shadowBlur = isTip ? CIRCUIT_GLOW * 2 : CIRCUIT_GLOW;
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();

          // Bright dot at tip
          if (isTip) {
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = CIRCUIT_COLOR;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(seg.x2, seg.y2, 3, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      // Small nodes at corners
      ctx.save();
      ctx.globalAlpha = globalAlpha * 0.6;
      for (const line of linesRef.current) {
        for (let i = 1; i < line.segments.length; i++) {
          const prev = line.segments[i - 1];
          const curr = line.segments[i];
          // If direction changed, draw a node
          const pdx = prev.x2 - prev.x1;
          const pdy = prev.y2 - prev.y1;
          const cdx = curr.x2 - curr.x1;
          const cdy = curr.y2 - curr.y1;
          if (pdx !== cdx || pdy !== cdy) {
            ctx.fillStyle = CIRCUIT_COLOR;
            ctx.shadowColor = CIRCUIT_COLOR;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(curr.x1, curr.y1, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // Keep animating until fade is complete
      if (fadeAlphaRef.current > FADE_OPACITY) {
        animId = requestAnimationFrame(draw);
      } else {
        // Final static frame at FADE_OPACITY
        // Already drawn above
      }

      if (t < 1 || fadeAlphaRef.current > FADE_OPACITY) {
        animId = requestAnimationFrame(draw);
      }
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
