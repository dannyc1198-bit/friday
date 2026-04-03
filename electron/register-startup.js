const { execSync } = require('child_process');
const path = require('path');
const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron.cmd');
const appPath = path.join(__dirname, 'main.js');
const cmd = `"${electronPath}" "${appPath}"`;

// Add to Windows registry run key
const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "JARVIS" /t REG_SZ /d "${cmd.replace(/\\/g,'\\\\')}" /f`;
try {
  execSync(regCmd);
  console.log('✅ JARVIS registered to launch on Windows login');
} catch(e) {
  console.error('❌ Failed to register startup:', e.message);
}
