"use client";

import { useEffect, useRef } from "react";

// NeuralBrain — a pixelated neuron web on canvas.
//
// ~120 square-pixel neurons drift in a two-lobed elliptical "brain" cloud,
// joined by dotted synapses. Neurons fire: a bright pixel pulse travels the
// synapse to a neighbour, lights it up, and can chain-fire a cascade.
// `intensity` (0–1) scales the ambient firing rate — 0 is a resting mind,
// 1 is frantic thinking.
//
// Palette matches the --fri-* vars in globals.css (electric cyan on deep
// space). Renders transparent — layer it over whatever background you like.
//
// Perf notes: static synapse layer is pre-rendered to an offscreen canvas
// (one drawImage per frame); per-frame work is O(neurons + pulses) with hard
// caps. requestAnimationFrame pauses while document.hidden. DPR-aware.

export interface NeuralBrainProps {
  /** 0–1 · ambient firing rate: 0 = resting, 1 = frantic thinking. */
  intensity?: number;
  className?: string;
}

interface Neuron {
  nx: number; // normalized brain-space coords, −1..1
  ny: number;
  x: number; // pixel-space (recomputed on resize)
  y: number;
  size: number; // 1 or 2 pixel cells
  phase: number; // drift phase
  activation: number; // 0..1, decays each frame
  cooldownUntil: number; // refractory period (ms timestamp)
  neighbors: number[];
}

interface Pulse {
  from: number;
  to: number;
  t: number; // 0..1 along the synapse
  speed: number; // t units per second
  hops: number; // remaining chain depth
}

const MAX_NEURONS = 120;
const MAX_PULSES = 80;

// --fri-accent / --fri-accent-bright / --fri-accent-ultra
const C_BASE = { r: 0, g: 180, b: 255 };
const C_BRIGHT = { r: 0, g: 220, b: 255 };
const C_ULTRA = { r: 77, g: 255, b: 255 };

const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r},${c.g},${c.b},${a})`;

export default function NeuralBrain({ intensity = 0.3, className }: NeuralBrainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = Math.max(0, Math.min(1, intensity));
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 1;
    let h = 1;
    let px = 3; // pixel-grid cell size — everything snaps to this

    // ── Build the neuron cloud (once) ─────────────────────────────────────
    // Two lobes: alternate neurons between left/right lobe centers, sample
    // center-weighted offsets, squash into the brain ellipse.
    const centered = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
    const neurons: Neuron[] = [];
    for (let i = 0; i < MAX_NEURONS; i++) {
      const lobe = i % 2 === 0 ? -0.34 : 0.34;
      let nx = lobe + centered() * 0.62;
      let ny = centered() * 0.8;
      const d = nx * nx + (ny * ny) / 0.64; // ellipse: rx=1, ry=0.8
      if (d > 1) {
        const s = 0.95 / Math.sqrt(d);
        nx *= s;
        ny *= s;
      }
      neurons.push({
        nx,
        ny,
        x: 0,
        y: 0,
        size: Math.random() < 0.25 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
        activation: 0,
        cooldownUntil: 0,
        neighbors: [],
      });
    }

    // ── Synapses: connect each neuron to its 2–3 nearest neighbours ───────
    for (let i = 0; i < neurons.length; i++) {
      const me = neurons[i];
      const dists = neurons.map((n, j) => ({
        j,
        d: j === i ? Infinity : (n.nx - me.nx) ** 2 + (n.ny - me.ny) ** 2,
      }));
      dists.sort((a, b) => a.d - b.d);
      const k = 2 + (i % 2);
      for (let m = 0; m < k; m++) {
        const j = dists[m].j;
        if (!me.neighbors.includes(j)) me.neighbors.push(j);
        if (!neurons[j].neighbors.includes(i)) neurons[j].neighbors.push(i);
      }
    }

    const pulses: Pulse[] = [];

    // Static synapse layer — dotted pixel lines pre-rendered per resize.
    const edgeLayer = document.createElement("canvas");
    const edgeCtx = edgeLayer.getContext("2d");

    const snap = (v: number) => Math.round(v / px) * px;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      px = Math.max(2, Math.round(Math.min(w, h) / 190));

      const cx = w / 2;
      const cy = h / 2;
      const rx = w * 0.44;
      const ry = h * 0.42;
      for (const n of neurons) {
        n.x = cx + n.nx * rx;
        n.y = cy + n.ny * ry;
      }

      if (!edgeCtx) return;
      edgeLayer.width = canvas.width;
      edgeLayer.height = canvas.height;
      edgeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      edgeCtx.clearRect(0, 0, w, h);
      const dot = Math.max(1, px - 1);
      for (let i = 0; i < neurons.length; i++) {
        for (const j of neurons[i].neighbors) {
          if (j <= i) continue; // draw each synapse once
          const a = neurons[i];
          const b = neurons[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const steps = Math.max(2, Math.floor(Math.hypot(dx, dy) / (px * 2.6)));
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            edgeCtx.fillStyle = rgba(C_BASE, 0.05 + 0.04 * Math.sin(t * Math.PI));
            edgeCtx.fillRect(snap(a.x + dx * t), snap(a.y + dy * t), dot, dot);
          }
        }
      }
    };

    // ── Firing ─────────────────────────────────────────────────────────────
    const fire = (idx: number, hops: number, exclude = -1) => {
      const n = neurons[idx];
      const now = performance.now();
      if (now < n.cooldownUntil) return;
      n.cooldownUntil = now + 260; // refractory — keeps cascades from exploding
      n.activation = 1;
      if (pulses.length >= MAX_PULSES) return;
      const outs = n.neighbors.filter((j) => j !== exclude);
      if (outs.length === 0) return;
      const inten = intensityRef.current;
      const fanout = Math.random() < 0.3 + inten * 0.4 ? Math.min(2, outs.length) : 1;
      for (let f = 0; f < fanout && pulses.length < MAX_PULSES; f++) {
        const to = outs[Math.floor(Math.random() * outs.length)];
        pulses.push({
          from: idx,
          to,
          t: 0,
          speed: 1.1 + Math.random() * 0.9 + inten * 1.2,
          hops,
        });
      }
    };

    // ── Frame loop ──────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let spawnBudget = Math.random();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const inten = intensityRef.current;

      // ambient firing rate scales with intensity
      spawnBudget += (0.7 + inten * 9) * dt;
      while (spawnBudget >= 1) {
        fire(Math.floor(Math.random() * neurons.length), 2 + Math.round(inten * 3));
        spawnBudget -= 1;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(edgeLayer, 0, 0, w, h);

      // neurons — square pixels with layered-rect glow (no shadowBlur)
      const tSec = now / 1000;
      for (const n of neurons) {
        n.activation *= Math.exp(-dt * 2.4);
        const wob = px * 0.8;
        const x = snap(n.x + Math.sin(tSec * 0.7 + n.phase) * wob);
        const y = snap(n.y + Math.cos(tSec * 0.55 + n.phase * 1.7) * wob);
        const s = px * n.size;
        const a = n.activation;
        if (a > 0.04) {
          ctx.fillStyle = rgba(C_BRIGHT, 0.1 * a);
          ctx.fillRect(x - s * 2, y - s * 2, s * 5, s * 5);
          ctx.fillStyle = rgba(C_BRIGHT, 0.18 * a);
          ctx.fillRect(x - s, y - s, s * 3, s * 3);
        }
        ctx.fillStyle =
          a > 0.35 ? rgba(C_ULTRA, 0.45 + 0.55 * a) : rgba(C_BASE, 0.3 + 0.5 * a);
        ctx.fillRect(x, y, s, s);
      }

      // pulses — bright pixel heads with short trails, chain-fire on arrival
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.speed * dt;
        const a = neurons[p.from];
        const b = neurons[p.to];
        if (p.t >= 1) {
          pulses.splice(i, 1);
          b.activation = 1;
          if (p.hops > 0 && Math.random() < 0.3 + inten * 0.5) {
            fire(p.to, p.hops - 1, p.from);
          }
          continue;
        }
        const hx = snap(a.x + (b.x - a.x) * p.t);
        const hy = snap(a.y + (b.y - a.y) * p.t);
        ctx.fillStyle = rgba(C_BRIGHT, 0.18);
        ctx.fillRect(hx - px, hy - px, px * 3, px * 3); // halo
        for (let k = 2; k >= 0; k--) {
          const tt = p.t - k * 0.07;
          if (tt < 0) continue;
          const x = snap(a.x + (b.x - a.x) * tt);
          const y = snap(a.y + (b.y - a.y) * tt);
          if (k === 0) {
            ctx.fillStyle = rgba(C_ULTRA, 0.95);
            ctx.fillRect(x, y, px, px);
          } else {
            ctx.fillStyle = rgba(C_BRIGHT, k === 1 ? 0.4 : 0.16);
            const ts = Math.max(1, px - 1);
            ctx.fillRect(x, y, ts, ts);
          }
        }
      }
    };

    const start = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    layout();
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
