// Music tools — local MP3 library + Windows media keys
// Replaces the cut Spotify integration. No internet, no API keys.
//
// Library layout (Danny's choice):
//   ~/Music/lofi/*.mp3
//   ~/Music/focus/*.mp3
//   ~/Music/hype/*.mp3
//   ~/Music/chill/*.mp3
// Falls back to ~/Music/ if a mood folder is empty.

import { exec } from "child_process";
import { promisify } from "util";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

const execAsync = promisify(exec);

const HOME = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368";
const MUSIC_ROOT = join(HOME, "Music");

// Mood → subfolder. Add or rename to match your library.
const MOOD_FOLDERS: Record<string, string> = {
  lofi: "lofi",
  "lo-fi": "lofi",
  focus: "focus",
  hype: "hype",
  chill: "chill",
  workout: "hype",
};

const AUDIO_EXTS = new Set([".mp3", ".m4a", ".flac", ".wav", ".ogg"]);

function listTracks(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => AUDIO_EXTS.has(f.slice(f.lastIndexOf(".")).toLowerCase()))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Send a media-key virtual keystroke via PowerShell SendKeys.
// VK codes: PLAY_PAUSE=0xB3, NEXT=0xB0, PREV=0xB1, STOP=0xB2, VOL_UP=0xAF, VOL_DOWN=0xAE, VOL_MUTE=0xAD
async function sendMediaKey(vk: number): Promise<void> {
  const ps = `Add-Type -AssemblyName System.Windows.Forms; ` +
    `$sig = '[DllImport("user32.dll")]public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);'; ` +
    `$kb = Add-Type -MemberDefinition $sig -Name KB -Namespace WinAPI -PassThru; ` +
    `$kb::keybd_event(${vk}, 0, 0, 0); $kb::keybd_event(${vk}, 0, 2, 0);`;
  await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 5000 });
}

// ─── play_music ─────────────────────────────────────────────────

const playMusic: Tool = {
  name: "play_music",
  description: "Play music from local library. Optionally specify mood (lofi, focus, hype, chill, workout). Plays a shuffled track from the matching folder via the default Windows player.",
  category: "Media",
  parameters: {
    type: "object",
    properties: {
      mood: { type: "string", description: "Mood/playlist (lofi, focus, hype, chill, workout). Optional — defaults to entire library." },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    const mood = (params.mood as string | undefined)?.toLowerCase().trim();
    const subfolder = mood ? MOOD_FOLDERS[mood] : null;

    let dir = MUSIC_ROOT;
    if (subfolder) {
      const moodDir = join(MUSIC_ROOT, subfolder);
      if (existsSync(moodDir)) dir = moodDir;
    }

    let tracks = listTracks(dir);
    if (tracks.length === 0 && dir !== MUSIC_ROOT) {
      // Mood folder empty — fall back to root library
      dir = MUSIC_ROOT;
      tracks = listTracks(dir);
    }

    if (tracks.length === 0) {
      return {
        toolCallId: "",
        success: false,
        error: `Music library appears empty, sir. Drop some MP3s in ${MUSIC_ROOT} and I'll happily oblige.`,
      };
    }

    const pick = shuffle(tracks)[0];
    try {
      // Open with default media app — non-blocking
      await execAsync(`start "" "${pick}"`, { timeout: 5000, windowsHide: true, shell: "cmd.exe" } as any);
      const name = pick.split(/[\\/]/).pop();
      return {
        toolCallId: "",
        success: true,
        data: { track: name, folder: dir, mood: mood ?? "any" },
      };
    } catch (e) {
      return { toolCallId: "", success: false, error: `Could not launch player: ${(e as Error).message}` };
    }
  },
};

// ─── Media key tools ────────────────────────────────────────────

function mediaKeyTool(name: string, desc: string, vk: number): Tool {
  return {
    name,
    description: desc,
    category: "Media",
    parameters: { type: "object", properties: {} },
    execute: async (): Promise<ToolResult> => {
      try {
        await sendMediaKey(vk);
        return { toolCallId: "", success: true, data: { sent: name } };
      } catch (e) {
        return { toolCallId: "", success: false, error: (e as Error).message };
      }
    },
  };
}

const musicPause    = mediaKeyTool("music_pause",    "Pause/resume current media playback (media play/pause key).", 0xB3);
const musicNext     = mediaKeyTool("music_next",     "Skip to next track.", 0xB0);
const musicPrevious = mediaKeyTool("music_previous", "Skip to previous track.", 0xB1);
const musicStop     = mediaKeyTool("music_stop",     "Stop media playback.", 0xB2);
const musicMute     = mediaKeyTool("music_mute",     "Toggle system volume mute.", 0xAD);

// ─── Volume tool ────────────────────────────────────────────────

const musicVolume: Tool = {
  name: "music_volume",
  description: "Step system volume up or down. Each step is roughly 2%. Use direction='up' or 'down' with optional steps (1-25).",
  category: "Media",
  parameters: {
    type: "object",
    properties: {
      direction: { type: "string", enum: ["up", "down"], description: "Volume direction" },
      steps: { type: "number", description: "Number of 2% steps (1-25). Default 5." },
    },
    required: ["direction"],
  },
  execute: async (params): Promise<ToolResult> => {
    const direction = params.direction as "up" | "down";
    const steps = Math.min(25, Math.max(1, (params.steps as number) ?? 5));
    const vk = direction === "up" ? 0xAF : 0xAE;
    try {
      for (let i = 0; i < steps; i++) await sendMediaKey(vk);
      return { toolCallId: "", success: true, data: { direction, steps } };
    } catch (e) {
      return { toolCallId: "", success: false, error: (e as Error).message };
    }
  },
};

export function registerMusicTools(): void {
  toolRegistry.register(playMusic);
  toolRegistry.register(musicPause);
  toolRegistry.register(musicNext);
  toolRegistry.register(musicPrevious);
  toolRegistry.register(musicStop);
  toolRegistry.register(musicMute);
  toolRegistry.register(musicVolume);
}
