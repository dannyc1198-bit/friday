"use client";

// The embedded apps live in the shell, not in their pages, so switching tabs
// hides an app instead of reloading it. A frame mounts the first time its tab
// opens and stays mounted after that.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useDemo } from "@/components/deck/demo";
import { useResource } from "./useResource";

interface Frame {
  href: string;
  title: string;
  src: string;
  open: string;
}

const FRAMES: Frame[] = [
  { href: "/apps/gods-eye", title: "God's Eye", src: "http://127.0.0.1:5173/?embed=1", open: "http://127.0.0.1:5173" },
  { href: "/apps/anatomy", title: "Body Anatomy", src: "http://127.0.0.1:5180/", open: "http://127.0.0.1:5180" },
  { href: "/apps/sports", title: "Sports", src: "http://127.0.0.1:8800/", open: "http://127.0.0.1:8800" },
];

interface AppStatus {
  id: string;
  name: string;
  url: string;
  up: boolean;
  headline: string | null;
}

const SAMPLE = { apps: [] as AppStatus[] };

export function LiveFrames() {
  const path = usePathname();
  const { demo } = useDemo();
  const [seen, setSeen] = useState<string[]>([]);
  const current = FRAMES.find((frame) => path === frame.href || path.startsWith(`${frame.href}/`));

  useEffect(() => {
    if (current && !seen.includes(current.href)) setSeen((list) => [...list, current.href]);
  }, [current, seen]);

  if (!current && seen.length === 0) return null;

  return (
    <div className={current ? "absolute inset-0 flex flex-col bg-app" : "hidden"}>
      {demo && current && (
        <div className="m-6 rounded-lg border border-dashed border-brass/50 p-8 text-center text-sm text-muted">
          Demo mode hides the live {current.title} app. Turn Demo off to see it.
        </div>
      )}
      {!demo && current?.href === "/apps/gods-eye" && <OsirisBar />}
      {!demo && current && (
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel px-3 text-xs text-muted">
          <span>{current.title} · live at {current.open.replace("http://", "")}</span>
          <a href={current.open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brass hover:underline">
            Open full window <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
      {!demo && FRAMES.filter((frame) => seen.includes(frame.href)).map((frame) => (
        <iframe
          key={frame.href}
          title={frame.title}
          src={frame.src}
          allow="microphone; autoplay; fullscreen; geolocation"
          className={frame.href === current?.href ? "min-h-0 w-full flex-1 border-0" : "hidden"}
        />
      ))}
    </div>
  );
}

// Osiris sends X-Frame-Options SAMEORIGIN, so it opens in its own window.
function OsirisBar() {
  const status = useResource<typeof SAMPLE>("/api/live-apps", SAMPLE);
  const osiris = status.data?.apps?.find((app) => app.id === "osiris");
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-raised px-3 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${osiris?.up ? "bg-ok" : "bg-danger"}`} />
      <span className="text-ink">Osiris</span>
      <span className="text-muted">{status.loading ? "checking" : osiris?.up ? osiris.headline || "up" : "down"}</span>
      <a href="http://127.0.0.1:3005" target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-brass hover:underline">
        Open Osiris <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}