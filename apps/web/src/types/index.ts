export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export type ConnectionStatus = "connected" | "disconnected" | "checking";

export interface HealthResponse {
  ok: boolean;
  timestamp: string;
  version: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

// Tool Control Types
export type ToolCategory = "pc" | "smart_home" | "bluetooth" | "media" | "productivity";

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: string;
  isEnabled: boolean;
  action: string;
}

// Bluetooth Types
export type BluetoothDeviceType = "speaker" | "headphones" | "keyboard" | "mouse" | "other";

export interface BluetoothDevice {
  id: string;
  name: string;
  type: BluetoothDeviceType;
  connected: boolean;
  batteryLevel?: number;
  lastConnected?: Date;
}

// Smart Home Types
export interface SmartLight {
  id: string;
  name: string;
  room: string;
  isOn: boolean;
  brightness: number;
  color: string;
}

export interface SmartHomeState {
  lights: SmartLight[];
  ambientMode: boolean;
}

// Voice Types (for future TTS integration)
export interface VoiceConfig {
  enabled: boolean;
  voice: string;
  speed: number;
  pitch: number;
  volume: number;
}

// System Status Types
export interface SystemStatus {
  cpu: number;
  memory: number;
  network: "connected" | "disconnected";
  bluetooth: "on" | "off";
}
