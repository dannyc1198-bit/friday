'use client';

// Pure-CSS HUD chrome: corner brackets, center reticle, faint scan lines.
// Zero WebGL cost — real CRT/NVG/FLIR shaders come in a later phase via
// @react-three/postprocessing.
export function HudFrame() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {/* scan lines */}
      <div
        className="absolute inset-0 opacity-[0.08] mix-blend-screen"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,255,255,0.6) 0 1px, transparent 1px 3px)',
        }}
      />
      {/* corner brackets */}
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <div
          key={c}
          className={`absolute h-6 w-6 border-cyan-300/70 ${
            c === 'tl' ? 'left-2 top-2 border-l border-t' : ''
          } ${c === 'tr' ? 'right-2 top-2 border-r border-t' : ''} ${
            c === 'bl' ? 'bottom-2 left-2 border-b border-l' : ''
          } ${c === 'br' ? 'bottom-2 right-2 border-b border-r' : ''}`}
        />
      ))}
      {/* center reticle */}
      <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-300/50" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-300/50" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-cyan-300/80" />
      </div>
      {/* title */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.4em] text-cyan-300/80">
        F.R.I.D.A.Y. // God&apos;s Eye — Orbital Surveillance
      </div>
    </div>
  );
}
