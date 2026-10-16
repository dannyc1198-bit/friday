"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { APP_TABS, stepTab, tabIndex } from "@/lib/app-tabs";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function TabStrip() {
  const path = usePathname();
  const router = useRouter();
  const active = tabIndex(path);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const step =
        (event.ctrlKey && event.key === "Tab") ? (event.shiftKey ? -1 : 1)
        : (event.altKey && event.key === "ArrowRight") ? 1
        : (event.altKey && event.key === "ArrowLeft") ? -1
        : 0;
      if (step) {
        event.preventDefault();
        router.push(stepTab(path, step));
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[1-6]$/.test(event.key) && !typing(event.target)) {
        event.preventDefault();
        router.push(APP_TABS[Number(event.key) - 1].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, router]);

  return (
    <nav aria-label="Apps" className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-line bg-panel px-3">
      {APP_TABS.map((tab, index) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={index === active ? "page" : undefined}
          className={`flex h-9 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm ${index === active ? "border-brass font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          <span className="font-mono text-[10px] text-faint">{index + 1}</span>
          {tab.label}
        </Link>
      ))}
      <span className="ml-auto hidden self-center whitespace-nowrap text-[11px] text-faint lg:inline">1–6 · Alt ← → · Ctrl Tab</span>
    </nav>
  );
}