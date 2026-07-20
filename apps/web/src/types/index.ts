export type Role = "user" | "assistant";

// One tool invocation inside an assistant turn — rendered as a cognition
// chip in the chat ("🧠 RECALL", "✎ REMEMBER → Abe", "⚙ browser_open").
export interface ToolActivity {
  id: string;
  tool: string;
  detail?: string; // short human label derived from parameters (query, entity…)
  status: "running" | "done" | "error";
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  activity?: ToolActivity[];
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
  llm?: { provider: string; model: string; configured: boolean };
  tools?: number;
  tts?: boolean;
}

// ─── Brain (the Obsidian mind) ──────────────────────────────

export interface BrainStatus {
  notes: number;
  chunks: number;
  entities: number;
  lastIndexed: string | null;
  vaultPath: string;
  reflection: {
    lastDate: string | null;
    lastRunAt: string | null;
    lastSummary: string;
    lastFactsAdded: number;
    lastError: string | null;
  };
}

export interface BrainLearning {
  at: string;
  entity: string;
  type: string;
  observation: string;
  category: string;
  source: "chat" | "reflection" | "manual";
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
