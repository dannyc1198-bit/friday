/// <reference types="vite/client" />

interface JarvisHealth {
  ok: boolean;
  ms: number | null;
  body: { llm?: { model?: string } } | null;
}

interface JarvisMetrics {
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  uptime: number;
}

interface JarvisDesktop {
  shell: "centre" | "orb";
  metrics: () => Promise<JarvisMetrics | null>;
  health: () => Promise<JarvisHealth | null>;
  layout: (mode: "orb" | "centre") => void;
  playback: (id: string, state: string) => Promise<unknown>;
  interrupt: (id: string) => Promise<unknown>;
  arm: () => Promise<unknown>;
  onEvent: (callback: (raw: string) => void) => () => void;
  onAudio: (callback: (payload: Uint8Array) => void) => () => void;
  onHotkey: (callback: (action: string) => void) => () => void;
}

interface Window {
  jarvis?: JarvisDesktop;
}
