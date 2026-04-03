// Intent classification and routing service
// Detects user intent and routes to appropriate tools

export type IntentCategory =
  | "pc_control"
  | "smart_home"
  | "media"
  | "bluetooth"
  | "general"
  | "greeting"
  | "status"
  | "help";

export interface IntentResult {
  category: IntentCategory;
  confidence: number;
  suggestedTools: string[];
  entities: Record<string, string>;
}

// Intent patterns and keywords
const INTENT_PATTERNS: Record<IntentCategory, { keywords: string[]; patterns: RegExp[] }> = {
  greeting: {
    keywords: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy"],
    patterns: [/^(hey|hi|hello|good\s+(morning|afternoon|evening))/i],
  },
  pc_control: {
    keywords: [
      "open", "launch", "start", "close", "quit", "exit",
      "volume", "mute", "unmute", "screenshot", "lock",
      "system", "cpu", "memory", "disk", "battery",
    ],
    patterns: [
      /open\s+(\w+)/i,
      /launch\s+(\w+)/i,
      /close\s+(\w+)/i,
      /set\s+volume\s+to\s+(\d+)/i,
      /take\s+(a\s+)?screenshot/i,
      /lock\s+(the\s+)?(computer|screen|pc)/i,
    ],
  },
  smart_home: {
    keywords: [
      "lights", "light", "lamp", "brightness", "dim",
      "turn on", "turn off", "color", "scene",
      "JARVIS mode", "living room", "bedroom", "kitchen",
    ],
    patterns: [
      /turn\s+(on|off)\s+(the\s+)?lights?/i,
      /set\s+(the\s+)?lights?\s+to\s+(\w+)/i,
      /(dim|brighten)\s+(the\s+)?lights?/i,
      /change\s+(the\s+)?light\s+color\s+to\s+(\w+)/i,
      /JARVIS\s+mode/i,
    ],
  },
  media: {
    keywords: [
      "play", "pause", "stop", "skip", "next", "previous",
      "music", "song", "track", "album", "artist", "playlist",
      "spotify", "volume", "shuffle", "repeat",
      "ac/dc", "acdc", "rock", "thunderstruck",
    ],
    patterns: [
      /play\s+(.+)/i,
      /pause\s+(the\s+)?music/i,
      /skip\s+(this\s+)?(song|track)/i,
      /what('s|s)?\s+(playing|is\s+this)/i,
      /next\s+(song|track)/i,
    ],
  },
  bluetooth: {
    keywords: [
      "bluetooth", "connect", "disconnect", "pair",
      "headphones", "airpods", "speaker", "mouse", "keyboard",
      "wireless", "device", "battery",
    ],
    patterns: [
      /connect\s+(to\s+)?(my\s+)?(\w+)/i,
      /disconnect\s+(from\s+)?(\w+)/i,
      /pair\s+(with\s+)?(\w+)/i,
      /bluetooth\s+(on|off)/i,
      /switch\s+audio\s+to\s+(\w+)/i,
    ],
  },
  status: {
    keywords: ["status", "how are", "what's up", "report", "update"],
    patterns: [/status\s+report/i, /how\s+are\s+(you|things)/i, /system\s+status/i],
  },
  help: {
    keywords: ["help", "what can you do", "commands", "abilities", "capabilities"],
    patterns: [/what\s+can\s+you\s+do/i, /help\s+me/i, /show\s+commands/i],
  },
  general: {
    keywords: [],
    patterns: [],
  },
};

// Tool mapping by intent category
const INTENT_TOOLS: Record<IntentCategory, string[]> = {
  greeting: [],
  pc_control: [
    "open_application",
    "close_application",
    "set_volume",
    "toggle_mute",
    "get_system_info",
    "lock_screen",
    "take_screenshot",
  ],
  smart_home: [
    "get_lights",
    "set_light",
    "set_all_lights",
    "JARVIS_mode",
    "set_scene",
  ],
  media: [
    "play_music",
    "pause_music",
    "resume_music",
    "skip_track",
    "get_now_playing",
    "set_music_volume",
    "toggle_shuffle",
  ],
  bluetooth: [
    "get_bluetooth_devices",
    "connect_bluetooth_device",
    "disconnect_bluetooth_device",
    "toggle_bluetooth",
    "get_device_battery",
    "switch_audio_output",
  ],
  status: ["get_system_info", "get_now_playing", "get_lights", "get_bluetooth_devices"],
  help: [],
  general: [],
};

// Entity extraction patterns
const ENTITY_PATTERNS: Record<string, RegExp> = {
  app_name: /(?:open|launch|start|close|quit)\s+(\w+(?:\s+\w+)?)/i,
  volume_level: /volume\s+(?:to\s+)?(\d+)/i,
  device_name: /(?:connect|disconnect|pair)\s+(?:to\s+)?(?:my\s+)?(.+?)(?:\s+please)?$/i,
  light_color: /(?:color|lights?)\s+(?:to\s+)?(\w+)/i,
  music_query: /play\s+(.+)/i,
  room_name: /(living\s+room|bedroom|kitchen|office|bathroom)/i,
};

/**
 * Classifies user intent from message text
 */
export function classifyIntent(message: string): IntentResult {
  const lowerMessage = message.toLowerCase().trim();
  const scores: Record<IntentCategory, number> = {
    greeting: 0,
    pc_control: 0,
    smart_home: 0,
    media: 0,
    bluetooth: 0,
    status: 0,
    help: 0,
    general: 0,
  };

  // Score based on keywords
  for (const [category, { keywords, patterns }] of Object.entries(INTENT_PATTERNS)) {
    const cat = category as IntentCategory;

    // Keyword matching
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        scores[cat] += 1;
      }
    }

    // Pattern matching (stronger signal)
    for (const pattern of patterns) {
      if (pattern.test(lowerMessage)) {
        scores[cat] += 2;
      }
    }
  }

  // Find highest scoring category
  let maxScore = 0;
  let topCategory: IntentCategory = "general";

  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      topCategory = category as IntentCategory;
    }
  }

  // Calculate confidence (0-1)
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

  // Extract entities
  const entities: Record<string, string> = {};
  for (const [entityType, pattern] of Object.entries(ENTITY_PATTERNS)) {
    const match = message.match(pattern);
    if (match && match[1]) {
      entities[entityType] = match[1].trim();
    }
  }

  return {
    category: topCategory,
    confidence: Math.min(confidence, 1),
    suggestedTools: INTENT_TOOLS[topCategory] || [],
    entities,
  };
}

/**
 * Gets tools relevant to a specific intent
 */
export function getToolsForIntent(category: IntentCategory): string[] {
  return INTENT_TOOLS[category] || [];
}

/**
 * Determines if a message requires tool execution
 */
export function requiresToolExecution(message: string): boolean {
  const intent = classifyIntent(message);
  return (
    intent.category !== "greeting" &&
    intent.category !== "help" &&
    intent.category !== "general" &&
    intent.suggestedTools.length > 0
  );
}
