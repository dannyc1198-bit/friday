import { Canvas } from "@react-three/fiber";
import { motion, AnimatePresence } from "framer-motion";
import { Reactor } from "./orb/Reactor";
import { THEMES, modeLabel } from "./lib/presentation";
import { useCentre } from "./store";
import { useCentreLink } from "./session/useCentreLink";

function bytes(value: number | null): string {
  if (value == null) return "—";
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function App() {
  useCentreLink();
  const mode = useCentre((state) => state.mode);
  const theme = useCentre((state) => state.theme);
  const follow = useCentre((state) => state.follow);
  const lines = useCentre((state) => state.lines);
  const settingsOpen = useCentre((state) => state.settingsOpen);
  const shell = useCentre((state) => state.shell);
  const online = useCentre((state) => state.online);
  const model = useCentre((state) => state.model);
  const latency = useCentre((state) => state.latencyMs);
  const cpu = useCentre((state) => state.cpu);
  const ramUsed = useCentre((state) => state.ramUsed);
  const ramTotal = useCentre((state) => state.ramTotal);
  const gpu = useCentre((state) => state.gpu);
  const clock = useCentre((state) => state.clock);
  const palette = THEMES[theme];
  const label = modeLabel(mode, follow);
  const compact = shell === "orb";
  const slow = mode === "idle" || (mode === "listening" && follow);

  return (
    <div
      className={`stage ${compact ? "compact" : "full"} theme-${theme} mode-${mode}`}
      data-state={mode}
      data-theme={theme}
      data-shell={shell}
      style={{
        ["--hud" as string]: palette.hud,
        ["--hot" as string]: palette.hot,
        ["--deep" as string]: palette.deep,
      }}
    >
      {!compact && <div className="wash" />}
      <div className="scanlines" />
      {!compact && (
        <header className="topbar">
          <div>
            <div className="mark">J.A.R.V.I.S.</div>
            <div className="sub">Friday command centre</div>
          </div>
          <div className="readout">
            <span>{clock || "—"}</span>
            <span className={online ? "on" : "off"}>{online ? "LINK" : "OFFLINE"}</span>
            <span>{latency == null ? "—" : `${latency} ms`}</span>
          </div>
        </header>
      )}
      {!compact && <i className="bracket tl" />}
      {!compact && <i className="bracket tr" />}
      {!compact && <i className="bracket bl" />}
      {!compact && <i className="bracket br" />}

      {!compact && (
        <aside className="glass left">
          <p className="kicker">Status</p>
          <p className="state">{label}</p>
          <p className={`wake ${mode === "listening" && !follow ? "hot" : ""}`}>Hey Jarvis</p>
          <ul>
            {(["idle", "listening", "thinking", "speaking", "confirming", "alert"] as const).map((item) => (
              <li key={item} className={item === mode ? "on" : ""}>{modeLabel(item, false)}</li>
            ))}
          </ul>
        </aside>
      )}

      <div className="orb-slot">
        <Canvas
          dpr={[1, 1.25]}
          frameloop={slow ? "demand" : "always"}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance", stencil: false }}
          camera={{ position: [0, 0, 4.2], fov: 34 }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <Reactor slow={slow} />
        </Canvas>
      </div>

      {!compact && (
        <aside className="glass right">
          <p className="kicker">Systems</p>
          <dl>
            <div><dt>Time</dt><dd>{clock || "—"}</dd></div>
            <div><dt>CPU</dt><dd>{cpu == null ? "—" : `${cpu.toFixed(0)}%`}</dd></div>
            <div><dt>Memory</dt><dd>{bytes(ramUsed)} / {bytes(ramTotal)}</dd></div>
            <div><dt>GPU</dt><dd className="clip">{gpu}</dd></div>
            <div><dt>Network</dt><dd>{online ? "orchestrator :3001" : "no route"}</dd></div>
            <div><dt>Brain</dt><dd className="clip">{model}</dd></div>
          </dl>
        </aside>
      )}

      <section className="captions" aria-live="polite">
        {(lines.length ? lines.slice(-compact ? 1 : 4) : [{ role: "jarvis" as const, text: "Say Hey Jarvis." }]).map((line, index) => (
          <p key={`${line.role}-${index}`} className={line.role}>
            <span>{line.role === "you" ? "Heard" : "Jarvis"}</span>
            {line.text}
          </p>
        ))}
      </section>

      <AnimatePresence>
        {settingsOpen && !compact && (
          <motion.aside className="glass settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="kicker">Hidden</p>
            <p>One hotkey: Ctrl+Alt+J.</p>
            <p>Say “ultron mode” or “jarvis mode” for the palette.</p>
            <p>After a reply you can keep talking for about nine seconds. Sending, spending, and deleting wait until you say yes.</p>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
