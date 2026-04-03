"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BluetoothDevice, SmartLight, Tool } from "@/types";

// Mock data for tools
const AVAILABLE_TOOLS: Tool[] = [
  {
    id: "1",
    name: "Open App",
    description: "Launch any application",
    category: "pc",
    icon: "rocket",
    isEnabled: true,
    action: "open_app",
  },
  {
    id: "2",
    name: "File Manager",
    description: "Browse and manage files",
    category: "pc",
    icon: "folder",
    isEnabled: true,
    action: "file_manager",
  },
  {
    id: "3",
    name: "System Info",
    description: "View system statistics",
    category: "pc",
    icon: "cpu",
    isEnabled: true,
    action: "system_info",
  },
  {
    id: "4",
    name: "Spotify",
    description: "Control music playback",
    category: "media",
    icon: "music",
    isEnabled: true,
    action: "spotify",
  },
  {
    id: "5",
    name: "Volume Control",
    description: "Adjust system volume",
    category: "media",
    icon: "volume",
    isEnabled: true,
    action: "volume",
  },
];

// Mock Bluetooth devices
const MOCK_BLUETOOTH_DEVICES: BluetoothDevice[] = [
  { id: "bt1", name: "AirPods Pro", type: "headphones", connected: true, batteryLevel: 85 },
  { id: "bt2", name: "JBL Speaker", type: "speaker", connected: false, batteryLevel: 60 },
  { id: "bt3", name: "Logitech MX Keys", type: "keyboard", connected: true, batteryLevel: 100 },
  { id: "bt4", name: "MX Master 3", type: "mouse", connected: true, batteryLevel: 45 },
];

// Mock Smart Lights
const MOCK_LIGHTS: SmartLight[] = [
  { id: "l1", name: "Desk Lamp", room: "Office", isOn: true, brightness: 80, color: "#0066ff" },
  { id: "l2", name: "Ceiling Light", room: "Office", isOn: true, brightness: 100, color: "#ffffff" },
  { id: "l3", name: "LED Strip", room: "Office", isOn: true, brightness: 60, color: "#0066ff" },
  { id: "l4", name: "Living Room", room: "Living", isOn: false, brightness: 50, color: "#ffaa00" },
];

interface ToolControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "tools" | "bluetooth" | "lights";

export function ToolControlPanel({ isOpen, onClose }: ToolControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("tools");
  const [bluetoothDevices, setBluetoothDevices] = useState(MOCK_BLUETOOTH_DEVICES);
  const [lights, setLights] = useState(MOCK_LIGHTS);

  const handleBluetoothToggle = (deviceId: string) => {
    setBluetoothDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId ? { ...d, connected: !d.connected } : d
      )
    );
  };

  const handleLightToggle = (lightId: string) => {
    setLights((prev) =>
      prev.map((l) =>
        l.id === lightId ? { ...l, isOn: !l.isOn } : l
      )
    );
  };

  const handleLightColor = (lightId: string, color: string) => {
    setLights((prev) =>
      prev.map((l) =>
        l.id === lightId ? { ...l, color } : l
      )
    );
  };

  const handleBrightnessChange = (lightId: string, brightness: number) => {
    setLights((prev) =>
      prev.map((l) =>
        l.id === lightId ? { ...l, brightness } : l
      )
    );
  };

  const setAllLightsBlue = () => {
    setLights((prev) =>
      prev.map((l) => ({ ...l, isOn: true, color: "#0066ff" }))
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-blue-900/20 to-transparent">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Control Center</h2>
            <p className="text-sm text-text-muted">Manage your devices and tools</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {[
            { id: "tools" as TabType, label: "PC Tools", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" },
            { id: "bluetooth" as TabType, label: "Bluetooth", icon: "M12 22V2m0 20l5-5m-5 5l-5-5m10-10l-5 5-5-5" },
            { id: "lights" as TabType, label: "Smart Lights", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              )}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
          {/* PC Tools Tab */}
          {activeTab === "tools" && (
            <div className="grid grid-cols-2 gap-4">
              {AVAILABLE_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  className="flex items-start gap-4 p-4 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                >
                  <div className="p-3 rounded-lg bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <ToolIcon name={tool.icon} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-medium text-text-primary">{tool.name}</h3>
                    <p className="text-sm text-text-muted">{tool.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Bluetooth Tab */}
          {activeTab === "bluetooth" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-text-muted">
                  {bluetoothDevices.filter((d) => d.connected).length} devices connected
                </p>
                <button className="text-sm text-primary hover:text-primary-hover">
                  Scan for devices
                </button>
              </div>
              {bluetoothDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-background border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-3 rounded-lg",
                      device.connected ? "bg-primary/20 text-primary" : "bg-white/5 text-text-muted"
                    )}>
                      <BluetoothDeviceIcon type={device.type} />
                    </div>
                    <div>
                      <h3 className="font-medium text-text-primary">{device.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className={device.connected ? "text-success" : "text-text-muted"}>
                          {device.connected ? "Connected" : "Disconnected"}
                        </span>
                        {device.batteryLevel && (
                          <>
                            <span>•</span>
                            <span className={cn(
                              device.batteryLevel < 20 ? "text-error" :
                              device.batteryLevel < 50 ? "text-yellow-500" : "text-success"
                            )}>
                              {device.batteryLevel}% battery
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBluetoothToggle(device.id)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      device.connected
                        ? "bg-error/20 text-error hover:bg-error/30"
                        : "bg-primary/20 text-primary hover:bg-primary/30"
                    )}
                  >
                    {device.connected ? "Disconnect" : "Connect"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Smart Lights Tab */}
          {activeTab === "lights" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-text-muted">
                  {lights.filter((l) => l.isOn).length} of {lights.length} lights on
                </p>
                <button
                  onClick={setAllLightsBlue}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Set All Blue (JARVIS Mode)
                </button>
              </div>
              {lights.map((light) => (
                <div
                  key={light.id}
                  className="p-4 rounded-xl bg-background border border-border space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-full border-2 border-border"
                        style={{ backgroundColor: light.isOn ? light.color : "#333" }}
                      />
                      <div>
                        <h3 className="font-medium text-text-primary">{light.name}</h3>
                        <p className="text-sm text-text-muted">{light.room}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleLightToggle(light.id)}
                      className={cn(
                        "relative w-14 h-8 rounded-full transition-colors",
                        light.isOn ? "bg-primary" : "bg-white/10"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                          light.isOn ? "left-7" : "left-1"
                        )}
                      />
                    </button>
                  </div>
                  {light.isOn && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-text-muted">Brightness</span>
                          <span className="text-text-primary">{light.brightness}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={light.brightness}
                          onChange={(e) => handleBrightnessChange(light.id, parseInt(e.target.value))}
                          className="w-full h-2 rounded-full appearance-none bg-white/10 accent-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm text-text-muted">Color</span>
                        <div className="flex gap-2">
                          {["#ffffff", "#0066ff", "#ff6600", "#00ff66", "#ff0066", "#ffff00"].map((color) => (
                            <button
                              key={color}
                              onClick={() => handleLightColor(light.id, color)}
                              className={cn(
                                "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                                light.color === color ? "border-white" : "border-transparent"
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                          <input
                            type="color"
                            value={light.color}
                            onChange={(e) => handleLightColor(light.id, e.target.value)}
                            className="w-8 h-8 rounded-full cursor-pointer"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    rocket: "M13 10V3L4 14h7v7l9-11h-7z",
    folder: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
    cpu: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
    music: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
    volume: "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z",
  };

  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[name] || icons.rocket} />
    </svg>
  );
}

function BluetoothDeviceIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    headphones: "M3 18v-6a9 9 0 0118 0v6M3 18a3 3 0 003 3h2a3 3 0 003-3v-2a3 3 0 00-3-3H3v5zm18 0a3 3 0 01-3 3h-2a3 3 0 01-3-3v-2a3 3 0 013-3h5v5z",
    speaker: "M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z",
    keyboard: "M4 6h16M4 10h16M4 14h16M4 18h16",
    mouse: "M12 22c4.418 0 8-3.582 8-8V8c0-4.418-3.582-8-8-8S4 3.582 4 8v6c0 4.418 3.582 8 8 8zM12 2v6",
    other: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z",
  };

  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[type] || icons.other} />
    </svg>
  );
}
