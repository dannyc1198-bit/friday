"use client";

import { useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ─── GLSL: Neural Brain Vertex Shader ──────────────────────
// Simulates neurons with dendrites, synaptic firing, and organic breathing

const vertexShader = `
  uniform float uTime;
  uniform float uPulse;
  uniform float uState; // 0=idle, 1=listening, 2=thinking, 3=speaking

  attribute float aSize;
  attribute float aOffset;
  attribute vec3 aColor;
  attribute float aLayer; // 0=core neuron, 1=dendrite, 2=synapse spark

  varying vec3 vColor;
  varying float vAlpha;
  varying float vLayer;

  // Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vec3 pos = position;
    float t = uTime;
    float layer = aLayer;

    // ─── Organic breathing — like a living brain ───
    // Multiple overlapping rhythms create natural breathing
    float breathe1 = sin(t * 0.6 + aOffset) * 0.04;
    float breathe2 = sin(t * 0.35 + aOffset * 1.7) * 0.025;
    float breathe3 = sin(t * 1.1 + aOffset * 0.3) * 0.015;
    float breathe = 1.0 + breathe1 + breathe2 + breathe3;

    // ─── Neural noise — brain folds and wrinkles ───
    float brainFold = snoise(pos * 2.0 + t * 0.15) * 0.18;
    float microFold = snoise(pos * 5.0 + t * 0.3) * 0.06;
    float dendrite = snoise(pos * 8.0 - t * 0.5) * 0.04;

    // ─── Synaptic firing — random bursts of activity ───
    float synapseWave = snoise(vec3(pos.x * 3.0 + t * 2.0, pos.y * 3.0, pos.z * 3.0));
    float synapseFire = smoothstep(0.55, 0.75, synapseWave);

    // ─── State-specific neural behavior ───
    float stateScale = 1.0;
    float stateEnergy = 0.0;

    if (uState < 0.5) {
      // IDLE — calm neural drift, occasional synapse
      stateScale = breathe;
      stateEnergy = synapseFire * 0.3;
    } else if (uState < 1.5) {
      // LISTENING — neurons contract inward, heightened attention
      float focus = sin(t * 4.0 + pos.y * 2.0) * 0.06;
      stateScale = breathe * (0.95 + focus);
      stateEnergy = synapseFire * 0.6;
      // Neurons pull slightly inward (concentrating)
      pos *= 0.97 + sin(t * 2.5) * 0.02;
    } else if (uState < 2.5) {
      // THINKING — chaotic neural storms, rapid firing
      float storm1 = sin(t * 3.0 + pos.y * 4.0) * 0.1;
      float storm2 = cos(t * 2.5 + pos.x * 3.0) * 0.08;
      float storm3 = sin(t * 4.0 + pos.z * 5.0) * 0.06;
      pos.x += storm2 * cos(t * 1.5);
      pos.y += storm1;
      pos.z += storm3 * sin(t * 1.8);
      stateScale = breathe * (1.0 + sin(t * 5.0) * 0.04);
      stateEnergy = synapseFire * 1.0 + smoothstep(0.3, 0.6, snoise(pos * 4.0 + t * 3.0)) * 0.5;
    } else {
      // SPEAKING — rhythmic pulsations outward, like speech waves
      float speech1 = sin(t * 8.0) * 0.05 * uPulse;
      float speech2 = sin(t * 12.0 + pos.y * 2.0) * 0.03 * uPulse;
      float speech3 = sin(t * 5.0) * 0.04;
      stateScale = breathe * (1.0 + speech1 + speech2 + speech3);
      stateEnergy = synapseFire * 0.7 + abs(sin(t * 6.0)) * 0.3;
      // Expand outward rhythmically
      vec3 normal = normalize(pos);
      pos += normal * speech1;
    }

    // ─── Apply displacement ───
    vec3 normal = normalize(pos);
    float totalDisplace = brainFold + microFold + dendrite;

    // Dendrite particles extend further
    if (layer > 0.5 && layer < 1.5) {
      totalDisplace *= 1.8;
      pos += normal * 0.15 * sin(t * 0.8 + aOffset * 3.0);
    }
    // Synapse sparks fly out during firing
    if (layer > 1.5) {
      pos += normal * synapseFire * 0.3;
      totalDisplace *= 0.5;
    }

    pos += normal * totalDisplace * stateScale;
    pos *= stateScale;

    // ─── Neural flicker — individual neurons blink like real brain ───
    float neuralFlicker = snoise(pos * 10.0 + t * 1.5);
    float isActive = smoothstep(0.2, 0.6, neuralFlicker);

    // Synapse particles glow when firing
    float synapseGlow = layer > 1.5 ? synapseFire * 2.0 : 0.0;

    // ─── Color: brighten active neurons ───
    vColor = aColor * (0.4 + isActive * 0.6 + stateEnergy * 0.4 + synapseGlow);
    vAlpha = 0.15 + isActive * 0.55 + stateEnergy * 0.3 + synapseGlow * 0.5;
    vLayer = layer;

    // ─── Size: active neurons swell ───
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    float activeSize = 1.0 + isActive * 0.6 + stateEnergy * 0.4 + synapseGlow;
    gl_PointSize = aSize * activeSize * (220.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vLayer;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;

    // Neurons: soft organic glow with bright core
    // Dendrites: elongated glow
    // Synapses: sharp bright sparks
    float glow;
    if (vLayer > 1.5) {
      // Synapse spark — sharp bright point
      glow = 1.0 - smoothstep(0.0, 0.3, d);
      glow = pow(glow, 2.0);
    } else if (vLayer > 0.5) {
      // Dendrite — softer, more spread
      glow = 1.0 - smoothstep(0.0, 0.5, d);
      glow = pow(glow, 1.2);
    } else {
      // Neuron body — bright core with soft halo
      float core = 1.0 - smoothstep(0.0, 0.2, d);
      float halo = 1.0 - smoothstep(0.0, 0.5, d);
      glow = core * 0.7 + pow(halo, 1.5) * 0.5;
    }

    gl_FragColor = vec4(vColor * glow * 1.8, vAlpha * glow);
  }
`;

// ─── Neural Particle Brain ────────────────────────────────

function NeuralBrain({ state = 0, pulse = 0 }: { state?: number; pulse?: number }) {
  const meshRef = useRef<THREE.Points>(null);
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uState: { value: 0 },
  });

  const NEURON_COUNT = 4000;     // Core neurons
  const DENDRITE_COUNT = 2500;   // Branching dendrites
  const SYNAPSE_COUNT = 1500;    // Synaptic sparks
  const TOTAL = NEURON_COUNT + DENDRITE_COUNT + SYNAPSE_COUNT;

  const { positions, sizes, offsets, colors, layers } = useMemo(() => {
    const positions = new Float32Array(TOTAL * 3);
    const sizes = new Float32Array(TOTAL);
    const offsets = new Float32Array(TOTAL);
    const colors = new Float32Array(TOTAL * 3);
    const layers = new Float32Array(TOTAL);

    // Neural color palette — bio-luminescent brain
    const neuronColors = [
      [0.0, 0.71, 1.0],    // #00B4FF — primary neuron blue
      [0.0, 0.86, 1.0],    // #00DCFF — activated cyan
      [0.3, 0.76, 0.97],   // #4DC2F8 — holographic
      [0.0, 0.50, 0.85],   // #0080D9 — deep neural
      [0.9, 0.96, 1.0],    // #E5F5FF — white-hot synapse
    ];

    const dendriColors = [
      [0.0, 0.60, 0.90],   // Slightly dimmer blue
      [0.15, 0.55, 0.80],  // Purple-tinted neural
      [0.0, 0.75, 0.95],   // Bright pathway
    ];

    const synapseColors = [
      [0.3, 1.0, 1.0],     // #4DFFFF — ultra bright spark
      [1.0, 1.0, 1.0],     // White flash
      [0.0, 0.86, 1.0],    // Cyan flash
    ];

    let idx = 0;

    // ─── Core neurons: clustered sphere with brain-like folds ───
    for (let i = 0; i < NEURON_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // Varied radius creates brain surface texture
      const r = 0.85 + Math.random() * 0.35;
      // Add brain-fold clustering
      const foldBias = Math.sin(theta * 3) * Math.cos(phi * 2) * 0.08;

      positions[idx * 3] = (r + foldBias) * Math.sin(phi) * Math.cos(theta);
      positions[idx * 3 + 1] = (r + foldBias) * Math.sin(phi) * Math.sin(theta);
      positions[idx * 3 + 2] = (r + foldBias) * Math.cos(phi);

      sizes[idx] = 1.5 + Math.random() * 3.5;
      offsets[idx] = Math.random() * Math.PI * 2;
      layers[idx] = 0;

      const c = neuronColors[Math.floor(Math.random() * neuronColors.length)];
      colors[idx * 3] = c[0];
      colors[idx * 3 + 1] = c[1];
      colors[idx * 3 + 2] = c[2];
      idx++;
    }

    // ─── Dendrites: extending outward like branches ───
    for (let i = 0; i < DENDRITE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // Dendrites extend beyond the neuron sphere
      const r = 1.1 + Math.random() * 0.45;
      // Some cluster near neurons, some extend far
      const extension = Math.random() < 0.3 ? 0.3 : 0.0;

      positions[idx * 3] = (r + extension) * Math.sin(phi) * Math.cos(theta);
      positions[idx * 3 + 1] = (r + extension) * Math.sin(phi) * Math.sin(theta);
      positions[idx * 3 + 2] = (r + extension) * Math.cos(phi);

      sizes[idx] = 0.8 + Math.random() * 2.0;
      offsets[idx] = Math.random() * Math.PI * 2;
      layers[idx] = 1;

      const c = dendriColors[Math.floor(Math.random() * dendriColors.length)];
      colors[idx * 3] = c[0];
      colors[idx * 3 + 1] = c[1];
      colors[idx * 3 + 2] = c[2];
      idx++;
    }

    // ─── Synaptic sparks: scattered, bright, small ───
    for (let i = 0; i < SYNAPSE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // Synapses appear between neurons
      const r = 0.7 + Math.random() * 0.8;

      positions[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[idx * 3 + 2] = r * Math.cos(phi);

      sizes[idx] = 0.5 + Math.random() * 1.5;
      offsets[idx] = Math.random() * Math.PI * 2;
      layers[idx] = 2;

      const c = synapseColors[Math.floor(Math.random() * synapseColors.length)];
      colors[idx * 3] = c[0];
      colors[idx * 3 + 1] = c[1];
      colors[idx * 3 + 2] = c[2];
      idx++;
    }

    return { positions, sizes, offsets, colors, layers };
  }, []);

  useFrame((_, delta) => {
    if (!uniformsRef.current) return;
    uniformsRef.current.uTime.value += delta;
    // Smooth transitions between states
    uniformsRef.current.uPulse.value += (pulse - uniformsRef.current.uPulse.value) * 0.08;
    uniformsRef.current.uState.value += (state - uniformsRef.current.uState.value) * 0.04;

    // Organic rotation — not mechanical, like brain slightly shifting
    if (meshRef.current) {
      const t = uniformsRef.current.uTime.value;
      meshRef.current.rotation.y += delta * 0.06;
      meshRef.current.rotation.x = Math.sin(t * 0.15) * 0.12;
      meshRef.current.rotation.z = Math.cos(t * 0.1) * 0.05;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aOffset" args={[offsets, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aLayer" args={[layers, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniformsRef.current}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─── Neural Pathway Rings — like brain scan visualization ──

function NeuralRing({ radius, speed, tilt, opacity = 0.15 }: { radius: number; speed: number; tilt: number; opacity?: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speed;
  });

  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, 0.002, 16, 120]} />
      <meshBasicMaterial color="#00b4ff" transparent opacity={opacity} />
    </mesh>
  );
}

// ─── Main Export ────────────────────────────────────────────

interface NeuralOrbProps {
  isListening?: boolean;
  isThinking?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  pulse?: number;
  className?: string;
  size?: "hero" | "compact";
}

export function NeuralOrb({
  isListening = false,
  isThinking = false,
  isSpeaking = false,
  isMuted = false,
  pulse = 0,
  className = "",
  size = "hero",
}: NeuralOrbProps) {
  const state = isMuted ? 0 : isSpeaking ? 3 : isThinking ? 2 : isListening ? 1 : 0;

  const stateLabel = isMuted
    ? "MUTED"
    : isSpeaking
    ? "NEURAL OUTPUT"
    : isThinking
    ? "PROCESSING"
    : isListening
    ? "NEURAL INPUT"
    : "NEURAL IDLE";

  const stateColor = isMuted
    ? "text-[#5a8aaa]"
    : isSpeaking
    ? "text-[#66ffb2]"
    : isThinking
    ? "text-[#ffa726]"
    : isListening
    ? "text-[#00dcff]"
    : "text-[#5a8aaa]";

  const dims = size === "hero" ? "w-80 h-80" : "w-20 h-20";

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* Ambient neural glow */}
      <div
        className={`absolute rounded-full blur-[80px] opacity-15 ${dims}`}
        style={{
          background: isThinking
            ? "radial-gradient(circle, #ffa726 0%, #00b4ff 50%, transparent 70%)"
            : isSpeaking
            ? "radial-gradient(circle, #66ffb2 0%, #00b4ff 40%, transparent 70%)"
            : "radial-gradient(circle, #00b4ff 0%, #00dcff 40%, transparent 70%)",
        }}
      />

      {/* 3D Neural Brain */}
      <div className={dims}>
        <Canvas
          camera={{ position: [0, 0, size === "hero" ? 3.2 : 3.5], fov: 50 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: "transparent" }}
        >
          <NeuralBrain state={state} pulse={pulse} />

          {/* Neural pathway rings — brain scan aesthetic */}
          <NeuralRing radius={1.5} speed={0.2} tilt={0.3} opacity={0.1} />
          <NeuralRing radius={1.7} speed={-0.15} tilt={-0.6} opacity={0.07} />
          <NeuralRing radius={1.9} speed={0.1} tilt={1.1} opacity={0.04} />

          <EffectComposer>
            <Bloom
              intensity={1.5}
              luminanceThreshold={0.08}
              luminanceSmoothing={0.95}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Status label — premium typography */}
      {size === "hero" && (
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <span className={`text-[9px] font-display font-semibold uppercase tracking-[0.35em] ${stateColor} transition-colors duration-500`}>
            {stateLabel}
          </span>
          <div className="flex items-center gap-2">
            <div className="w-8 h-px bg-gradient-to-r from-transparent to-[#00b4ff]/20" />
            <span className="text-[8px] font-mono text-[#1e3a50] tracking-[0.2em]">
              F.R.I.D.A.Y. v2.0
            </span>
            <div className="w-8 h-px bg-gradient-to-l from-transparent to-[#00b4ff]/20" />
          </div>
        </div>
      )}
    </div>
  );
}
