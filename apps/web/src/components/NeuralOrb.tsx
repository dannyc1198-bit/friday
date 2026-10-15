"use client";

// FRIDAY's living brain — 2D canvas neuron web on a settled force layout.
// Replaces the @react-three/fiber NeuralOrb (broken under React 18).
// Same export name + prop interface so page.tsx import is unchanged.
// Layout is computed once at mount (settleNodes) and frozen — only the
// firing/charge visuals animate per frame, so nodes never drift.

import { useEffect, useRef, useState } from "react";

// ─── Visual constants — swap colours here ────────────────────
const COLOR_NODE_REST = { r: 140, g: 100, b: 255 }; // violet (brain tissue)
const COLOR_NODE_FIRE = { r: 0, g: 220, b: 255 };   // cyan (synaptic firing)
const COLOR_TEXT = "rgba(180, 140, 255, 0.7)";
const COLOR_TEXT_DIM = "rgba(180, 140, 255, 0.35)";

// ─── Brain growth constants ──────────────────────────────────
const NODE_COUNT = 200;
const EDGES_PER_NODE = 4;
const BASE_SYNAPSES = 1_240_000_000;
const TARGET_SYNAPSES = 1_300_000_000;

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  charge: number;
  edges: number[];
}

function generateNodes(width: number, height: number): Node[] {
  const nodes: Node[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * 0.42;

  for (let i = 0; i < NODE_COUNT; i++) {
    // Cluster toward center with quadratic falloff
    const r = Math.sqrt(Math.random()) * maxR;
    const theta = Math.random() * Math.PI * 2;
    nodes.push({
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
      vx: 0,
      vy: 0,
      baseRadius: 1 + Math.random() * 1.5,
      charge: 0,
      edges: [],
    });
  }

  // Connect each node to its k-nearest neighbours
  for (let i = 0; i < NODE_COUNT; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < NODE_COUNT; j++) {
      if (j === i) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      dists.push({ j, d: dx * dx + dy * dy });
    }
    dists.sort((a, b) => a.d - b.d);
    nodes[i].edges = dists.slice(0, EDGES_PER_NODE).map((e) => e.j);
  }

  return nodes;
}

// Run the force simulation to equilibrium ONCE, offscreen, then freeze.
// Repulsion is clamped — the raw 6/d² term explodes when two nodes overlap,
// which is what made the live version jitter forever.
function settleNodes(nodes: Node[], dim: number) {
  const cx = dim / 2;
  const cy = dim / 2;
  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];

      a.vx += (cx - a.x) * 0.0006;
      a.vy += (cy - a.y) * 0.0006;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < 3600) {
          const f = Math.min(6 / d2, 0.35); // clamp kills the singularity
          a.vx -= dx * f;
          a.vy -= dy * f;
          b.vx += dx * f;
          b.vy += dy * f;
        }
      }

      for (const j of a.edges) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = (d - 32) * 0.0012;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
      }

      a.vx *= 0.86;
      a.vy *= 0.86;
      a.x += a.vx;
      a.y += a.vy;
    }
  }
  for (const n of nodes) {
    n.vx = 0;
    n.vy = 0;
  }
}

interface NeuralOrbProps {
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  size: "hero" | "compact";
}

export function NeuralOrb({
  isListening,
  isThinking,
  isSpeaking,
  isMuted,
  size,
}: NeuralOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ isListening, isThinking, isSpeaking, isMuted });
  stateRef.current = { isListening, isThinking, isSpeaking, isMuted };

  const dim = size === "hero" ? 500 : 240;
  const [synapses, setSynapses] = useState(BASE_SYNAPSES);

  // Synapse counter — asymptotic crawl toward 1.3B (slows as it approaches)
  useEffect(() => {
    const id = setInterval(() => {
      setSynapses((s) => {
        const remaining = TARGET_SYNAPSES - s;
        if (remaining <= 0) return s;
        // Add 0.001% of remaining + a small jitter — feels like real growth
        const inc = Math.max(1, Math.floor(remaining * 0.00001 + Math.random() * 12));
        return Math.min(TARGET_SYNAPSES, s + inc);
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Account for HiDPI to keep edges crisp
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dim * dpr;
    canvas.height = dim * dpr;
    canvas.style.width = `${dim}px`;
    canvas.style.height = `${dim}px`;
    ctx.scale(dpr, dpr);

    const nodes = generateNodes(dim, dim);
    settleNodes(nodes, dim); // positions are final after this — no live physics
    let raf = 0;
    let t = 0;

    const tick = () => {
      t += 0.016;
      const { isListening, isThinking, isSpeaking, isMuted } = stateRef.current;

      const cx = dim / 2;
      const cy = dim / 2;

      // ── Charge updates (neuron firing) ───────────────────
      for (const n of nodes) n.charge *= 0.92;

      if (isThinking && Math.random() < 0.5) {
        // Random scattered firing
        for (let k = 0; k < 6; k++) {
          nodes[Math.floor(Math.random() * nodes.length)].charge = 1;
        }
      }
      if (isListening) {
        // Steady breathing pulse across all nodes
        const pulse = 0.25 + 0.25 * Math.sin(t * 2.2);
        for (const n of nodes) n.charge = Math.max(n.charge, pulse);
      }
      if (isSpeaking) {
        // Outward wave from center
        const wave = (t * 90) % (dim * 0.7);
        for (const n of nodes) {
          const d = Math.hypot(n.x - cx, n.y - cy);
          if (Math.abs(d - wave) < 28) n.charge = Math.max(n.charge, 0.95);
        }
      }

      // ── Render ───────────────────────────────────────────
      ctx.clearRect(0, 0, dim, dim);
      const dimFactor = isMuted ? 0.25 : 1;

      // Edges (drawn first so nodes sit on top)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (const j of a.edges) {
          if (j <= i) continue; // dedupe
          const b = nodes[j];
          const charge = (a.charge + b.charge) * 0.5;
          const isFiring = charge > 0.4;
          const c = isFiring ? COLOR_NODE_FIRE : COLOR_NODE_REST;
          const alpha = (0.04 + charge * 0.5) * dimFactor;
          ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
          ctx.lineWidth = isFiring ? 1.1 : 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Nodes — glow + core
      for (const n of nodes) {
        const r = n.baseRadius * (1 + n.charge * 1.4);
        const c = n.charge > 0.5 ? COLOR_NODE_FIRE : COLOR_NODE_REST;
        const alpha = (0.35 + n.charge * 0.6) * dimFactor;

        // Glow halo
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
        grad.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha * 0.7})`);
        grad.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${Math.min(255, c.r + 60)}, ${Math.min(255, c.g + 60)}, ${Math.min(255, c.b + 30)}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dim]);

  return (
    <div
      className="relative pointer-events-none"
      style={{ width: dim, height: dim }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {size === "hero" && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
          <div
            className="text-[9px] uppercase tracking-[0.25em]"
            style={{ color: COLOR_TEXT_DIM }}
          >
            synapses
          </div>
          <div
            className="text-sm font-mono tabular-nums"
            style={{ color: COLOR_TEXT }}
          >
            {synapses.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
