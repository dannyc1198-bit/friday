const { app, BrowserWindow, screen, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let orchestratorProcess;
let webProcess;

const WEB_URL = process.env.FRIDAY_WEB_PORT ? `http://localhost:${process.env.FRIDAY_WEB_PORT}` : 'http://localhost:3000';
const ORCHESTRATOR_URL = 'http://localhost:3001';

// ── Service management ──────────────────────────────────────────────

function startService(name, cwd, command, args) {
  console.log(`[FRIDAY] Starting ${name}...`);
  const proc = spawn(command, args, {
    cwd,
    shell: true,
    stdio: 'pipe',
    windowsHide: true,
  });
  proc.stdout.on('data', (d) => console.log(`[${name}] ${d.toString().trim()}`));
  proc.stderr.on('data', (d) => console.error(`[${name}] ${d.toString().trim()}`));
  proc.on('exit', (code) => console.log(`[${name}] exited with code ${code}`));
  return proc;
}

function waitForService(url, maxRetries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http
        .get(url, (res) => {
          // Any response means the server is up
          resolve();
        })
        .on('error', () => {
          if (attempts >= maxRetries) {
            reject(new Error(`${url} not ready after ${maxRetries} attempts`));
          } else {
            setTimeout(check, interval);
          }
        });
    };
    check();
  });
}

function killChildren() {
  [orchestratorProcess, webProcess].forEach((proc) => {
    if (proc && !proc.killed) {
      try {
        // On Windows, kill the process tree
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', proc.pid, '/f', '/t'], { shell: true });
        } else {
          proc.kill('SIGTERM');
        }
      } catch (e) {
        console.error('[FRIDAY] Error killing child:', e.message);
      }
    }
  });
}

// ── Window creation ─────────────────────────────────────────────────

async function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width,
    height,
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // ESC minimizes — never closes
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow.minimize();
    }
  });

  // Start services
  const orchestratorDir = path.join(__dirname, '..', 'apps', 'orchestrator');
  const webDir = path.join(__dirname, '..', 'apps', 'web');

  orchestratorProcess = startService('orchestrator', orchestratorDir, 'npm', ['run', 'dev']);
  webProcess = startService('web', webDir, 'npm', ['run', 'dev']);

  // Show "CONNECTING..." while waiting
  mainWindow.loadURL(`data:text/html,
    <html>
      <body style="background:#000;color:#00d4ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:monospace;font-size:24px;letter-spacing:8px;">
        CONNECTING...
      </body>
    </html>
  `);

  // Wait for orchestrator then web app
  try {
    await waitForService(ORCHESTRATOR_URL, 30, 1000);
    console.log('[FRIDAY] Orchestrator ready');
  } catch (e) {
    console.error('[FRIDAY] Orchestrator failed to start:', e.message);
  }

  try {
    await waitForService(WEB_URL, 30, 1000);
    console.log('[FRIDAY] Web app ready');
  } catch (e) {
    console.error('[FRIDAY] Web app failed to start:', e.message);
  }

  // Load the web app
  mainWindow.loadURL(WEB_URL);

  // After boot sequence completes, drop alwaysOnTop
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__FRIDAYBootComplete = function() {
        console.log('FRIDAY BOOT COMPLETE');
      };
    `);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ───────────────────────────────────────────────────

app.whenReady().then(async () => {
  await createWindow();

  // Global hotkey: Alt+J toggles visibility
  globalShortcut.register('Alt+J', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.minimize();
    } else {
      mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  killChildren();
});

app.on('window-all-closed', () => {
  killChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
