"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  Bone,
  Globe2,
  Trophy,
  Users,
  Building2,
  Clapperboard,
  GraduationCap,
  Hexagon,
  Home,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquare,
  Moon,
  PanelLeft,
  Search,
  Settings,
  Sun,
  Wrench,
  X,
} from "lucide-react";
import { useDemo } from "@/components/deck/demo";
import { applyTheme, readTheme, type ThemeName } from "./theme";
import { useResource } from "./useResource";
import { TabStrip } from "./TabStrip";
import { LiveFrames } from "./LiveFrames";
import { BootIntro } from "./BootIntro";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/brain-core", label: "Brain", icon: Activity },
  { href: "/mindspace", label: "Mindspace", icon: Hexagon },
  { href: "/talk", label: "Talk", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
];

const BUSINESSES: NavItem[] = [
  { href: "/businesses/wavelength", label: "Wavelength", icon: Building2 },
  { href: "/businesses/property", label: "Property", icon: Home },
  { href: "/businesses/ally", label: "Ally", icon: Building2 },
];

const REST: NavItem[] = [
  { href: "/content", label: "Content", icon: Clapperboard },
  { href: "/learning", label: "Learning", icon: GraduationCap },
  { href: "/repairs", label: "Repairs", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

const LIVE: NavItem[] = [
  { href: "/apps/gods-eye", label: "God's Eye", icon: Globe2 },
  { href: "/apps/anatomy", label: "Body Anatomy", icon: Bone },
  { href: "/apps/sports", label: "Sports", icon: Trophy },
];

const ALL = PRIMARY.concat(LIVE, BUSINESSES, REST);

interface AlertRow {
  id: string;
  title: string;
  message: string;
  priority: string;
}

const SAMPLE_ALERTS = {
  alerts: [
    {
      id: "sample-alert",
      title: "SAMPLE · Quiet",
      message: "Sample notification. Nothing was spoken.",
      priority: "low",
    },
  ],
};

const SAMPLE_HEALTH = {
  ok: true,
  llm: { provider: "sample", model: "sample", configured: true },
  tts: true,
};

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { demo, toggle } = useDemo();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const alerts = useResource<{ alerts?: AlertRow[] }>("/api/proactive/alerts", SAMPLE_ALERTS);
  const health = useResource<typeof SAMPLE_HEALTH>("/api/health", SAMPLE_HEALTH);

  useEffect(() => {
    const stored = window.localStorage.getItem("friday-nav");
    setCollapsed(stored === "1");
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !event.repeat) {
        event.preventDefault();
        setMenuOpen(true);
        setQuery("");
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNotesOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ALL;
    return ALL.filter((item) => item.label.toLowerCase().includes(needle) || item.href.includes(needle));
  }, [query]);

  function toggleNav() {
    setCollapsed((value) => {
      window.localStorage.setItem("friday-nav", value ? "0" : "1");
      return !value;
    });
  }

  function switchTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  const brain = demo ? "Sample" : health.data?.llm?.configured ? health.data.llm.provider : health.error ? "Offline" : "No key";
  const voice = demo ? "Sample" : health.data?.tts ? "Ready" : health.error ? "Offline" : "Browser";
  const noteCount = alerts.data?.alerts?.length || 0;

  return (
    <div className="flex h-screen bg-app stark-grid font-sans text-ink">
      <BootIntro />
      {mobileOpen && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-ink/40 md:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`${mobileOpen ? "fixed inset-y-0 left-0 z-40 flex" : "hidden md:flex"} ${collapsed ? "w-14" : "w-60"} shrink-0 flex-col border-r border-line bg-panel`}>
        <div className="flex h-14 items-center gap-2 border-b border-line px-3">
          <span className="h-3 w-3 shrink-0 rounded-full bg-info shadow-[0_0_10px_3px_rgba(94,220,255,0.6)] ring-1 ring-brass" aria-hidden />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Friday</span>}
        </div>
        <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <NavList items={PRIMARY} path={path} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
          <p className={`px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-faint ${collapsed ? "sr-only" : ""}`}>Live apps</p>
          <NavList items={LIVE} path={path} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
          <p className={`px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-faint ${collapsed ? "sr-only" : ""}`}>Businesses</p>
          <NavList items={BUSINESSES} path={path} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
          <div className="mt-3">
            <NavList items={REST} path={path} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
          </div>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="stark-bar flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 md:px-4">
          <button type="button" className="rounded p-2 text-muted hover:bg-raised hover:text-ink md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu className="h-4 w-4" />
          </button>
          <button type="button" className="hidden rounded p-2 text-muted hover:bg-raised hover:text-ink md:inline-flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleNav}>
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(true);
              setQuery("");
            }}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-app px-3 text-left text-sm text-faint hover:border-line-strong md:max-w-md"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Search</span>
            <span className="ml-auto hidden font-mono text-[10px] sm:inline">Ctrl K</span>
          </button>
          <StatusPill label="Brain" value={brain} warn={!demo && !health.data?.llm?.configured} />
          <StatusPill label="Voice" value={voice} warn={false} />
          <button
            type="button"
            aria-pressed={demo}
            onClick={toggle}
            className={`h-8 rounded-full border px-2.5 text-xs font-medium ${demo ? "border-brass text-brass" : "border-line text-muted hover:text-ink"}`}
          >
            {demo ? "Demo on" : "Demo"}
          </button>
          <button type="button" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} onClick={switchTheme} className="rounded p-2 text-muted hover:bg-raised hover:text-ink">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="relative">
            <button type="button" aria-label="Notifications" aria-expanded={notesOpen} onClick={() => setNotesOpen((open) => !open)} className="relative rounded p-2 text-muted hover:bg-raised hover:text-ink">
              <Bell className="h-4 w-4" />
              {noteCount > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brass" />}
            </button>
            {notesOpen && (
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-panel p-2 shadow-lg">
                <p className="px-2 py-1 text-xs font-medium text-muted">{demo ? "Sample notifications" : "Notifications"}</p>
                {(alerts.data?.alerts || []).length === 0 && <p className="px-2 py-3 text-sm text-muted">No unread alerts.</p>}
                {(alerts.data?.alerts || []).map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    className="block w-full rounded px-2 py-2 text-left hover:bg-raised"
                    onClick={() => {
                      if (demo) return;
                      void fetch(`/api/proactive/alerts/${encodeURIComponent(alert.id)}/read`, { method: "POST" }).then(() => alerts.reload());
                    }}
                  >
                    <span className="block text-sm text-ink">{alert.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{alert.message}</span>
                  </button>
                ))}
                {alerts.error && <p className="px-2 py-2 text-xs text-danger">{alerts.error}</p>}
              </div>
            )}
          </div>
        </header>
        {demo && (
          <p className="border-b border-brass/40 bg-brass/10 px-4 py-2 text-center text-xs font-medium text-brass">
            Demo · sample data · nothing is sent
          </p>
        )}
        <TabStrip />
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          {children}
          <LiveFrames />
        </main>
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[12vh]" onClick={() => setMenuOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-lg overflow-hidden rounded-lg border border-line bg-panel shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="h-4 w-4 text-faint" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Jump to a page"
                aria-label="Search pages"
                className="h-12 w-full bg-transparent text-sm text-ink outline-none"
              />
              <button type="button" aria-label="Close search" onClick={() => setMenuOpen(false)} className="text-faint hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto p-1">
              {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No pages match.</li>}
              {matches.map((item) => (
                <li key={item.href}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink hover:bg-raised"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <item.icon className="h-4 w-4 text-faint" />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ label, value, warn }: { label: string; value: string; warn: boolean }) {
  return (
    <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs lg:inline-flex ${warn ? "border-warn/50 text-warn" : "border-line text-muted"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${warn ? "bg-warn" : "bg-ok"}`} />
      {label}
      <span className="text-ink">{value}</span>
    </span>
  );
}

function NavList({
  items,
  path,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  path: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <ul className="grid gap-0.5">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              title={item.label}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center gap-2 rounded-md px-2 text-sm ${active ? "bg-raised font-medium text-ink" : "text-muted hover:bg-raised hover:text-ink"} ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-brass" : ""}`} />
              {!collapsed && item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
