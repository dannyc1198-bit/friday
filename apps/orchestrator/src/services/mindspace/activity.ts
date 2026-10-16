// Live Mindspace status for the HUD. Memory is the durable copy; this is the lamp.

import { SPECIALISTS, voiceLabel, type SpecialistId } from "./specialists.js";

export type SpecialistStatus = "idle" | "working" | "done" | "blocked";

export interface SpecialistActivity {
  id: SpecialistId;
  name: string;
  glyph: string;
  role: string;
  adversarial: boolean;
  status: SpecialistStatus;
  lastTask: string;
  lastSummary: string;
  voiceLabel: string;
  edge: string;
  updatedAt: string | null;
}

const activity = new Map<SpecialistId, { status: SpecialistStatus; lastTask: string; lastSummary: string; updatedAt: string | null }>();

export function resetMindspaceActivity(): void {
  activity.clear();
}

export function markSpecialist(id: SpecialistId, patch: { status: SpecialistStatus; lastTask?: string; lastSummary?: string }, now = new Date()): void {
  const prev = activity.get(id);
  activity.set(id, {
    status: patch.status,
    lastTask: patch.lastTask ?? prev?.lastTask ?? "",
    lastSummary: patch.lastSummary ?? prev?.lastSummary ?? "",
    updatedAt: now.toISOString(),
  });
}

export function mindspaceSnapshot(now = new Date()): { friday: { name: "FRIDAY"; status: "orchestrating" | "idle" }; specialists: SpecialistActivity[]; asOf: string } {
  const working = SPECIALISTS.some((spec) => activity.get(spec.id)?.status === "working");
  return {
    friday: { name: "FRIDAY", status: working ? "orchestrating" : "idle" },
    asOf: now.toISOString(),
    specialists: SPECIALISTS.map((spec) => {
      const live = activity.get(spec.id);
      return {
        id: spec.id,
        name: spec.name,
        glyph: spec.glyph,
        role: spec.role,
        adversarial: spec.adversarial,
        status: live?.status || "idle",
        lastTask: live?.lastTask || "",
        lastSummary: live?.lastSummary || "",
        voiceLabel: voiceLabel(spec),
        edge: spec.voice.edge,
        updatedAt: live?.updatedAt || null,
      };
    }),
  };
}
