export const APP_NAME = "FRIDAY";
export const APP_VERSION = "0.1.0";

export const HEALTH_CHECK_INTERVAL = 5000; // 5 seconds

export const TYPING_SPEED = 20; // ms per character

export const GREETING_MESSAGES = [
  "Good morning",
  "Good afternoon", 
  "Good evening",
];

export const USER_NAME = "Danny";

// FRIDAY personality traits
export const FRIDAY_TRAITS = {
  name: "FRIDAY",
  fullName: "Female Replacement Intelligent Digital Assistant Youth",
  creator: "You",
  personality: "witty, helpful, slightly sarcastic but always respectful",
  voiceStyle: "British butler with technical expertise",
};

// Tool categories for the control panel
export const TOOL_CATEGORIES = {
  PC_CONTROL: "pc",
  SMART_HOME: "smart_home",
  BLUETOOTH: "bluetooth",
  MEDIA: "media",
  PRODUCTIVITY: "productivity",
} as const;

// Smart home default settings
export const SMART_HOME_DEFAULTS = {
  startupLightColor: "#0066ff", // Blue
  ambientMode: true,
};

// Bluetooth device types
export const BLUETOOTH_DEVICE_TYPES = {
  SPEAKER: "speaker",
  HEADPHONES: "headphones",
  KEYBOARD: "keyboard",
  MOUSE: "mouse",
  OTHER: "other",
} as const;
