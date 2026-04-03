"""
Memory Loader — Loads Danny's full context into sidecar voice conversations.
Reads MASTER_MEMORY.md, tracks behavioral patterns, maintains conversation summaries.
"""
import json
import time
import logging
from pathlib import Path
from datetime import datetime

from config import SIDECAR_DIR, DATA_DIR

log = logging.getLogger("sidecar.memory")

MASTER_MEMORY_PATHS = [
    Path.home() / "Desktop" / "jarvis" / "MASTER_MEMORY.md",
    Path.home() / "Desktop" / "JARVIS" / "MASTER_MEMORY.md",
    Path.home() / "jarvis" / "MASTER_MEMORY.md",
]

PATTERNS_FILE = DATA_DIR / "behavioral-patterns.json"
SUMMARIES_FILE = DATA_DIR / "conversation-summaries.json"

# Cache
_master_memory_cache: str | None = None
_master_memory_loaded_at: float = 0
CACHE_TTL = 300  # 5 minutes


def _load_master_memory_raw() -> str:
    """Load the raw MASTER_MEMORY.md file."""
    for path in MASTER_MEMORY_PATHS:
        if path.exists():
            log.info(f"Loading MASTER_MEMORY from {path}")
            return path.read_text(encoding="utf-8")
    return ""


def _extract_key_sections(raw: str) -> str:
    """Extract the most relevant sections for voice context."""
    sections = []
    keep_headers = [
        "SECTION 1: DANNY",
        "SECTION 2: WAVELENGTH AI",
        "SECTION 4: ALL PROJECTS",
        "SECTION 13: BEHAVIORAL RULES",
        "SECTION 14: PENDING TASKS",
    ]

    for block in raw.split("\n# "):
        for header in keep_headers:
            if header in block:
                sections.append("# " + block.strip())
                break

    return "\n\n".join(sections)


def load_master_memory() -> str:
    """Load and cache MASTER_MEMORY.md with key sections extracted."""
    global _master_memory_cache, _master_memory_loaded_at

    now = time.time()
    if _master_memory_cache is not None and now - _master_memory_loaded_at < CACHE_TTL:
        return _master_memory_cache

    raw = _load_master_memory_raw()
    if raw:
        _master_memory_cache = _extract_key_sections(raw)
    else:
        _master_memory_cache = ""
    _master_memory_loaded_at = now
    return _master_memory_cache


# ─── Behavioral Patterns ──────────────────────────────────────

def load_behavioral_patterns() -> list[dict]:
    try:
        if PATTERNS_FILE.exists():
            return json.loads(PATTERNS_FILE.read_text())
    except Exception:
        pass
    return []


def record_behavioral_pattern(pattern: str):
    """Record or reinforce a behavioral pattern."""
    patterns = load_behavioral_patterns()
    existing = next((p for p in patterns if p["pattern"] == pattern), None)

    if existing:
        existing["count"] = existing.get("count", 1) + 1
        existing["confidence"] = min(1.0, existing.get("confidence", 0.5) + 0.1)
        existing["last_observed"] = datetime.now().isoformat()
    else:
        patterns.append({
            "pattern": pattern,
            "confidence": 0.5,
            "last_observed": datetime.now().isoformat(),
            "count": 1,
        })

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PATTERNS_FILE.write_text(json.dumps(patterns, indent=2))


def format_behavioral_patterns() -> str:
    patterns = load_behavioral_patterns()
    strong = [p for p in patterns if p.get("confidence", 0) >= 0.6]
    if not strong:
        return ""
    lines = [f"- {p['pattern']} (observed {p.get('count', 1)}x)" for p in strong]
    return "LEARNED BEHAVIORAL PATTERNS:\n" + "\n".join(lines)


# ─── Conversation Summaries ───────────────────────────────────

def load_conversation_summaries() -> list[dict]:
    try:
        if SUMMARIES_FILE.exists():
            return json.loads(SUMMARIES_FILE.read_text())
    except Exception:
        pass
    return []


def save_conversation_summary(user_msg: str, jarvis_reply: str):
    """Save a conversation exchange for cross-session memory."""
    summaries = load_conversation_summaries()
    today = datetime.now().strftime("%Y-%m-%d")

    entry = {
        "date": today,
        "summary": f"Danny: {user_msg[:80]} → JARVIS: {jarvis_reply[:80]}",
        "timestamp": time.time(),
    }

    # Update today's entry or add new
    existing_idx = next((i for i, s in enumerate(summaries) if s.get("date") == today), -1)
    if existing_idx >= 0:
        summaries[existing_idx] = entry
    else:
        summaries.append(entry)

    # Keep last 30 days
    cutoff = time.time() - 30 * 86400
    summaries = [s for s in summaries if s.get("timestamp", 0) > cutoff]

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARIES_FILE.write_text(json.dumps(summaries, indent=2))


def format_conversation_summaries() -> str:
    summaries = load_conversation_summaries()
    if not summaries:
        return ""
    recent = summaries[-7:]
    lines = [f"- {s['date']}: {s['summary']}" for s in recent]
    return f"RECENT CONVERSATIONS (last {len(recent)} days):\n" + "\n".join(lines)


# ─── Build full context for voice engine ──────────────────────

def build_voice_memory_context() -> str:
    """Build the full memory context for sidecar voice conversations."""
    parts = []

    master = load_master_memory()
    if master:
        parts.append("--- DANNY'S CONTEXT ---\n" + master)

    behavior = format_behavioral_patterns()
    if behavior:
        parts.append(behavior)

    convs = format_conversation_summaries()
    if convs:
        parts.append(convs)

    now = datetime.now()
    parts.append(f"CURRENT: {now.strftime('%A, %B %d %Y at %I:%M %p')}")

    return "\n\n".join(parts)
