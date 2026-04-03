// PC Control Tools for JARVIS — Phase 2, Step 2.3
// Hardened: allowlists, input sanitization, no raw PowerShell injection
// Spec: mouse, keyboard, system tools via PowerShell (no robotjs dependency)

import { exec } from "child_process";
import { promisify } from "util";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

const execAsync = promisify(exec);

// ─── Security: Input Sanitization ────────────────────────────
// Strip characters that could escape PowerShell strings.
// We use single-quoted PowerShell strings ('...') which only
// need single quotes escaped (doubled: '' inside '...').
// Everything else is literal. But we also strip backticks and
// $() to prevent expression injection in any context.

function sanitize(input: string): string {
  return input
    .replace(/'/g, "''")        // Escape single quotes for PS
    .replace(/`/g, "")          // Remove backticks (PS escape char)
    .replace(/\$\(/g, "")       // Remove $( (subexpression)
    .replace(/\$\{/g, "")       // Remove ${ (variable expansion)
    .replace(/[;\r\n]/g, "");   // Remove semicolons and newlines (command chaining)
}

// ─── Security: App Allowlist ─────────────────────────────────
// Only these apps can be opened or closed. Prevents JARVIS from
// being tricked into running arbitrary executables.

const APP_ALLOWLIST: Record<string, string> = {
  // Browsers
  chrome: "chrome",
  "google chrome": "chrome",
  firefox: "firefox",
  edge: "msedge",
  "microsoft edge": "msedge",

  // Productivity
  notepad: "notepad",
  calculator: "calc",
  calc: "calc",
  paint: "mspaint",
  word: "winword",
  excel: "excel",
  powerpoint: "powerpnt",
  outlook: "outlook",
  teams: "ms-teams",
  "microsoft teams": "ms-teams",

  // Dev tools
  vscode: "code",
  "visual studio code": "code",
  terminal: "wt",
  "windows terminal": "wt",

  // Media & Social
  spotify: "spotify",
  discord: "discord",
  slack: "slack",

  // System
  explorer: "explorer",
  "file explorer": "explorer",
  "task manager": "taskmgr",
};

// Process names that are safe to close (subset of allowlist)
const CLOSEABLE_PROCESSES = new Set([
  "chrome", "firefox", "msedge",
  "notepad", "calc", "mspaint",
  "winword", "excel", "powerpnt", "outlook",
  "code", "wt",
  "spotify", "discord", "slack",
  "explorer", "taskmgr",
  "ms-teams",
]);

// ─── Security: Key Combo Allowlist ───────────────────────────
// Only safe keyboard shortcuts. Blocks destructive combos like
// alt+f4 on unknown windows, win+r (Run dialog = arbitrary exec).

const KEY_COMBO_MAP: Record<string, string> = {
  // Clipboard
  "ctrl+c": "^c",
  "ctrl+v": "^v",
  "ctrl+x": "^x",

  // Editing
  "ctrl+z": "^z",
  "ctrl+y": "^y",
  "ctrl+a": "^a",
  "ctrl+s": "^s",
  "ctrl+f": "^f",
  "ctrl+p": "^p",

  // Navigation
  "alt+tab": "%{TAB}",
  "ctrl+tab": "^{TAB}",
  "ctrl+shift+tab": "^+{TAB}",
  "win+d": "^{ESC}d",      // Show desktop
  "win+e": "^{ESC}e",      // Open explorer

  // Single keys
  enter: "{ENTER}",
  tab: "{TAB}",
  escape: "{ESC}",
  backspace: "{BACKSPACE}",
  delete: "{DELETE}",
  space: " ",
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
  home: "{HOME}",
  end: "{END}",
  pageup: "{PGUP}",
  pagedown: "{PGDN}",

  // Function keys
  f1: "{F1}", f2: "{F2}", f3: "{F3}", f4: "{F4}", f5: "{F5}",
  f6: "{F6}", f7: "{F7}", f8: "{F8}", f9: "{F9}", f10: "{F10}",
  f11: "{F11}", f12: "{F12}",

  // Media keys
  "play/pause": "{MEDIA_PLAY_PAUSE}",
  "next track": "{MEDIA_NEXT_TRACK}",
  "prev track": "{MEDIA_PREV_TRACK}",
  "volume up": "{VOLUME_UP}",
  "volume down": "{VOLUME_DOWN}",
  mute: "{VOLUME_MUTE}",
};

// ─── PowerShell Executor (hardened) ──────────────────────────
// All commands are pre-built — never interpolate user input directly.
// Timeout: 15 seconds (down from 30).

async function runPS(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${command.replace(/"/g, '\\"')}"`,
      { timeout: 15000 }
    );
    if (stderr && !stderr.includes("WARNING")) {
      console.warn("[PC Control] PS stderr:", stderr.substring(0, 200));
    }
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `PowerShell error: ${error instanceof Error ? error.message.substring(0, 200) : "Unknown"}`
    );
  }
}

// ─── Tool Definitions ────────────────────────────────────────

// === SYSTEM TOOLS ===

const openAppTool: Tool = {
  name: "open_app",
  description:
    "Open an application by name. Only whitelisted apps are allowed (browsers, productivity, dev tools, media).",
  category: "pc_control",
  parameters: [
    {
      name: "name",
      type: "string",
      description:
        "App name: chrome, firefox, edge, notepad, calculator, vscode, spotify, discord, slack, word, excel, teams, explorer, terminal, etc.",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const name = (params.name as string).toLowerCase().trim();
    const executable = APP_ALLOWLIST[name];

    if (!executable) {
      return {
        toolCallId: "",
        success: false,
        error: `"${name}" is not in the allowed app list. Available: ${Object.keys(APP_ALLOWLIST).join(", ")}`,
      };
    }

    try {
      await runPS(`Start-Process '${executable}'`);
      return {
        toolCallId: "",
        success: true,
        data: { message: `Opened ${name}`, executable },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to open ${name}: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const closeAppTool: Tool = {
  name: "close_app",
  description:
    "Close a running application by process name. Only whitelisted processes can be closed.",
  category: "pc_control",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Process name to close (e.g., 'chrome', 'notepad', 'spotify')",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const raw = (params.name as string).toLowerCase().trim();

    // Resolve friendly name → process name if needed
    const processName = APP_ALLOWLIST[raw] || raw;

    if (!CLOSEABLE_PROCESSES.has(processName)) {
      return {
        toolCallId: "",
        success: false,
        error: `"${raw}" is not in the closeable process list. Closeable: ${[...CLOSEABLE_PROCESSES].join(", ")}`,
      };
    }

    try {
      await runPS(
        `Stop-Process -Name '${processName}' -Force -ErrorAction SilentlyContinue`
      );
      return {
        toolCallId: "",
        success: true,
        data: { message: `Closed ${raw}` },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to close ${raw}: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const getSystemInfoTool: Tool = {
  name: "get_system_info",
  description:
    "Get real system stats: CPU usage %, RAM used/total, disk usage %.",
  category: "pc_control",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      // Single PS call with JSON output — no user input involved
      // Note: avoid double quotes in filter strings because runPS wraps
      // the whole command in "..." and escaping breaks. Use Where-Object instead.
      const psCommand = `
        $cpu = (Get-CimInstance Win32_Processor).LoadPercentage;
        $os = Get-CimInstance Win32_OperatingSystem;
        $memTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1);
        $memUsed = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 1);
        $disk = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq 'C:' };
        $diskUsed = [math]::Round(($disk.Size - $disk.FreeSpace) / 1GB, 1);
        $diskTotal = [math]::Round($disk.Size / 1GB, 1);
        @{ cpu=$cpu; memUsedGB=$memUsed; memTotalGB=$memTotal; diskUsedGB=$diskUsed; diskTotalGB=$diskTotal } | ConvertTo-Json
      `;
      const result = await runPS(psCommand);
      const info = JSON.parse(result);

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `CPU: ${info.cpu}% | RAM: ${info.memUsedGB}/${info.memTotalGB} GB | Disk C: ${info.diskUsedGB}/${info.diskTotalGB} GB`,
          ...info,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to get system info: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const setVolumeTool: Tool = {
  name: "set_volume",
  description: "Set the system volume level (0-100).",
  category: "pc_control",
  parameters: [
    {
      name: "percent",
      type: "number",
      description: "Volume level from 0 to 100",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const level = Math.max(0, Math.min(100, Math.round(params.percent as number)));

    try {
      // Use AudioEndpointVolume COM — no user input in command
      const psCommand = `
        Add-Type -TypeDefinition '
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
          int _0(); int _1(); int _2(); int _3();
          int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
          int _5();
          int GetMasterVolumeLevelScalar(out float pfLevel);
          int _7(); int _8(); int _9(); int _10(); int _11(); int _12();
        }
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
        public class Audio {
          public static void SetVolume(float level) {
            var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
            IMMDevice dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            var iid = typeof(IAudioEndpointVolume).GUID;
            IAudioEndpointVolume vol; dev.Activate(ref iid, 1, 0, out vol);
            vol.SetMasterVolumeLevelScalar(level, System.Guid.Empty);
          }
        }' -ErrorAction SilentlyContinue;
        [Audio]::SetVolume(${level / 100})
      `;
      await runPS(psCommand);

      return {
        toolCallId: "",
        success: true,
        data: { message: `Volume set to ${level}%`, level },
      };
    } catch {
      // Fallback: SendKeys approach (less precise but works everywhere)
      try {
        const keyPresses = Math.round(level / 2);
        await runPS(
          `$w = New-Object -ComObject wscript.shell; 1..50 | %{ $w.SendKeys([char]174) }; 1..${keyPresses} | %{ $w.SendKeys([char]175) }`
        );
        return {
          toolCallId: "",
          success: true,
          data: { message: `Volume set to ~${level}% (fallback method)`, level },
        };
      } catch (error) {
        return {
          toolCallId: "",
          success: false,
          error: `Failed to set volume: ${error instanceof Error ? error.message : "Unknown"}`,
        };
      }
    }
  },
};

const takeScreenshotTool: Tool = {
  name: "take_screenshot",
  description: "Take a screenshot and save it to the Pictures folder. Returns the file path.",
  category: "pc_control",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      // No user input — timestamp is generated server-side
      const timestamp = Date.now();
      const psCommand = `
        Add-Type -AssemblyName System.Windows.Forms;
        Add-Type -AssemblyName System.Drawing;
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
        $bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height);
        $gfx = [System.Drawing.Graphics]::FromImage($bmp);
        $gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size);
        $path = [Environment]::GetFolderPath('MyPictures') + '\\JARVIS_screenshot_${timestamp}.png';
        $bmp.Save($path);
        $gfx.Dispose(); $bmp.Dispose();
        $path
      `;
      const savedPath = await runPS(psCommand);

      return {
        toolCallId: "",
        success: true,
        data: { message: "Screenshot saved", path: savedPath },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to take screenshot: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const getActiveWindowTool: Tool = {
  name: "get_active_window",
  description: "Get the title of the currently active (foreground) window.",
  category: "pc_control",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const psCommand = `
        Add-Type -TypeDefinition '
        using System; using System.Runtime.InteropServices; using System.Text;
        public class Win32 {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll", CharSet=CharSet.Unicode)]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        }' -ErrorAction SilentlyContinue;
        $h = [Win32]::GetForegroundWindow();
        $sb = New-Object System.Text.StringBuilder 256;
        [Win32]::GetWindowText($h, $sb, 256) | Out-Null;
        $sb.ToString()
      `;
      const title = await runPS(psCommand);

      return {
        toolCallId: "",
        success: true,
        data: { message: `Active window: "${title}"`, title },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to get active window: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const lockScreenTool: Tool = {
  name: "lock_screen",
  description: "Lock the computer screen.",
  category: "pc_control",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      await runPS("rundll32.exe user32.dll,LockWorkStation");
      return {
        toolCallId: "",
        success: true,
        data: { message: "Screen locked" },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to lock screen: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// === KEYBOARD TOOLS ===

const keyPressTool: Tool = {
  name: "key_press",
  description:
    "Press a single key: enter, escape, tab, space, f1-f12, arrow keys, backspace, delete, home, end, etc.",
  category: "pc_control",
  parameters: [
    {
      name: "key",
      type: "string",
      description: "Key name (e.g., 'enter', 'escape', 'f5', 'up', 'space')",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const key = (params.key as string).toLowerCase().trim();
    const sendKey = KEY_COMBO_MAP[key];

    if (!sendKey) {
      return {
        toolCallId: "",
        success: false,
        error: `Unknown key: "${key}". Available: ${Object.keys(KEY_COMBO_MAP).filter((k) => !k.includes("+")).join(", ")}`,
      };
    }

    try {
      await runPS(
        `$w = New-Object -ComObject wscript.shell; $w.SendKeys('${sendKey}')`
      );
      return {
        toolCallId: "",
        success: true,
        data: { message: `Pressed: ${key}` },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to press ${key}: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const keyComboTool: Tool = {
  name: "key_combo",
  description:
    "Press a keyboard shortcut. Only safe combos allowed: ctrl+c, ctrl+v, ctrl+z, ctrl+s, alt+tab, win+d, etc.",
  category: "pc_control",
  parameters: [
    {
      name: "keys",
      type: "string",
      description:
        "Key combination (e.g., 'ctrl+c', 'ctrl+v', 'alt+tab', 'ctrl+shift+tab')",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const combo = (params.keys as string).toLowerCase().trim();
    const sendKeys = KEY_COMBO_MAP[combo];

    if (!sendKeys) {
      const combos = Object.keys(KEY_COMBO_MAP).filter((k) => k.includes("+"));
      return {
        toolCallId: "",
        success: false,
        error: `"${combo}" is not in the allowed combo list. Available: ${combos.join(", ")}`,
      };
    }

    try {
      await runPS(
        `$w = New-Object -ComObject wscript.shell; $w.SendKeys('${sendKeys}')`
      );
      return {
        toolCallId: "",
        success: true,
        data: { message: `Pressed: ${combo}` },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to press ${combo}: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const typeTextTool: Tool = {
  name: "type_text",
  description:
    "Type text into the active window. Max 500 characters. Text is sanitized for safety.",
  category: "pc_control",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "Text to type (max 500 chars)",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const raw = params.text as string;

    if (!raw || raw.length === 0) {
      return {
        toolCallId: "",
        success: false,
        error: "Text cannot be empty.",
      };
    }

    if (raw.length > 500) {
      return {
        toolCallId: "",
        success: false,
        error: "Text too long (max 500 characters).",
      };
    }

    // SendKeys special chars: +^%~{}[]() need escaping with {}
    const escaped = raw.replace(/[+^%~{}[\]()]/g, "{$&}");
    const safe = sanitize(escaped);

    try {
      await runPS(
        `$w = New-Object -ComObject wscript.shell; $w.SendKeys('${safe}')`
      );
      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Typed: "${raw.substring(0, 60)}${raw.length > 60 ? "..." : ""}"`,
          length: raw.length,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to type text: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// === MOUSE TOOLS ===

const mouseMoveTool: Tool = {
  name: "mouse_move",
  description: "Move the mouse cursor to screen coordinates (x, y).",
  category: "pc_control",
  parameters: [
    { name: "x", type: "number", description: "X coordinate (pixels from left)", required: true },
    { name: "y", type: "number", description: "Y coordinate (pixels from top)", required: true },
  ],
  execute: async (params): Promise<ToolResult> => {
    const x = Math.round(params.x as number);
    const y = Math.round(params.y as number);

    if (x < 0 || y < 0 || x > 10000 || y > 10000) {
      return { toolCallId: "", success: false, error: "Coordinates out of range (0-10000)." };
    }

    try {
      await runPS(
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`
      );
      return {
        toolCallId: "",
        success: true,
        data: { message: `Mouse moved to (${x}, ${y})`, x, y },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to move mouse: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const mouseClickTool: Tool = {
  name: "mouse_click",
  description: "Click the mouse at the given coordinates. Default: left click.",
  category: "pc_control",
  parameters: [
    { name: "x", type: "number", description: "X coordinate", required: true },
    { name: "y", type: "number", description: "Y coordinate", required: true },
    {
      name: "button",
      type: "string",
      description: "Mouse button: left (default) or right",
      required: false,
      enum: ["left", "right"],
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const x = Math.round(params.x as number);
    const y = Math.round(params.y as number);
    const button = (params.button as string) || "left";

    if (x < 0 || y < 0 || x > 10000 || y > 10000) {
      return { toolCallId: "", success: false, error: "Coordinates out of range (0-10000)." };
    }

    // mouse_event flags: left down=0x02, left up=0x04, right down=0x08, right up=0x10
    const downFlag = button === "right" ? "0x08" : "0x02";
    const upFlag = button === "right" ? "0x10" : "0x04";

    try {
      await runPS(`
        Add-Type -TypeDefinition '
        using System; using System.Runtime.InteropServices;
        public class MouseSim {
          [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
          [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
        }' -ErrorAction SilentlyContinue;
        [MouseSim]::SetCursorPos(${x}, ${y});
        Start-Sleep -Milliseconds 50;
        [MouseSim]::mouse_event(${downFlag}, 0, 0, 0, 0);
        [MouseSim]::mouse_event(${upFlag}, 0, 0, 0, 0)
      `);
      return {
        toolCallId: "",
        success: true,
        data: { message: `${button} click at (${x}, ${y})`, x, y, button },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to click: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const mouseScrollTool: Tool = {
  name: "mouse_scroll",
  description: "Scroll the mouse wheel up or down by a given amount.",
  category: "pc_control",
  parameters: [
    {
      name: "direction",
      type: "string",
      description: "'up' or 'down'",
      required: true,
      enum: ["up", "down"],
    },
    {
      name: "amount",
      type: "number",
      description: "Scroll ticks (1-20, default: 3)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const direction = (params.direction as string).toLowerCase();
    const amount = Math.max(1, Math.min(20, Math.round((params.amount as number) || 3)));

    if (direction !== "up" && direction !== "down") {
      return { toolCallId: "", success: false, error: "Direction must be 'up' or 'down'." };
    }

    // mouse_event MOUSEEVENTF_WHEEL = 0x0800, wheel delta = 120 per tick
    const delta = direction === "up" ? 120 * amount : -120 * amount;

    try {
      await runPS(`
        Add-Type -TypeDefinition '
        using System; using System.Runtime.InteropServices;
        public class MouseScroll {
          [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
        }' -ErrorAction SilentlyContinue;
        [MouseScroll]::mouse_event(0x0800, 0, 0, ${delta}, 0)
      `);
      return {
        toolCallId: "",
        success: true,
        data: { message: `Scrolled ${direction} ${amount} ticks`, direction, amount },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to scroll: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

const getMousePositionTool: Tool = {
  name: "get_mouse_position",
  description: "Get the current mouse cursor position (x, y).",
  category: "pc_control",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const result = await runPS(
        `Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; @{x=$p.X; y=$p.Y} | ConvertTo-Json`
      );
      const pos = JSON.parse(result);
      return {
        toolCallId: "",
        success: true,
        data: { message: `Mouse at (${pos.x}, ${pos.y})`, x: pos.x, y: pos.y },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to get mouse position: ${error instanceof Error ? error.message : "Unknown"}`,
      };
    }
  },
};

// ─── Registration ────────────────────────────────────────────

export function registerPcControlTools(): void {
  // System (6)
  toolRegistry.register(openAppTool);
  toolRegistry.register(closeAppTool);
  toolRegistry.register(getSystemInfoTool);
  toolRegistry.register(setVolumeTool);
  toolRegistry.register(takeScreenshotTool);
  toolRegistry.register(getActiveWindowTool);
  toolRegistry.register(lockScreenTool);

  // Keyboard (3)
  toolRegistry.register(keyPressTool);
  toolRegistry.register(keyComboTool);
  toolRegistry.register(typeTextTool);

  // Mouse (4)
  toolRegistry.register(mouseMoveTool);
  toolRegistry.register(mouseClickTool);
  toolRegistry.register(mouseScrollTool);
  toolRegistry.register(getMousePositionTool);
}
