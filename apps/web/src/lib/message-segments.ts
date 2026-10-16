// Safe display segments. Links are http(s) only. Vault notes become chips.

export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "link"; href: string; label: string }
  | { type: "note"; note: string; label: string };

const SAFE_LINK = /^https?:\/\//i;

function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function messageSegments(input: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|(https?:\/\/[^\s)]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    const index = match.index;
    if (index > cursor) segments.push({ type: "text", text: input.slice(cursor, index) });
    if (match[1] && match[2]) {
      const href = safeHref(match[2]);
      if (href) segments.push({ type: "link", href, label: match[1] });
      else segments.push({ type: "text", text: match[0] });
    } else if (match[3]) {
      segments.push({ type: "note", note: match[3].trim(), label: (match[4] || match[3]).trim() });
    } else if (match[5]) {
      const href = safeHref(match[5]);
      if (href && SAFE_LINK.test(href)) segments.push({ type: "link", href, label: href });
      else segments.push({ type: "text", text: match[0] });
    }
    cursor = index + match[0].length;
  }
  if (cursor < input.length) segments.push({ type: "text", text: input.slice(cursor) });
  return segments;
}

export function obsidianOpenHref(note: string): string {
  return `obsidian://open?file=${encodeURIComponent(note)}`;
}
