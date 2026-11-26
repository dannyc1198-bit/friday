const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const WebSocket = require("ws");

app.setPath("userData", path.join(os.homedir(), ".friday-electron"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const ROOT = path.join(__dirname, "..", "..");
const DIST = path.join(__dirname, "dist");
const ORCH = "http://127.0.0.1:3001";
const UI_PORT = 4730;

let centre = null;
let orb = null;
let uiServer = null;
let ear = null;
let orchProcess = null;
let startedOrch = false;
let lastCpu = os.cpus().map((cpu) => cpu.times);
let audioFor = null;

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const cut = trimmed.indexOf("=");
    let value = trimmed.slice(cut + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, cut).trim()] = value;
  }
  return out;
}

function token() {
  if (process.env.FRIDAY_API_KEY && process.env.FRIDAY_API_KEY.trim()) return process.env.FRIDAY_API_KEY.trim();
  return readEnv(path.join(ROOT, "apps", "orchestrator", ".env")).FRIDAY_API_KEY || "";
}

function authHeaders() {
  const key = token();
  return key
    ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function metrics() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  cpus.forEach((cpu, index) => {
    const prev = lastCpu[index] || cpu.times;
    const idleDelta = cpu.times.idle - prev.idle;
    const totalDelta = ["user", "nice", "sys", "idle", "irq"].reduce((sum, key) => sum + cpu.times[key] - prev[key], 0);
    idle += idleDelta;
    total += totalDelta;
  });
  lastCpu = cpus.map((cpu) => ({ ...cpu.times }));
  return {
    cpu: total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0,
    ramUsed: os.totalmem() - os.freemem(),
    ramTotal: os.totalmem(),
    uptime: os.uptime(),
  };
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".woff")) return "font/woff";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function serveUi() {
  return new Promise((resolve, reject) => {
    uiServer = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${UI_PORT}`);
      const rel = decodeURIComponent(url.pathname) === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const file = path.normalize(path.join(DIST, rel));
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    });
    uiServer.listen(UI_PORT, "127.0.0.1", () => resolve(`http://127.0.0.1:${UI_PORT}/`));
    uiServer.on("error", reject);
  });
}

function visible() {
  if (centre && centre.isVisible()) return centre;
  if (orb && orb.isVisible()) return orb;
  return centre || orb;
}

function sendEvent(raw) {
  for (const win of [centre, orb]) {
    if (win && !win.isDestroyed()) win.webContents.send("jarvis:event", raw);
  }
}

function sendAudio(buf) {
  const target = visible();
  if (!target) return;
  audioFor = target;
  target.webContents.send("jarvis:audio", buf);
}

function connectEar() {
  const key = token();
  if (!key) return;
  const socket = new WebSocket("ws://127.0.0.1:3001/api/voice/ear/live", {
    headers: { Authorization: `Bearer ${key}` },
  });
  ear = socket;
  socket.on("message", (data, isBinary) => {
    if (isBinary) sendAudio(Buffer.from(data));
    else sendEvent(data.toString());
  });
  socket.on("close", () => {
    ear = null;
    setTimeout(connectEar, 1500);
  });
  socket.on("error", () => {
    try { socket.close(); } catch { /* already closing */ }
  });
}

function post(pathname, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body || {});
    const req = http.request(`${ORCH}${pathname}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Length": Buffer.byteLength(payload) },
    }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("error", () => resolve(0));
    req.end(payload);
  });
}

function makeWindow(kind, url) {
  const display = screen.getPrimaryDisplay().workArea;
  const corner = kind === "orb";
  const win = new BrowserWindow({
    width: corner ? 300 : Math.min(1280, display.width - 48),
    height: corner ? 340 : Math.min(800, display.height - 48),
    x: corner ? display.x + display.width - 328 : undefined,
    y: corner ? display.y + display.height - 388 : undefined,
    frame: false,
    transparent: corner,
    backgroundColor: corner ? "#00000000" : "#07060a",
    show: !corner,
    alwaysOnTop: corner,
    skipTaskbar: corner,
    resizable: !corner,
    hasShadow: !corner,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--jarvis-shell=${kind}`],
    },
  });
  win.loadURL(`${url}#${kind}`);
  return win;
}

function showCentre() {
  if (orb && !orb.isDestroyed()) orb.hide();
  if (centre && !centre.isDestroyed()) {
    centre.show();
    centre.focus();
  }
}

function showOrb() {
  if (centre && !centre.isDestroyed()) centre.hide();
  if (orb && !orb.isDestroyed()) orb.showInactive();
}

function ensureOrchestrator() {
  const dir = path.join(ROOT, "apps", "orchestrator");
  if (!fs.existsSync(path.join(dir, "package.json"))) return;
  orchProcess = spawn("npm", ["run", "dev"], { cwd: dir, shell: true, windowsHide: true, stdio: "ignore" });
  startedOrch = true;
}

app.whenReady().then(async () => {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("Build the command centre first: npm run build --prefix apps/desktop");
    app.quit();
    return;
  }
  ipcMain.handle("jarvis:metrics", () => metrics());
  ipcMain.handle("jarvis:health", () => new Promise((resolve) => {
    const started = Date.now();
    const req = http.get(`${ORCH}/api/health`, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve({ ok: res.statusCode === 200, ms: Date.now() - started, body: JSON.parse(raw) });
        } catch {
          resolve({ ok: false, ms: null, body: null });
        }
      });
    });
    req.on("error", () => resolve({ ok: false, ms: null, body: null }));
    req.setTimeout(1200, () => { req.destroy(); resolve({ ok: false, ms: null, body: null }); });
  }));
  ipcMain.handle("jarvis:playback", (_event, id, state) => post("/api/voice/ear/playback", { id, state }));
  ipcMain.handle("jarvis:interrupt", (_event, id) => post("/api/voice/ear/interrupt", { id }));
  ipcMain.handle("jarvis:arm", () => post("/api/voice/ear/arm", {}));
  ipcMain.on("jarvis:layout", (_event, layout) => {
    if (layout === "orb") showOrb();
    else showCentre();
  });

  const url = await serveUi();
  centre = makeWindow("centre", url);
  orb = makeWindow("orb", url);
  centre.on("closed", () => { centre = null; });
  orb.on("closed", () => { orb = null; });

  http.get(`${ORCH}/api/health`, (res) => {
    res.resume();
    if (res.statusCode !== 200) ensureOrchestrator();
  }).on("error", ensureOrchestrator);

  setTimeout(connectEar, 400);

  globalShortcut.register("Control+Alt+J", () => {
    visible()?.webContents.send("jarvis:hotkey", "settings");
    showCentre();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (ear) { try { ear.close(); } catch { /* ignore */ } }
  if (uiServer) uiServer.close();
  if (startedOrch && orchProcess && !orchProcess.killed) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(orchProcess.pid), "/f", "/t"], { shell: true });
    else orchProcess.kill("SIGTERM");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

void audioFor;
