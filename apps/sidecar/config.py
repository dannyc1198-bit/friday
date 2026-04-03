"""
Unified JARVIS Sidecar — Configuration
Loads API keys from the orchestrator .env and defines shared constants.
"""
import os
from pathlib import Path

def load_env():
    """Load keys from jarvis orchestrator .env as the single source of truth."""
    env_path = Path.home() / "jarvis" / "apps" / "orchestrator" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                if key.strip() not in os.environ:
                    os.environ[key.strip()] = value.strip()

load_env()

# ─── API Keys ──────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "onwK4e9ZLuTAKqWW03F9")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
VAPI_API_KEY = os.environ.get("VAPI_API_KEY", "")
VAPI_ASSISTANT_ID = os.environ.get("VAPI_ASSISTANT_ID", "")

# ─── URLs ──────────────────────────────────────────────────────
ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://localhost:3001")
SIDECAR_PORT = int(os.environ.get("SIDECAR_PORT", "3002"))

# ─── Vision / Kitchen Nagger ──────────────────────────────────
CHECK_INTERVAL = 180          # seconds between camera scans
MESS_THRESHOLD = 4            # nag if mess level >= this (1-10)
NAG_COOLDOWN = 300            # 5 min between nags
PERSON_GONE_TIMEOUT = 600     # 10 min = person left

# ─── Security ─────────────────────────────────────────────────
SECURITY_ALERT_COOLDOWN = 1800  # 30 min per alert type (fixes spam)

# ─── Voice ────────────────────────────────────────────────────
WAKE_WORD = "jarvis"
CONVERSATION_TIMEOUT = 60     # seconds of silence before returning to sleep
CLAUDE_MODEL = "claude-sonnet-4-20250514"
CLAUDE_HAIKU = "claude-haiku-4-5-20241022"

# ─── Paths ────────────────────────────────────────────────────
SIDECAR_DIR = Path(__file__).parent
STATE_FILE = SIDECAR_DIR / "state.json"
DATA_DIR = SIDECAR_DIR / "data"
FRAMES_DIR = DATA_DIR / "frames"
CONVERSATIONS_DIR = DATA_DIR / "conversations"

ESCALATION_LEVELS = ["gentle", "firm", "stern", "drill_sergeant"]
