"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Moon, Heart, Activity, Dumbbell, Utensils, Coffee, Pill,
  RefreshCw, Plus, Scale, Wallet, Coins, AlertCircle, Loader2, Sparkles,
} from "lucide-react";

// ─── Types (kept inline — web + orchestrator are separate packages) ───
type Dimension =
  | "sleep" | "recovery" | "activity" | "training"
  | "nutrition" | "stimulants" | "supplements";

interface DayData {
  date: string;
  sleepHours?: number; restingHeartRate?: number; hrv?: number;
  steps?: number; activeEnergyKcal?: number;
  workoutMinutes?: number; isRestDay?: boolean;
  caloriesIn?: number; proteinG?: number;
  caffeineMg?: number;
  supplementsTaken?: number; supplementsPlanned?: number;
  weightLbs?: number; bodyFatPct?: number;
  netWorth?: number; cryptoValueUsd?: number;
  coachLine?: string;
}
interface DayScore {
  score: number; label: string;
  subs: Partial<Record<Dimension, number>>;
  present: Dimension[]; missing: Dimension[];
}
interface CaffeinePreset { label: string; mg: number; }
interface TodayResponse {
  day: DayData; score: DayScore; coach: string | null;
  config: { supplements: string[]; caffeinePresets: CaffeinePreset[] };
}

// ─── Helpers ──────────────────────────────────────────────────────────
const bandColor = (n: number | null | undefined) =>
  n == null ? "#274656" : n >= 80 ? "#22c55e" : n >= 60 ? "#00D4FF" : n >= 40 ? "#f59e0b" : "#ef4444";

const DIMS: { key: Dimension; label: string; icon: JSX.Element; raw: (d: DayData) => string; hint: string }[] = [
  { key: "sleep", label: "Sleep", icon: <Moon className="w-3.5 h-3.5" />, raw: (d) => (d.sleepHours != null ? `${d.sleepHours} h` : ""), hint: "Add a sleep app (Sleep Cycle) or log it below" },
  { key: "recovery", label: "Recovery", icon: <Heart className="w-3.5 h-3.5" />, raw: (d) => [d.restingHeartRate != null ? `${d.restingHeartRate} bpm` : "", d.hrv != null ? `${d.hrv} ms` : ""].filter(Boolean).join(" · "), hint: "Weigh in on the Hume for a heart reading" },
  { key: "activity", label: "Activity", icon: <Activity className="w-3.5 h-3.5" />, raw: (d) => (d.steps != null ? `${d.steps.toLocaleString()} steps` : ""), hint: "Carry your iPhone — steps sync via the bridge" },
  { key: "training", label: "Training", icon: <Dumbbell className="w-3.5 h-3.5" />, raw: (d) => (d.isRestDay ? "rest day" : d.workoutMinutes != null ? `${d.workoutMinutes} min` : ""), hint: "Log a workout below or via Apple Fitness" },
  { key: "nutrition", label: "Nutrition", icon: <Utensils className="w-3.5 h-3.5" />, raw: (d) => (d.proteinG != null ? `${d.proteinG} g protein` : ""), hint: "Log protein below or via a food app" },
  { key: "stimulants", label: "Stimulants", icon: <Coffee className="w-3.5 h-3.5" />, raw: (d) => (d.caffeineMg != null ? `${d.caffeineMg} mg` : ""), hint: "Tap a caffeine button when you drink one" },
  { key: "supplements", label: "Supplements", icon: <Pill className="w-3.5 h-3.5" />, raw: (d) => (d.supplementsPlanned ? `${d.supplementsTaken ?? 0}/${d.supplementsPlanned}` : ""), hint: "Tick your stack below" },
];

// ─── Score ring ───────────────────────────────────────────────────────
function ScoreRing({ score, label, hasData }: { score: number; label: string; hasData: boolean }) {
  const r = 70, circ = 2 * Math.PI * r;
  const pct = hasData ? Math.max(0, Math.min(100, score)) : 0;
  const color = hasData ? bandColor(score) : "#274656";
  return (
    <svg width={184} height={184} viewBox="0 0 184 184">
      <circle cx={92} cy={92} r={r} fill="none" stroke="#0a2a3a" strokeWidth={11} />
      <circle
        cx={92} cy={92} r={r} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
        style={{ transition: "stroke-dashoffset 1.1s ease, stroke 0.4s", transform: "rotate(-90deg)", transformOrigin: "center", filter: `drop-shadow(0 0 9px ${color}66)` }}
      />
      <text x={92} y={90} textAnchor="middle" fill="#E3F2FD" fontSize={48} fontWeight={700} fontFamily="ui-monospace, monospace">{hasData ? score : "—"}</text>
      <text x={92} y={116} textAnchor="middle" fill={color} fontSize={12} fontFamily="ui-monospace, monospace" letterSpacing={2} style={{ textTransform: "uppercase" }}>{hasData ? label : "No data yet"}</text>
    </svg>
  );
}

// ─── Dimension card ───────────────────────────────────────────────────
function DimCard({ icon, label, sub, raw }: { icon: JSX.Element; label: string; sub?: number; raw: string }) {
  const has = sub != null;
  const color = bandColor(sub);
  return (
    <div className="rounded-xl bg-[#0a1a2a]/70 border border-[#1565C0]/20 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[#4FC3F7]">{icon}<span className="text-[10px] font-mono uppercase tracking-wider">{label}</span></span>
        <span className="text-xs font-mono font-bold" style={{ color }}>{has ? Math.round(sub!) : "—"}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#0a2a3a] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${has ? sub : 0}%`, backgroundColor: color, transition: "width 0.8s ease", boxShadow: `0 0 6px ${color}66` }} />
      </div>
      <span className={`text-[11px] font-mono ${has ? "text-[#E3F2FD]/80" : "text-[#4FC3F7]/40 italic"}`}>{has ? raw || "logged" : "feed me"}</span>
    </div>
  );
}

function StateCard({ icon, label, value, sub }: { icon: JSX.Element; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-[#0a1a2a]/50 border border-[#1565C0]/15 p-3">
      <span className="flex items-center gap-1.5 text-[#4FC3F7] mb-1">{icon}<span className="text-[9px] font-mono uppercase tracking-wider">{label}</span></span>
      <div className="text-lg font-mono font-bold text-[#E3F2FD]">{value}</div>
      <div className="text-[9px] font-mono text-[#4FC3F7]/60 uppercase tracking-wider">{sub}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [error, setError] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [manual, setManual] = useState({ sleepHours: "", workoutMinutes: "", proteinG: "" });

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) { setError(true); return; }
      setData(await res.json());
      setError(false);
    } catch { setError(true); }
  }, []);

  const refreshCoach = useCallback(async () => {
    setCoachBusy(true);
    try {
      const res = await fetch("/api/dashboard/coach", { method: "POST" });
      if (res.ok) {
        const j = await res.json();
        setData((d) => (d ? { ...d, coach: j.coach ?? d.coach } : d));
      }
    } catch { /* keep prior coach line */ } finally { setCoachBusy(false); }
  }, []);

  // Initial load + 20s polling for live data (coach is NOT polled — it's an LLM call).
  useEffect(() => {
    fetchToday();
    const id = setInterval(fetchToday, 20_000);
    return () => clearInterval(id);
  }, [fetchToday]);

  // Auto-generate a coach line once if today doesn't have one yet but has data.
  useEffect(() => {
    if (data && !data.coach && data.score.present.length > 0 && !coachBusy) refreshCoach();
  }, [data, coachBusy, refreshCoach]);

  // Seed the supplement checkboxes from the stored count, but never clobber
  // the user's toggles on a poll refresh.
  useEffect(() => {
    if (!data) return;
    const n = data.config.supplements.length;
    setChecked((prev) => {
      if (prev.length === n) return prev;
      const taken = data.day.supplementsTaken || 0;
      return Array.from({ length: n }, (_, i) => i < taken);
    });
  }, [data]);

  const postLog = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/dashboard/log", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) { setNote("Log failed — is the orchestrator running?"); return false; }
      await fetchToday();
      return true;
    } catch { setNote("Offline — that didn't save"); return false; }
  }, [fetchToday]);

  const toggleSupp = async (i: number) => {
    const next = checked.slice(); next[i] = !next[i];
    setChecked(next);
    await postLog({ kind: "supplements", taken: next.filter(Boolean).length, planned: next.length });
  };

  const saveManual = async () => {
    const payload: Record<string, unknown> = { kind: "manual" };
    if (manual.sleepHours) payload.sleepHours = Number(manual.sleepHours);
    if (manual.workoutMinutes) payload.workoutMinutes = Number(manual.workoutMinutes);
    if (manual.proteinG) payload.proteinG = Number(manual.proteinG);
    if (Object.keys(payload).length === 1) { setNote("Nothing to log"); return; }
    if (await postLog(payload)) { setManual({ sleepHours: "", workoutMinutes: "", proteinG: "" }); setNote("Logged ✓"); }
  };

  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 2600); return () => clearTimeout(t); } }, [note]);

  // ── Render states ──
  if (!data && error) {
    return (
      <main className="min-h-screen bg-[#06121f] flex flex-col items-center justify-center text-center px-6">
        <AlertCircle className="w-8 h-8 text-[#ef4444] mb-3" />
        <p className="text-[#E3F2FD] font-mono">Can't reach FRIDAY.</p>
        <p className="text-[#4FC3F7]/70 font-mono text-sm mt-1">Start the orchestrator (port 3001), then refresh.</p>
        <button onClick={fetchToday} className="mt-4 px-4 py-2 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF] font-mono text-sm">Retry</button>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen bg-[#06121f] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#00D4FF] animate-spin" />
      </main>
    );
  }

  const { day, score, config } = data;
  const hasData = score.present.length > 0;
  const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#06121f] to-[#0a1a2a] text-[#E3F2FD] pb-16">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">

        {/* Header */}
        <header className="flex items-center justify-between pt-6 pb-4">
          <div>
            <h1 className="font-mono font-bold tracking-[0.3em] text-[#00D4FF] text-sm">FRIDAY</h1>
            <p className="font-mono text-[11px] text-[#4FC3F7]/70">{dateLabel}</p>
          </div>
          <span className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${error ? "text-[#f59e0b]" : "text-[#22c55e]"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${error ? "bg-[#f59e0b]" : "bg-[#22c55e]"}`} />
            {error ? "reconnecting" : "live"}
          </span>
        </header>

        {/* Score hero */}
        <section className="flex flex-col items-center pt-2 pb-5">
          <ScoreRing score={score.score} label={score.label} hasData={hasData} />
          <div className="mt-4 w-full rounded-2xl bg-[#0a1a2a]/70 border border-[#1565C0]/20 p-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-[#4FC3F7] text-[10px] font-mono uppercase tracking-widest"><Sparkles className="w-3.5 h-3.5" /> Today's edge</span>
              <button onClick={refreshCoach} disabled={coachBusy} className="text-[#4FC3F7]/70 hover:text-[#00D4FF] disabled:opacity-40">
                <RefreshCw className={`w-3.5 h-3.5 ${coachBusy ? "animate-spin" : ""}`} />
              </button>
            </div>
            <p className="font-mono text-sm leading-relaxed text-[#E3F2FD]">
              {data.coach || (coachBusy ? "Reading your day…" : "Tap refresh for today's coaching.")}
            </p>
          </div>
        </section>

        {/* Dimension cards */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {DIMS.map((dm) => (
            <DimCard key={dm.key} icon={dm.icon} label={dm.label} sub={score.subs[dm.key]} raw={dm.raw(day)} />
          ))}
        </section>

        {/* Context (state, not graded) */}
        <h2 className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-widest text-[#4FC3F7]/70">Body &amp; Money · context, not graded</h2>
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StateCard icon={<Scale className="w-3 h-3" />} label="Weight" value={day.weightLbs != null ? `${day.weightLbs}` : "—"} sub="goal 170 lb" />
          <StateCard icon={<Activity className="w-3 h-3" />} label="Body fat" value={day.bodyFatPct != null ? `${day.bodyFatPct}%` : "—"} sub="Hume" />
          <StateCard icon={<Wallet className="w-3 h-3" />} label="Net worth" value={day.netWorth != null ? `$${day.netWorth.toLocaleString()}` : "—"} sub="bank" />
          <StateCard icon={<Coins className="w-3 h-3" />} label="Crypto" value={day.cryptoValueUsd != null ? `$${day.cryptoValueUsd.toLocaleString()}` : "—"} sub="live" />
        </section>

        {/* Quick log */}
        <h2 className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-widest text-[#4FC3F7]/70">Quick log</h2>
        <section className="space-y-3">

          {/* Caffeine */}
          <div className="rounded-xl bg-[#0a1a2a]/70 border border-[#1565C0]/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[#4FC3F7] text-[10px] font-mono uppercase tracking-wider"><Coffee className="w-3.5 h-3.5" /> Caffeine</span>
              <span className="font-mono text-xs text-[#E3F2FD]">{day.caffeineMg ?? 0} mg today</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.caffeinePresets.map((p) => (
                <button key={p.label} onClick={() => postLog({ kind: "caffeine", preset: p.label })}
                  className="px-2.5 py-1.5 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/25 text-[#00D4FF] font-mono text-xs hover:bg-[#00D4FF]/20 active:scale-95 transition">
                  + {p.label} <span className="opacity-60">{p.mg}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Supplements */}
          <div className="rounded-xl bg-[#0a1a2a]/70 border border-[#1565C0]/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[#4FC3F7] text-[10px] font-mono uppercase tracking-wider"><Pill className="w-3.5 h-3.5" /> Supplements</span>
              <span className="font-mono text-xs text-[#E3F2FD]">{checked.filter(Boolean).length}/{config.supplements.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.supplements.map((s, i) => {
                const on = checked[i];
                return (
                  <button key={s} onClick={() => toggleSupp(i)}
                    className={`px-2.5 py-1.5 rounded-lg font-mono text-xs border active:scale-95 transition ${on ? "bg-[#22c55e]/15 border-[#22c55e]/40 text-[#22c55e]" : "bg-[#0a2a3a]/40 border-[#1565C0]/20 text-[#4FC3F7]/70"}`}>
                    {on ? "✓ " : ""}{s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual (until apps/bridge feed these automatically) */}
          <div className="rounded-xl bg-[#0a1a2a]/70 border border-[#1565C0]/20 p-3">
            <span className="flex items-center gap-1.5 text-[#4FC3F7] text-[10px] font-mono uppercase tracking-wider mb-2"><Plus className="w-3.5 h-3.5" /> Manual entry</span>
            <div className="grid grid-cols-3 gap-2">
              {([["sleepHours", "Sleep h"], ["workoutMinutes", "Train min"], ["proteinG", "Protein g"]] as const).map(([k, lbl]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#4FC3F7]/60">{lbl}</span>
                  <input type="number" inputMode="decimal" value={manual[k]} onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value }))}
                    className="bg-[#06121f] border border-[#1565C0]/30 rounded-lg px-2 py-1.5 font-mono text-sm text-[#E3F2FD] focus:border-[#00D4FF]/60 outline-none" />
                </label>
              ))}
            </div>
            <button onClick={saveManual} className="mt-2.5 w-full py-2 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF] font-mono text-sm hover:bg-[#00D4FF]/20 active:scale-[0.99] transition">Save</button>
          </div>
        </section>

        {/* Blind spots */}
        {score.missing.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 font-mono text-[10px] uppercase tracking-widest text-[#4FC3F7]/70">Blind spots · {score.missing.length}</h2>
            <section className="space-y-1.5">
              {score.missing.map((key) => {
                const meta = DIMS.find((d) => d.key === key)!;
                return (
                  <div key={key} className="flex items-center gap-2 rounded-lg bg-[#0a1a2a]/40 border border-[#1565C0]/10 px-3 py-2">
                    <span className="text-[#4FC3F7]/40">{meta.icon}</span>
                    <span className="font-mono text-[11px] text-[#E3F2FD]/70 w-20">{meta.label}</span>
                    <span className="font-mono text-[11px] text-[#4FC3F7]/50 flex-1">{meta.hint}</span>
                  </div>
                );
              })}
            </section>
          </>
        )}

        <p className="mt-8 text-center font-mono text-[10px] text-[#4FC3F7]/40">FRIDAY scores your behaviour, not your bank balance. Feed the streams, trust the number.</p>
      </div>

      {/* Toast */}
      {note && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-[#0a1a2a] border border-[#00D4FF]/30 text-[#E3F2FD] font-mono text-xs shadow-lg">{note}</div>
      )}
    </main>
  );
}
