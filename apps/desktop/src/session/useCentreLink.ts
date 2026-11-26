import { useEffect, useRef } from "react";
import { fillBands, smoothToward, speechEnergy, rmsFromTimeDomain } from "../lib/audio";
import { deriveMode, isFollowUp, parseShot, shouldShrink, type CentreMode } from "../lib/presentation";
import { live, useCentre, type Caption } from "../store";

const DEMO: Record<CentreMode, Caption[]> = {
  idle: [
    { role: "you", text: "Hey Jarvis, keep the room quiet." },
    { role: "jarvis", text: "Standing by." },
  ],
  listening: [{ role: "you", text: "Hey Jarvis" }],
  thinking: [
    { role: "you", text: "Open the workshop notes and read the first line." },
    { role: "jarvis", text: "Looking." },
  ],
  speaking: [
    { role: "you", text: "How does the core look?" },
    { role: "jarvis", text: "Warm, and moving with the voice." },
  ],
  confirming: [
    { role: "you", text: "Send that note to Sam." },
    { role: "jarvis", text: "Say yes to send that message." },
  ],
  alert: [{ role: "jarvis", text: "The link to the orchestrator dropped." }],
};

interface EarState {
  phase?: string;
  heard?: string;
  say?: string;
  micLevel?: number;
  followUntil?: number;
  theme?: "jarvis" | "ultron";
  settingsOpen?: boolean;
  transcript?: Caption[];
  speech?: { id: string; text: string; playback: string } | null;
  alert?: string | null;
}

function shellKind(): "centre" | "orb" {
  if (window.jarvis?.shell === "orb" || window.location.hash === "#orb") return "orb";
  return "centre";
}

export function useCentreLink() {
  const source = useRef<AudioBufferSourceNode | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const expect = useRef<string | null>(null);
  const idleSince = useRef<number | null>(null);
  const prev = useRef<CentreMode>("idle");

  useEffect(() => {
    const shot = parseShot(window.location.search);
    useCentre.getState().patch({ shell: shellKind() });
    if (shot.mode) {
      useCentre.getState().patch({ mode: shot.mode, pinned: true, lines: DEMO[shot.mode], follow: shot.mode === "listening" });
    }
    if (shot.theme) useCentre.getState().patch({ theme: shot.theme, pinned: true });

    const offEvent = window.jarvis?.onEvent((raw) => {
      let message: { type?: string; status?: EarState; id?: string };
      try { message = JSON.parse(raw) as { type?: string; status?: EarState; id?: string }; }
      catch { return; }
      if (message.type === "interrupt") {
        stopPlayback();
        return;
      }
      if (message.type === "audio" && message.id) {
        expect.current = message.id;
        useCentre.getState().setMode("speaking");
        return;
      }
      if (message.type === "state" && message.status) apply(message.status);
    });

    const offAudio = window.jarvis?.onAudio((payload) => {
      const id = expect.current;
      if (!id) return;
      expect.current = null;
      const view = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
      const bytes = new ArrayBuffer(view.byteLength);
      new Uint8Array(bytes).set(view);
      void playMpeg(id, bytes);
    });

    const offHotkey = window.jarvis?.onHotkey((action) => {
      if (action === "settings") {
        useCentre.getState().toggleSettings();
        window.jarvis?.layout("centre");
      }
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.code === "KeyJ") {
        useCentre.getState().toggleSettings();
        window.jarvis?.layout("centre");
      }
    };
    window.addEventListener("keydown", onKey);
    const onClick = () => {
      live.ripple = 1;
      useCentre.getState().setMode("listening");
      void window.jarvis?.arm();
    };
    window.addEventListener("jarvis-orb-click", onClick);

    const clock = window.setInterval(() => {
      const state = useCentre.getState();
      const now = new Date();
      state.patch({ clock: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
      if (state.shell !== "centre" || state.pinned) return;
      if (state.mode === "idle") {
        idleSince.current = idleSince.current ?? Date.now();
        if (shouldShrink("idle", Date.now() - idleSince.current, false)) window.jarvis?.layout("orb");
      } else {
        idleSince.current = null;
        window.jarvis?.layout("centre");
      }
    }, 250);

    const demo = window.setInterval(() => {
      const state = useCentre.getState();
      if (state.online || state.pinned) return;
      const order: CentreMode[] = ["idle", "listening", "thinking", "speaking", "confirming", "alert"];
      const next = order[(order.indexOf(state.mode) + 1) % order.length];
      state.patch({ mode: next, lines: DEMO[next], follow: next === "listening" });
    }, 4200);

    const vitals = window.setInterval(() => { void refreshVitals(); }, 4000);
    void refreshVitals();

    const freq = new Uint8Array(256);
    const time = new Uint8Array(1024);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const node = analyser.current;
      if (!node) return;
      node.getByteFrequencyData(freq);
      node.getByteTimeDomainData(time);
      fillBands(freq, live.bins);
      live.mouth = smoothToward(live.mouth, speechEnergy(rmsFromTimeDomain(time)), 0.4);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      offEvent?.();
      offAudio?.();
      offHotkey?.();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("jarvis-orb-click", onClick);
      window.clearInterval(clock);
      window.clearInterval(demo);
      window.clearInterval(vitals);
      cancelAnimationFrame(frame);
      stopPlayback();
    };
  }, []);

  function apply(status: EarState) {
    const frozen = parseShot(window.location.search).mode;
    const mode = deriveMode({
      phase: status.phase,
      playback: status.speech?.playback,
      frozen,
    });
    const follow = isFollowUp(status.phase, status.followUntil || 0, Date.now());
    if (!frozen && prev.current !== "listening" && mode === "listening" && prev.current !== "speaking" && prev.current !== "thinking") {
      playEarcon();
    }
    if (!frozen) prev.current = mode;
    const lines = Array.isArray(status.transcript) ? status.transcript.slice(-8) : useCentre.getState().lines;
    useCentre.getState().patch({
      mode: frozen || mode,
      follow: frozen ? useCentre.getState().follow : follow,
      mic: typeof status.micLevel === "number" ? status.micLevel : useCentre.getState().mic,
      lines,
      theme: status.theme === "ultron" || status.theme === "jarvis" ? status.theme : useCentre.getState().theme,
      settingsOpen: typeof status.settingsOpen === "boolean" ? status.settingsOpen : useCentre.getState().settingsOpen,
      online: true,
    });
    live.mic = typeof status.micLevel === "number" ? status.micLevel : live.mic;
  }

  async function refreshVitals() {
    const health = await window.jarvis?.health();
    const metrics = await window.jarvis?.metrics();
    useCentre.getState().patch({
      online: Boolean(health?.ok),
      latencyMs: health?.ms ?? null,
      model: health?.body?.llm?.model || (health?.ok ? "Friday" : "offline"),
      cpu: metrics?.cpu ?? null,
      ramUsed: metrics?.ramUsed ?? null,
      ramTotal: metrics?.ramTotal ?? null,
    });
    if (!health?.ok && !parseShot(window.location.search).mode) {
      useCentre.getState().patch({ mode: "idle" });
    }
  }

  function ensure(): { ctx: AudioContext; analyser: AnalyserNode } | null {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audio.current) {
      const ctx = new Ctx();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.65;
      node.connect(ctx.destination);
      audio.current = ctx;
      analyser.current = node;
    }
    return { ctx: audio.current, analyser: analyser.current! };
  }

  function stopPlayback() {
    try { source.current?.stop(); } catch { /* already stopped */ }
    source.current = null;
    live.mouth = 0;
  }

  function playEarcon() {
    const graph = ensure();
    if (!graph) return;
    const osc = graph.ctx.createOscillator();
    const gain = graph.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, graph.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, graph.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, graph.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, graph.ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, graph.ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(graph.ctx.destination);
    osc.start();
    osc.stop(graph.ctx.currentTime + 0.2);
  }

  async function playMpeg(id: string, bytes: ArrayBuffer) {
    const graph = ensure();
    if (!graph) return;
    stopPlayback();
    if (graph.ctx.state === "suspended") await graph.ctx.resume();
    const buffer = await graph.ctx.decodeAudioData(bytes.slice(0));
    const node = graph.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(graph.analyser);
    node.onended = () => {
      if (source.current === node) source.current = null;
      void window.jarvis?.playback(id, "done");
    };
    source.current = node;
    node.start();
    void window.jarvis?.playback(id, "playing");
  }
}
