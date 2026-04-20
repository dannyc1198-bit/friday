'use client';

import { POIS, type POI } from '../locations/pois';

type Props = {
  active: POI | null;
  onPick: (poi: POI) => void;
};

const TAG_COLORS: Record<NonNullable<POI['tag']>, string> = {
  home: 'text-emerald-400 border-emerald-400/40',
  work: 'text-sky-400 border-sky-400/40',
  asset: 'text-cyan-300 border-cyan-300/40',
  target: 'text-amber-300 border-amber-300/40',
  threat: 'text-rose-400 border-rose-400/40',
};

export function LocationPicker({ active, onPick }: Props) {
  return (
    <aside className="absolute left-4 top-4 z-10 w-72 border border-cyan-400/30 bg-black/60 p-3 font-mono text-xs text-cyan-200 backdrop-blur-sm">
      <header className="mb-2 flex items-center justify-between border-b border-cyan-400/20 pb-2">
        <span className="tracking-[0.2em] text-cyan-300">TARGET ROSTER</span>
        <span className="text-cyan-500/70">{POIS.length} PTS</span>
      </header>
      <ul className="space-y-1">
        {POIS.map((poi) => {
          const isActive = active?.id === poi.id;
          const tagClass = poi.tag ? TAG_COLORS[poi.tag] : 'text-cyan-200 border-cyan-400/30';
          return (
            <li key={poi.id}>
              <button
                type="button"
                onClick={() => onPick(poi)}
                className={`flex w-full items-center justify-between border px-2 py-1.5 text-left transition hover:bg-cyan-400/10 ${tagClass} ${
                  isActive ? 'bg-cyan-400/15' : 'bg-transparent'
                }`}
              >
                <span className="truncate">{poi.name}</span>
                <span className="ml-2 shrink-0 text-[10px] opacity-60">
                  {poi.lat.toFixed(2)},{poi.lon.toFixed(2)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="mt-3 border-t border-cyan-400/20 pt-2 text-[10px] uppercase tracking-widest text-cyan-500/60">
        click to engage
      </footer>
    </aside>
  );
}
