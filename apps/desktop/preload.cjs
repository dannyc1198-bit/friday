const { contextBridge, ipcRenderer } = require("electron");

const shell = process.argv.find((arg) => arg.startsWith("--jarvis-shell="))?.split("=")[1] || "centre";

contextBridge.exposeInMainWorld("jarvis", {
  shell,
  metrics: () => ipcRenderer.invoke("jarvis:metrics"),
  health: () => ipcRenderer.invoke("jarvis:health"),
  layout: (mode) => ipcRenderer.send("jarvis:layout", mode),
  playback: (id, state) => ipcRenderer.invoke("jarvis:playback", id, state),
  interrupt: (id) => ipcRenderer.invoke("jarvis:interrupt", id),
  arm: () => ipcRenderer.invoke("jarvis:arm"),
  onEvent: (callback) => {
    const handler = (_event, raw) => callback(String(raw));
    ipcRenderer.on("jarvis:event", handler);
    return () => ipcRenderer.removeListener("jarvis:event", handler);
  },
  onAudio: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("jarvis:audio", handler);
    return () => ipcRenderer.removeListener("jarvis:audio", handler);
  },
  onHotkey: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("jarvis:hotkey", handler);
    return () => ipcRenderer.removeListener("jarvis:hotkey", handler);
  },
});
