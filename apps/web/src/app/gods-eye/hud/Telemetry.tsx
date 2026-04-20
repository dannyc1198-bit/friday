'use client';

import type { POI } from '../locations/pois';

type Props = {
  active: POI | null;
};

export function Telemetry({ active }: Props) {
  return (
    <>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 border border-cyan-400/30 bg-black/60 px-3 py-2 font-mono text-[11px] text-cyan-200 backdrop-blur-sm">
        <div className="mb-1 text-[9px] uppercase tracking-[0.2em] text-cyan-500/70">
          Telemetry
        </div>
        {active ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-cyan-500/60">TGT</dt>
            <dd>{active.name}</dd>
            <dt className="text-cyan-500/60">LAT</dt>
            <dd>{active.lat.toFixed(5)}°</dd>
            <dt className="text-cyan-500/60">LON</dt>
            <dd>{active.lon.toFixed(5)}°</dd>
            <dt className="text-cyan-500/60">ALT</dt>
            <dd>{active.altitude.toLocaleString()} m</dd>
            <dt className="text-cyan-500/60">HDG</dt>
            <dd>{(active.heading ?? 0).toFixed(0)}°</dd>
            <dt className="text-cyan-500/60">PITCH</dt>
            <dd>{(active.pitch ?? -45).toFixed(0)}°</dd>
          </dl>
        ) : (
          <div className="text-cyan-500/60">NO TARGET // STANDBY</div>
        )}
      </div>

    </>
  );
}
