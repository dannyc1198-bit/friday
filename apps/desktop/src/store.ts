import { create } from "zustand";
import type { CentreMode, ThemeId } from "./lib/presentation";

export interface Caption {
  role: "you" | "jarvis";
  text: string;
}

interface CentreStore {
  mode: CentreMode;
  theme: ThemeId;
  follow: boolean;
  settingsOpen: boolean;
  pinned: boolean;
  shell: "centre" | "orb";
  lines: Caption[];
  mic: number;
  online: boolean;
  model: string;
  latencyMs: number | null;
  cpu: number | null;
  ramUsed: number | null;
  ramTotal: number | null;
  gpu: string;
  clock: string;
  setMode: (mode: CentreMode) => void;
  setTheme: (theme: ThemeId) => void;
  setFollow: (follow: boolean) => void;
  toggleSettings: () => void;
  setPinned: (pinned: boolean) => void;
  setLines: (lines: Caption[]) => void;
  patch: (partial: Partial<CentreStore>) => void;
}

export const useCentre = create<CentreStore>((set) => ({
  mode: "idle",
  theme: "jarvis",
  follow: false,
  settingsOpen: false,
  pinned: false,
  shell: "centre",
  lines: [],
  mic: 0,
  online: false,
  model: "—",
  latencyMs: null,
  cpu: null,
  ramUsed: null,
  ramTotal: null,
  gpu: "—",
  clock: "",
  setMode: (mode) => set({ mode }),
  setTheme: (theme) => set({ theme }),
  setFollow: (follow) => set({ follow }),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setPinned: (pinned) => set({ pinned }),
  setLines: (lines) => set({ lines }),
  patch: (partial) => set(partial),
}));

export const live = {
  mouth: 0,
  mic: 0,
  bins: new Float32Array(24),
  ripple: 0,
};
