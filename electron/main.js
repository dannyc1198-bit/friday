const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');

let mainWindow;
let nextProcess;

const DEV_URL  = 'http://localhost:3002';
const PROD_URL = 'http://localhost:3002'; // Next.js starts separately for now

function startNextServer() {
  return new Promise((resolve) => {
    const webDir = path.join(__dirname, '..', 'apps', 'web');
    nextProcess = exec('npm run start', { cwd: webDir });
    // Give Next.js 4 seconds to boot
    setTimeout(resolve, 4000);
  });
}

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

  // Start Next.js then load
  await startNextServer();
  mainWindow.loadURL(DEV_URL);

  // After boot sequence completes, drop alwaysOnTop
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__JARVISBootComplete = function() {
        console.log('JARVIS BOOT COMPLETE');
      };
    `);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (nextProcess) nextProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
