// Nightly reflection walks the day in order and remembers where it stopped.
// A 21:30 pass must not mark later conversations as already reflected.

export interface ReflectionTurn {
  iso: string;
  role: string;
  content: string;
  source: string;
}

export interface ReflectionWindow {
  selected: ReflectionTurn[];
  text: string;
  nextWatermark: string | null;
  complete: boolean;
}

export function turnKey(turn: ReflectionTurn): string {
  return `${turn.iso}|${turn.source}`;
}

export function selectReflectionWindow(
  turns: ReflectionTurn[],
  watermark: string | null,
  maxChars: number
): ReflectionWindow {
  const pending = turns
    .filter((turn) => !watermark || turnKey(turn) > watermark)
    .slice()
    .sort((a, b) => turnKey(a).localeCompare(turnKey(b)));
  if (pending.length === 0) {
    return { selected: [], text: "", nextWatermark: watermark, complete: true };
  }
  const selected: ReflectionTurn[] = [];
  let text = "";
  for (const turn of pending) {
    const line = `[${turn.iso}] ${turn.role}: ${turn.content}\n(source ${turn.source})\n`;
    if (text.length + line.length > maxChars && selected.length > 0) {
      return {
        selected,
        text,
        nextWatermark: turnKey(selected[selected.length - 1]),
        complete: false,
      };
    }
    text += line;
    selected.push(turn);
  }
  return {
    selected,
    text,
    nextWatermark: turnKey(selected[selected.length - 1]),
    complete: true,
  };
}
