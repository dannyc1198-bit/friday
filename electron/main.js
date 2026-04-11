const { app, BrowserWindow, screen, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Fix GPU cache errors on Windows
app.setPath('userData', path.join(require('os').homedir(), '.friday-electron'));

let mainWindow;
let orchestratorProcess;
let webProcess;
let servicesStartedByUs = false;

const WEB_URL = process.env.FRIDAY_WEB_PORT ? `http://localhost:${process.env.FRIDAY_WEB_PORT}` : 'http://localhost:3000';
const ORCHESTRATOR_URL = 'http://localhost:3001';

// Check if a service is already running
function isServiceRunning(url) {
  return new Promise((resolve) => {
    http.get(url, () => resolve(true)).on('error', () => resolve(false));
  });
}

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

  // Show boot screen immediately
  mainWindow.loadURL(`data:text/html,
    <html>
      <body style="background:#020a14;color:#00b4ff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:'Segoe UI',monospace;">
        <div style="width:60px;height:60px;border:2px solid rgba(0,180,255,0.2);border-top-color:#00dcff;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:30px;"></div>
        <div style="font-size:14px;letter-spacing:6px;font-weight:300;opacity:0.6;">INITIALIZING F.R.I.D.A.Y.</div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      </body>
    </html>
  `);

  // Smart service detection — only start if not already running
  const orchestratorDir = path.join(__dirname, '..', 'apps', 'orchestrator');
  const webDir = path.join(__dirname, '..', 'apps', 'web');

  const orchAlready = await isServiceRunning(ORCHESTRATOR_URL);
  const webAlready = await isServiceRunning(WEB_URL);

  if (!orchAlready) {
    console.log('[FRIDAY] Starting orchestrator...');
    orchestratorProcess = startService('orchestrator', orchestratorDir, 'npm', ['run', 'dev']);
  } else {
    console.log('[FRIDAY] Orchestrator already running on 3001');
  }

  if (!webAlready) {
    console.log('[FRIDAY] Starting web...');
    webProcess = startService('web', webDir, 'npm', ['run', 'dev']);
  } else {
    console.log('[FRIDAY] Web already running on 3000');
  }

  servicesStartedByUs = !orchAlready || !webAlready;

  // Wait for both services to be ready
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
  if (servicesStartedByUs) killChildren();
});

app.on('window-all-closed', () => {
  if (servicesStartedByUs) killChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
