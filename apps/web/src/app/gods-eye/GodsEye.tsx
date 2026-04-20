'use client';

import { Canvas } from '@react-three/fiber';
import { useState } from 'react';

import { PhotorealGlobe } from './globe/PhotorealGlobe';
import { HudFrame } from './hud/HudFrame';
import { LocationPicker } from './hud/LocationPicker';
import { Telemetry } from './hud/Telemetry';
import type { POI } from './locations/pois';

export default function GodsEye() {
  const [active, setActive] = useState<POI | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY ?? '';

  if (!apiKey) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black font-mono text-cyan-300">
        <div className="max-w-md border border-cyan-400/40 p-6 text-sm">
          <div className="mb-2 uppercase tracking-[0.3em] text-cyan-400">
            Missing API Key
          </div>
          <p className="text-cyan-200/80">
            Set <code className="text-amber-300">NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY</code>{' '}
            in <code className="text-amber-300">apps/web/.env.local</code> with a
            Google Cloud key that has the{' '}
            <span className="text-amber-300">Map Tiles API</span> enabled, then
            restart the dev server.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <Canvas
        camera={{ fov: 55, near: 1, far: 200_000_000, position: [0, 0, 20_000_000] }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <PhotorealGlobe apiKey={apiKey} target={active} />
      </Canvas>

      <HudFrame />
      <LocationPicker active={active} onPick={setActive} />
      <Telemetry active={active} />
    </main>
  );
}
