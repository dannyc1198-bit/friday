# JARVIS STARTUP UPGRADE — FULL SPEC
> Hand this entire file to Claude Code. Read every word before starting.

---

## 🎯 THE GOAL

When Danny types his Windows password and hits Enter — his entire screen becomes JARVIS. No desktop. No taskbar. No Chrome. The screen goes dark, blue circuit lines flash across it, AC/DC fires up, JARVIS greets him by name. Exactly like Tony Stark's lab.

**This must feel like the OS changed. Not like a website opened.**

---

## 🔑 THE KEY: ELECTRON WRAPPER

The current JARVIS runs in Chrome (a website). That feels cheap.

We need to wrap it in **Electron** so it becomes a native Windows app that:
- Launches at login via Task Scheduler (before desktop is visible)
- Covers 100% of the screen — no title bar, no browser UI, nothing
- Stays always-on-top of everything
- Has full system access (audio, files, terminal launching)
- Can be shown/hidden with a hotkey

**This is the ONLY way to achieve the Tony Stark effect.**

---

## 📽️ EXACT STARTUP SEQUENCE (Frame by Frame)

Reference: Iron Man 2 lab scene + Iron Man suit-up HUD boot sequence.

```
[0.00s]  LOGIN — Danny hits Enter on Windows login screen
[0.00s]  Electron launches immediately (Task Scheduler, AtLogon)
[0.00s]  Screen: Pure black. Full screen. Silent.
[0.50s]  A single thin CYAN line shoots horizontally across screen
[0.75s]  More blue lines trace outward — circuit board pattern
         Lines branch, fork, trace like electricity finding a path
         Lines are #00d4ff (cyan) on black, glowing with blur
[1.50s]  AC/DC — "Back in Black" intro riff HITS
         (The "Bah... bah bah bah... BA BA BA BA BACK IN BLACK")
[2.00s]  Arc reactor appears at center — starts as a pinpoint of light
         Expands outward with a PULSE, rings rotating
[2.50s]  JARVIS voice (British, ElevenLabs Daniel):
         "Good morning, Mr. Danny. Initializing systems."
[3.00s]  J . A . R . V . I . S assembles letter by letter
         Each letter: electronic click sound + slight flash
[4.00s]  Four HUD corner brackets slam into the corners of screen
         [╔] top-left  [╗] top-right  [╚] bottom-left  [╝] bottom-right
[4.50s]  Status panels slide in from edges:
         LEFT:  System stats (CPU, RAM, Network)
         RIGHT: Crypto prices (XRP, XLM, HBAR), Stocks (AAPL, TSLA, NVDA)
         TOP:   Time, date, weather
         BOTTOM: "DANCAVE ONLINE" + uptime counter
[5.50s]  Smart lights: Flash WHITE once, then transition to cyan blue
[6.00s]  Loading bars fill across the bottom — left to right
         "LOADING CORE MODULES... 100%"
[7.00s]  JARVIS voice: "All systems online. Welcome to the Dancave."
[7.50s]  Terminals open in background (minimized):
         - Claude Code (in JARVIS directory)
         - OpenClaw (in workspace directory)
[8.00s]  Startup sequence fades, transitions to MAIN JARVIS interface
         (Chat panel, Control Center, sidebar)
```

---

## ⚡ BLUE CIRCUIT LINE ANIMATION (The Most Important Part)

This is the signature effect. Must look exactly like Iron Man.

### Implementation: HTML5 Canvas

```typescript
// components/CircuitLines.tsx
// Canvas fills 100vw × 100vh
// Lines trace from center outward, like electricity

interface LineNode {
  x: number
  y: number
  direction: 'up' | 'down' | 'left' | 'right'
  speed: number
  branches: number  // how many times it's branched
}

// Algorithm:
// 1. Start 4-8 lines from center
// 2. Each line moves in a direction, drawing as it goes
// 3. At random intervals, branch: 2 new lines spawn perpendicular
// 4. Lines stop when they hit screen edge or max branches (3)
// 5. After a line completes, it glows brighter for 200ms then fades

// Visual style:
// - Line width: 1px main, 0.5px branches
// - Color: #00d4ff with box-shadow glow
// - Canvas composite: 'screen' blending for neon effect
// - Background: pure black
// - Duration: 1.5 seconds total, then lines remain faintly visible

// Timing:
// Frame 0: Center origin point pulses
// Frame 1-90: Lines trace outward (60fps = 1.5s)
// Frame 90+: Lines fade to 20% opacity, remain as background texture
```

### Critical visual details:
- Lines must have a **glowing trailing tip** (the moving end glows brighter)
- Lines move at **different speeds** — some fast, some slow
- Lines make **90-degree turns only** — no diagonals (circuit board style)
- Add **tiny nodes/dots** where lines branch (solder point effect)
- The overall feel: electricity finding its path through a circuit board

---

## 🏗️ BUILD PLAN (Claude Code — do in this exact order)

### STEP 1: Create Electron wrapper

```bash
cd C:\Users\12368\JARVIS
mkdir apps/electron
cd apps/electron
npm init -y
npm install electron electron-builder
```

Create `apps/electron/main.js`:
```javascript
const { app, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')
const { exec } = require('child_process')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,           // Full screen — no title bar
    frame: false,               // No window chrome
    alwaysOnTop: true,          // Stays above everything
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,                // Don't show until ready
  })

  // Load JARVIS frontend
  mainWindow.loadURL('http://localhost:3000')
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Alt+J to toggle show/hide
  globalShortcut.register('Alt+J', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // ESC to minimize (don't close JARVIS)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      mainWindow.minimize()
      event.preventDefault()
    }
  })
}

app.whenReady().then(() => {
  // Start the Next.js frontend and orchestrator first
  exec('cmd /c "cd C:\\Users\\12368\\JARVIS && start-services.bat"')
  
  // Wait for services to boot, then open window
  setTimeout(createWindow, 3000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

---

### STEP 2: Create the Circuit Line animation component

File: `apps/web/src/components/CircuitAnimation.tsx`

This is the first thing shown on screen. Full canvas component.
See algorithm above. Key requirements:
- Must work at any screen resolution
- Must complete in exactly 1.5 seconds
- Lines must glow (use canvas shadowBlur = 15, shadowColor = '#00d4ff')
- After completion, lines stay at 15% opacity as background texture

---

### STEP 3: Rebuild IronManStartup.tsx

Complete rewrite. New structure:

```typescript
// Phases managed by state machine
type Phase = 
  | 'CIRCUIT_LINES'    // 0-1.5s: Blue lines trace across screen
  | 'ARC_REACTOR'      // 1.5-3s: Reactor spins up
  | 'IDENTITY'         // 3-4s: J.A.R.V.I.S. assembles
  | 'HUD_PANELS'       // 4-5.5s: Corner panels slide in
  | 'STATUS_FILL'      // 5.5-7s: Loading bars fill
  | 'READY'            // 7s+: Transition to main UI

// Each phase is a separate component that mounts/unmounts
// Audio triggers are tied to phase transitions
// JARVIS voice calls happen at specific timestamps
```

---

### STEP 4: Arc Reactor (3D version)

Replace the flat CSS circle with Three.js:

```bash
cd apps/web
npm install three @types/three
```

```typescript
// components/ArcReactor3D.tsx
// Three.js scene with:
// - Outer ring: wireframe torus, rotating clockwise
// - Middle ring: wireframe torus, rotating counter-clockwise, faster
// - Inner sphere: emissive blue material, pulsing scale animation
// - Particle system: 200 particles orbiting the reactor
// - Point light: cyan, intensity pulsing with reactor
// - Camera: orthographic, looking straight at reactor
// - No background — transparent canvas overlaid on black
```

---

### STEP 5: Audio system

Create `apps/web/src/services/audio.ts`:

```typescript
export class JARVISAudio {
  private sounds: Map<string, HTMLAudioElement> = new Map()
  
  async init() {
    // Preload all sounds
    this.preload('circuit', '/sounds/startup/circuit-trace.mp3')
    this.preload('letter-click', '/sounds/startup/letter-click.mp3')
    this.preload('hud-slam', '/sounds/startup/hud-slam.mp3')
    this.preload('system-ready', '/sounds/startup/system-ready.mp3')
    this.preload('acdc', '/sounds/startup/back-in-black-intro.mp3')
    this.preload('arc-hum', '/sounds/startup/arc-reactor-hum.mp3')
  }
  
  play(name: string, volume = 1.0) { ... }
  stop(name: string) { ... }
  fadeOut(name: string, durationMs: number) { ... }
}
```

**Sound files needed** (Claude Code: source or generate these):
- `circuit-trace.mp3` — electrical buzz/crackle sound, 1.5 seconds
- `letter-click.mp3` — short electronic click, < 0.1 seconds
- `hud-slam.mp3` — mechanical slam/lock sound, 0.3 seconds
- `system-ready.mp3` — ascending chime, 0.5 seconds
- `arc-reactor-hum.mp3` — low continuous electrical hum, loops
- `back-in-black-intro.mp3` — first 30 seconds of AC/DC track

---

### STEP 6: Windows startup script

Create `start-JARVIS-electron.bat`:
```batch
@echo off
title JARVIS STARTUP

REM Start orchestrator (hidden)
start "" /B /MIN node "C:\Users\12368\JARVIS\apps\orchestrator\src\index.ts"
timeout /t 3 /nobreak > nul

REM Start Next.js (hidden)
start "" /B /MIN cmd /c "cd /d C:\Users\12368\JARVIS\apps\web && npm run dev"
timeout /t 4 /nobreak > nul

REM Launch Electron (this IS the JARVIS UI)
start "" "C:\Users\12368\JARVIS\apps\electron\node_modules\.bin\electron.cmd" "C:\Users\12368\JARVIS\apps\electron\main.js"
```

Create `install-windows-startup.ps1`:
```powershell
# Unregister old task if exists
Unregister-ScheduledTask -TaskName "JARVIS" -Confirm:$false -ErrorAction SilentlyContinue

# Register new startup task
$action = New-ScheduledTaskAction `
  -Execute "C:\Users\12368\JARVIS\start-JARVIS-electron.bat"

$trigger = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 8)

Register-ScheduledTask `
  -TaskName "JARVIS" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest `
  -Force

Write-Host "✅ JARVIS will now start automatically at login."
Write-Host "   Press Alt+J to toggle show/hide."
Write-Host "   Press ESC to minimize."
```

---

### STEP 7: Smart lights on startup

**Ask Danny first: What brand are your smart lights?**

Then add to orchestrator startup sequence:

```typescript
// If Philips Hue:
await hue.setAll({ on: true, bri: 0, ct: 153 })  // Start dark
await delay(500)
await hue.setAll({ bri: 254, hue: 43690, sat: 254 })  // Flash white
await delay(200)
await hue.transition({ hue: 43690, bri: 180 }, 3000)  // Slow fade to cyan

// If LIFX:
await lifx.setAll({ power: 'on', color: 'white', brightness: 1.0, duration: 0.1 })
await delay(300)
await lifx.setAll({ color: 'cyan saturation:1.0', brightness: 0.7, duration: 3.0 })

// If Govee: use Govee LAN API or cloud API
```

---

### STEP 8: Open terminals on startup

Add to Electron `main.js` after startup sequence completes:

```javascript
function openTerminals() {
  // Claude Code terminal (minimized, ready to use)
  exec('start /MIN cmd /k "cd /d C:\\Users\\12368\\JARVIS && claude"')
  
  // OpenClaw terminal (minimized)
  exec('start /MIN cmd /k "openclaw status"')
  
  // Add more here — whatever Danny wants
}
```

---

## ❓ QUESTIONS FOR DANNY BEFORE BUILDING

Claude Code: Ask Danny these before starting. Stop and wait for answers.

1. **Smart lights brand?**
   - [ ] Philips Hue
   - [ ] LIFX  
   - [ ] Govee
   - [ ] TP-Link Kasa
   - [ ] Other: ___

2. **AC/DC source?**
   - [ ] Local MP3 file (instant, no auth needed)
   - [ ] Spotify (needs OAuth setup)
   
3. **Additional terminals to open?** (Claude Code + OpenClaw already included)
   
4. **Second monitor?** JARVIS on monitor 2, work on monitor 1?

5. **Want to skip startup animation after first run?**
   (e.g., show full animation on cold boot, shorter version on restart)

---

## 📁 NEW FILE STRUCTURE

```
JARVIS/
├── apps/
│   ├── electron/                    ← NEW
│   │   ├── main.js                  ← Electron entry point
│   │   ├── package.json
│   │   └── preload.js
│   ├── web/
│   │   ├── src/components/
│   │   │   ├── CircuitAnimation.tsx ← NEW (the blue lines)
│   │   │   ├── ArcReactor3D.tsx     ← NEW (Three.js reactor)
│   │   │   ├── IronManStartup.tsx   ← REWRITE (phase state machine)
│   │   │   └── HUDCorners.tsx       ← NEW (corner bracket animations)
│   │   └── public/sounds/startup/   ← NEW (all audio files)
│   └── orchestrator/
│       └── src/routes/
│           └── startup.ts           ← NEW (startup sequence endpoint)
├── start-JARVIS-electron.bat        ← NEW
├── install-windows-startup.ps1      ← UPDATE
├── JARVIS-config.json               ← NEW (Danny's settings)
└── UPGRADE-STARTUP.md               ← THIS FILE
```

---

## ✅ DEFINITION OF DONE

Danny logs in to Windows. Within 10 seconds:
- [x] Full screen black appears (no desktop visible)
- [x] Blue circuit lines trace across the screen
- [x] AC/DC plays at full volume
- [x] Arc Reactor spins in 3D at center
- [x] "J . A . R . V . I . S" assembles with sound effects
- [x] JARVIS (British voice) says "Good morning, Mr. Danny"
- [x] HUD panels with real data slide in from corners
- [x] Smart lights turn on in cyan/blue
- [x] Terminals open in background (minimized)
- [x] JARVIS says "All systems online. Welcome to the Dancave."
- [x] Main JARVIS chat interface appears

**It must look like the OS itself changed. Tony Stark would approve.**

---

*Written for Danny — Tony Stark of Fraser Valley. 🦞*
*Clawdy, Feb 25 2026*
