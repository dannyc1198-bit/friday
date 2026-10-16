// The last Mindspace speaker, held until the reply is spoken.

export interface MindspaceSpeaker {
  specialist: string;
  edge: string;
}

let pending: MindspaceSpeaker | null = null;

export function setMindspaceSpeaker(speaker: MindspaceSpeaker | null): void {
  pending = speaker;
}

export function takeMindspaceSpeaker(): MindspaceSpeaker | null {
  const speaker = pending;
  pending = null;
  return speaker;
}
