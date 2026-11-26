// Fast voice intent router. Free-form lines stay "general" so the existing
// brain can map them. Sending, spending, deleting, and shutdown never become
// a normal tool from this layer.

export type VoiceIntent =
  | { kind: "play"; query: string }
  | { kind: "media"; action: "pause" | "stop" | "next" | "previous" | "mute" }
  | { kind: "volume"; direction: "up" | "down" | "set"; level?: number }
  | { kind: "app"; action: "open" | "close" | "focus"; name: string }
  | { kind: "website"; url: string }
  | { kind: "system"; action: "screenshot" | "lock" }
  | { kind: "ear"; action: "mute" | "unmute" }
  | { kind: "computer"; action: "type"; text: string }
  | { kind: "computer"; action: "key"; key: string }
  | { kind: "computer"; action: "click"; x: number; y: number }
  | { kind: "coding"; task: string }
  | { kind: "destructive" }
  | { kind: "general"; text: string };

export const VOICE_BRAIN_PROMPT = `You map one spoken command onto one Friday tool. Reply with JSON only.
Allowed tools: open_app, close_app, focus_app, music_pause, music_stop, music_next, music_previous, music_mute, set_volume, take_screenshot, lock_screen, type_text.
Shape: {"tool":"open_app","args":{"name":"chrome"},"say":"Opening Chrome."}
If no tool fits: {"tool":null,"say":"a short spoken answer"}
Never choose a tool that sends a message, spends money, deletes files, or shuts the computer down.`;

export function routeVoiceIntent(transcript: string): VoiceIntent {
  const text = stripWake(transcript);
  if (!text) return { kind: "general", text: "" };
  if (isDestructive(text)) return { kind: "destructive" };

  if (/^(mute|stop listening|go to sleep)$/i.test(text)) return { kind: "ear", action: "mute" };
  if (/^(unmute|start listening)$/i.test(text)) return { kind: "ear", action: "unmute" };
  if (/^(take a screenshot|screenshot|screen shot)$/i.test(text)) return { kind: "system", action: "screenshot" };
  if (/^(lock|lock the computer|lock screen|lock the screen)$/i.test(text)) return { kind: "system", action: "lock" };

  const volume = volumeIntent(text);
  if (volume) return volume;
  const media = mediaIntent(text);
  if (media) return media;

  const click = /^click at (\d{1,5}) (\d{1,5})$/i.exec(text);
  if (click) return { kind: "computer", action: "click", x: Number(click[1]), y: Number(click[2]) };
  const key = /^press (enter|escape|tab|space)$/i.exec(text);
  if (key) return { kind: "computer", action: "key", key: key[1].toLowerCase() };
  const typed = /^type (.+)$/i.exec(text);
  if (typed) return { kind: "computer", action: "type", text: typed[1].trim() };

  const site = /^(?:please\s+)?(?:open|launch|go to)\s+(\S+)$/i.exec(text);
  if (site) {
    const url = asUrl(site[1]);
    if (url) return { kind: "website", url };
  }

  const app = /^(?:please\s+)?(open|start|launch|close|quit|kill|focus|switch to)\s+(.+)$/i.exec(text);
  if (app) {
    const name = app[2].replace(/[!.?]+$/g, "").trim().toLowerCase();
    const action = /^(close|quit|kill)$/i.test(app[1]) ? "close" : /^(focus|switch to)$/i.test(app[1]) ? "focus" : "open";
    if (name && !asUrl(name)) return { kind: "app", action, name };
  }

  const play = /^(?:please\s+)?(?:play|put on|queue)(?:\s+me)?\s+(.+)$/i.exec(text);
  if (play) {
    const query = play[1]
      .replace(/\s+(?:on|from)\s+youtube$/i, "")
      .replace(/\s+(?:song|video)$/i, "")
      .trim();
    if (query) return { kind: "play", query };
  }

  if (isCoding(text)) return { kind: "coding", task: text };
  return { kind: "general", text };
}

export function isApproval(text: string): boolean {
  return /^(yes|yeah|yep|do it|confirm|go ahead|apply it|apply that|do that)$/i.test(text.trim());
}

export function isRefusal(text: string): boolean {
  return /^(no|nope|cancel|never mind|don't|do not)$/i.test(text.trim());
}

export function decisionFromBrain(raw: string): VoiceIntent | null {
  const parsed = extractJson(raw);
  if (!parsed) return null;
  const tool = parsed.tool == null ? "" : String(parsed.tool).trim();
  const say = typeof parsed.say === "string" ? parsed.say.trim() : "";
  const args = parsed.args && typeof parsed.args === "object" ? parsed.args as Record<string, unknown> : {};
  if (!tool || tool === "null") return { kind: "general", text: say };
  if (blockedTool(tool)) return { kind: "destructive" };

  if (tool === "open_app" || tool === "close_app" || tool === "focus_app") {
    const name = String(args.name || "").trim().toLowerCase();
    if (!name) return null;
    const action = tool === "close_app" ? "close" : tool === "focus_app" ? "focus" : "open";
    return { kind: "app", action, name };
  }
  if (tool === "music_pause") return { kind: "media", action: "pause" };
  if (tool === "music_stop") return { kind: "media", action: "stop" };
  if (tool === "music_next") return { kind: "media", action: "next" };
  if (tool === "music_previous") return { kind: "media", action: "previous" };
  if (tool === "music_mute") return { kind: "media", action: "mute" };
  if (tool === "set_volume") {
    const level = Number(args.percent);
    if (!Number.isFinite(level)) return null;
    return { kind: "volume", direction: "set", level };
  }
  if (tool === "take_screenshot") return { kind: "system", action: "screenshot" };
  if (tool === "lock_screen") return { kind: "system", action: "lock" };
  if (tool === "type_text") {
    const text = String(args.text || "").trim();
    if (!text) return null;
    return { kind: "computer", action: "type", text };
  }
  return null;
}

function stripWake(transcript: string): string {
  return transcript.trim().replace(/^(?:hey|ok|okay)\s+jarvis\b[,!.:\s]*/i, "").trim();
}

function isDestructive(text: string): boolean {
  if (/\b(delete|erase|format|wipe)\b/i.test(text)) return true;
  if (/\b(shut\s*down|shutdown|reboot)\b/i.test(text)) return true;
  if (/\brestart\b/i.test(text) && /\b(computer|pc|machine|windows)\b/i.test(text)) return true;
  if (/\b(send|email|e-mail)\b/i.test(text) && /\b(message|email|text|sms|invoice)\b/i.test(text)) return true;
  if (/\b(buy|purchase|pay|spend)\b/i.test(text)) return true;
  return false;
}

function isCoding(text: string): boolean {
  if (/\b(coding mode|code this|write code)\b/i.test(text)) return true;
  const verb = /\b(write|add|fix|implement|refactor|change|update|edit|build)\b/i.test(text);
  const noun = /\b(code|function|component|endpoint|bug|test|file|login|feature|page)\b/i.test(text);
  return verb && noun;
}

function mediaIntent(text: string): VoiceIntent | null {
  if (/^(pause|resume|play pause)$/i.test(text)) return { kind: "media", action: "pause" };
  if (/^(stop|stop the video|stop the music|stop the song)$/i.test(text)) return { kind: "media", action: "stop" };
  if (/^(next|next song|skip|skip song)$/i.test(text)) return { kind: "media", action: "next" };
  if (/^(previous|previous song|last song)$/i.test(text)) return { kind: "media", action: "previous" };
  if (/^(mute the music|mute the volume|mute the sound)$/i.test(text)) return { kind: "media", action: "mute" };
  return null;
}

function volumeIntent(text: string): VoiceIntent | null {
  if (/^(volume up|turn it up|louder)$/i.test(text)) return { kind: "volume", direction: "up" };
  if (/^(volume down|turn it down|quieter)$/i.test(text)) return { kind: "volume", direction: "down" };
  const set = /^set volume to (\d{1,3})$/i.exec(text);
  if (set) return { kind: "volume", direction: "set", level: Number(set[1]) };
  return null;
}

function asUrl(target: string): string | null {
  const clean = target.replace(/[!.?,]+$/g, "");
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(clean)) return `https://${clean}`;
  return null;
}

function blockedTool(name: string): boolean {
  return /(send|buy|sell|spend|pay|delete|shutdown|gmail|sms|trade|purchase|mail)/i.test(name);
}

function extractJson(raw: string): { tool?: unknown; args?: unknown; say?: unknown } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as { tool?: unknown; args?: unknown; say?: unknown };
    if (!value || typeof value !== "object") return null;
    return value;
  } catch {
    return null;
  }
}
