// FRIDAY — Dashboard config (the bits Danny personalises)
// ─────────────────────────────────────────────────────────────────────
// These are PLACEHOLDERS. Edit the arrays below to match your real stack
// and caffeine sources — the dashboard's one-tap log buttons are generated
// straight from here, so changing this file changes the UI. No rebuild of
// logic needed; just swap the values.

export interface CaffeinePreset {
  label: string;
  mg: number;
}

// Your daily supplement stack. Each becomes a tappable checklist item on
// the dashboard, and "planned" defaults to this list's length.
// TODO(Danny): replace with what you actually take.
export const DEFAULT_SUPPLEMENTS: string[] = [
  "Creatine",
  "Vitamin D3",
  "Omega-3",
  "Magnesium",
  "Multivitamin",
];

// Your usual caffeine sources. Each becomes a one-tap button that adds
// that many mg to today's running total.
// TODO(Danny): set these to your real drinks + doses.
export const CAFFEINE_PRESETS: CaffeinePreset[] = [
  { label: "Coffee", mg: 95 },
  { label: "Espresso", mg: 75 },
  { label: "Pre-workout", mg: 200 },
  { label: "Energy drink", mg: 160 },
  { label: "Green tea", mg: 30 },
];
