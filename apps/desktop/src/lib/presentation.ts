export type CentreMode = "idle" | "listening" | "thinking" | "speaking" | "confirming" | "alert";
export type ThemeId = "jarvis" | "ultron";

export const THEMES = {
  jarvis: { hot: "#fff1c2", mid: "#ff9a2f", deep: "#c45a12", hud: "#ffb347" },
  ultron: { hot: "#e7f7ff", mid: "#3cb6ff", deep: "#123e78", hud: "#49c8ff" },
} as const;

export function modeLabel(mode: CentreMode, follow: boolean): string {
  if (mode === "confirming") return "Say yes";
  if (mode === "listening" && follow) return "Listening";
  return mode.toUpperCase();
}

export function deriveMode(input: {
  phase?: string | null;
  playback?: string | null;
  frozen?: CentreMode | null;
}): CentreMode {
  if (input.frozen) return input.frozen;
  if (input.playback === "pending" || input.playback === "playing") return "speaking";
  if (input.phase === "confirming") return "confirming";
  if (input.phase === "thinking") return "thinking";
  if (input.phase === "speaking") return "speaking";
  if (input.phase === "listening") return "listening";
  if (input.phase === "alert") return "alert";
  return "idle";
}

export function isFollowUp(phase: string | null | undefined, followUntil: number, now: number): boolean {
  return phase === "listening" && followUntil > now;
}

/** Corner orb only after a stretch of true idle. Working states stay in the centre. */
export function shouldShrink(mode: CentreMode, idleForMs: number, pinned: boolean): boolean {
  if (pinned || mode !== "idle") return false;
  return idleForMs >= 5000;
}

export function parseShot(search: string): { mode: CentreMode | null; theme: ThemeId | null; pin: boolean } {
  const params = new URLSearchParams(search);
  const raw = (params.get("shot") || "").toLowerCase();
  const modes: CentreMode[] = ["idle", "listening", "thinking", "speaking", "confirming", "alert"];
  const mode = modes.includes(raw as CentreMode) ? (raw as CentreMode) : null;
  const themeRaw = (params.get("theme") || raw).toLowerCase();
  const theme = themeRaw === "ultron" ? "ultron" : themeRaw === "jarvis" ? "jarvis" : null;
  return { mode: raw === "ultron" ? "idle" : mode, theme, pin: params.get("centre") === "1" || mode !== null || theme !== null };
}
