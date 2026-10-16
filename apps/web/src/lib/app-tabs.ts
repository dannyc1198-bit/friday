// The top tab strip: Overview, Agents, God's Eye, Body Anatomy, Sports.
// Keyboard and voice both switch tabs through these helpers.

export interface AppTab {
  href: string;
  label: string;
  words: string[];
}

export const APP_TABS: AppTab[] = [
  { href: "/", label: "Overview", words: ["overview", "home", "dashboard"] },
  { href: "/agents", label: "Agents", words: ["agents", "agent", "team", "mindspace"] },
  { href: "/apps/gods-eye", label: "God's Eye", words: ["god's eye", "gods eye", "god eye", "osiris", "globe"] },
  { href: "/apps/anatomy", label: "Body Anatomy", words: ["anatomy", "body"] },
  { href: "/apps/sports", label: "Sports", words: ["sports", "sport", "games", "scores"] },
];

export function tabIndex(path: string): number {
  if (path === "/") return 0;
  return APP_TABS.findIndex((tab, index) => index > 0 && (path === tab.href || path.startsWith(`${tab.href}/`)));
}

export function stepTab(path: string, delta: number): string {
  const current = Math.max(0, tabIndex(path));
  const next = (current + delta + APP_TABS.length) % APP_TABS.length;
  return APP_TABS[next].href;
}

// "next tab", "previous tab", "show God's Eye", "open anatomy", "go to sports".
export function parseTabCommand(text: string, path: string): string | null {
  const clean = text.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean.split(" ").length > 7) return null;
  if (/\b(next|forward) tab\b/.test(clean)) return stepTab(path, 1);
  if (/\b(previous|last|back a) tab\b/.test(clean)) return stepTab(path, -1);
  const verb = /^(friday )?(show( me)?|open|go to|switch to|take me to|bring up)\b/;
  if (!verb.test(clean)) return null;
  const rest = clean.replace(verb, " ").trim();
  for (const tab of APP_TABS) {
    if (tab.words.some((word) => rest.includes(word))) return tab.href;
  }
  return null;
}