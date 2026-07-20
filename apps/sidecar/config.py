"""
Unified FRIDAY Sidecar — Configuration
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
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")  # legacy, only used if Gemini key missing
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")        # vision (gemini-2.5-flash) — free tier
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")            # nag/greeting text gen — free tier
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
WAKE_WORD = "friday"
CONVERSATION_TIMEOUT = 60     # seconds of silence before returning to sleep

# ─── Models ───────────────────────────────────────────────────
GEMINI_VISION_MODEL = "gemini-2.5-flash"          # scene analysis, free tier
GROQ_TEXT_MODEL = "llama-3.3-70b-versatile"       # nag + greeting text gen
# Anthropic model IDs — fallback path only
CLAUDE_MODEL = "claude-sonnet-4-6"
CLAUDE_HAIKU = "claude-haiku-4-5-20251001"

# ─── Paths ────────────────────────────────────────────────────
SIDECAR_DIR = Path(__file__).parent
STATE_FILE = SIDECAR_DIR / "state.json"
DATA_DIR = SIDECAR_DIR / "data"
FRAMES_DIR = DATA_DIR / "frames"
CONVERSATIONS_DIR = DATA_DIR / "conversations"
FACE_DB_DIR = DATA_DIR / "faces"  # enrolled face embeddings live here

# ─── Face Recognition (Option A: hard gate) ───────────────────
FACE_MATCH_THRESHOLD = 0.50       # cosine similarity, see face_recognizer.py (Strict)
FACE_MATCH_MARGIN = 0.10          # top1 - top2 must exceed this; rejects near-ties
FACE_DETECTION_SIZE = (640, 640)  # InsightFace det_size
OWNER_NAME = "danny"              # the only face that gates greetings

ESCALATION_LEVELS = ["gentle", "firm", "stern", "drill_sergeant"]
