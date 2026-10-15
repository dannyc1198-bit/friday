// PowerShell without a shell. The script travels as -EncodedCommand so
// quotes and & in typed text never reach cmd.exe.

import { spawn } from "child_process";

export interface PowershellSpawn {
  command: string;
  args: string[];
  shell: false;
}

export function buildPowershellInvocation(script: string): PowershellSpawn {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return {
    command: process.platform === "win32" ? "powershell.exe" : "powershell",
    args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    shell: false,
  };
}

export function runPowershell(script: string, timeoutMs = 15_000): Promise<string> {
  const invocation = buildPowershellInvocation(script);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell timed out."));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited ${code}`));
        return;
      }
      if (stderr && !stderr.includes("WARNING")) {
        console.warn("[PC Control] PS stderr:", stderr.substring(0, 200));
      }
      resolve(stdout.trim());
    });
  });
}
