"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useResource } from "./useResource";

interface AppStatus {
  id: string;
  name: string;
  page: string;
  up: boolean;
  headline: string | null;
  source: string;
}

const SAMPLE = {
  apps: [
    { id: "gods-eye", name: "God's Eye", page: "/apps/gods-eye", up: true, headline: "SAMPLE", source: "sample" },
    { id: "osiris", name: "Osiris", page: "/apps/gods-eye", up: true, headline: "SAMPLE", source: "sample" },
    { id: "anatomy", name: "Body Anatomy", page: "/apps/anatomy", up: true, headline: "SAMPLE", source: "sample" },
    { id: "sports", name: "Sports", page: "/apps/sports", up: true, headline: "SAMPLE", source: "sample" },
    { id: "xrp-desk", name: "XRP Desk", page: "/apps/xrp", up: true, headline: "SAMPLE", source: "sample" },
  ] as AppStatus[],
};

export function LiveAppsTiles() {
  const status = useResource<typeof SAMPLE>("/api/live-apps", SAMPLE);
  const { reload } = status;
  useEffect(() => {
    const timer = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Live apps</h2>
        <span className="text-xs text-faint">{status.error ? status.error : "Checked every 30 seconds"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {(status.data?.apps || []).map((app) => (
          <Link key={app.id} href={app.page} className="rounded-lg border border-line bg-panel p-4 hover:border-line-strong">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${app.up ? "bg-ok" : "bg-danger"}`} />
              <span className="text-sm font-medium text-ink">{app.name}</span>
              <span className={`ml-auto text-xs ${app.up ? "text-ok" : "text-danger"}`}>{app.up ? "Up" : "Down"}</span>
            </div>
            <p className="mt-2 text-lg font-semibold tracking-tight text-ink">{app.headline || (app.up ? "Running" : "Not answering")}</p>
            <p className="mt-1 truncate text-xs text-faint" title={app.source}>{app.source}</p>
          </Link>
        ))}
        {status.loading && !status.data && <p className="text-sm text-muted">Checking the apps…</p>}
      </div>
    </section>
  );
}