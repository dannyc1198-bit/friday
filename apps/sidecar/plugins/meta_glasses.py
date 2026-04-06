"""
Meta Glasses Vision — Claw Vision for Meta Ray-Ban Gen 2
=========================================================
Watches the Meta View sync folder for new photos from the glasses.
When a photo lands, sends it to Claude Vision and returns a description.
Response is spoken aloud + pushed to JARVIS orchestrator.

Setup:
  1. Install Meta View on Windows (it auto-syncs glasses captures)
  2. Set GLASSES_SYNC_FOLDER in .env, or leave as default: ~/Pictures/Meta
  3. On your glasses: say "Hey Meta, take a photo" — it syncs automatically
  4. Or: press the capture button on the frame

For on-demand queries ("What am I looking at?"), use the /api/glasses/ask endpoint.

Capture folder default: C:/Users/<you>/Pictures/Meta
"""
import base64
import logging
import threading
import time
from datetime import datetime
from pathlib import Path

import anthropic
import httpx

log = logging.getLogger("sidecar.glasses")

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}


class MetaGlassesVision:
    def __init__(self, anthropic_api_key: str, orchestrator_url: str, voice_engine=None):
        self._api_key = anthropic_api_key
        self._orchestrator_url = orchestrator_url
        self._voice = voice_engine
        self._running = False
        self._thread: threading.Thread | None = None

        # Folder to watch — Meta View syncs here by default
        self._sync_folder: Path | None = None
        self._seen_files: set[str] = set()

        # Last captured image (bytes) and its description
        self._last_image_bytes: bytes | None = None
        self._last_description: str = ""
        self._last_capture_time: str = ""
        self._last_capture_path: str = ""
        self._lock = threading.Lock()

        # Client
        self._client = anthropic.Anthropic(api_key=anthropic_api_key)

    # ─── Start / Stop ─────────────────────────────────────────────

    def start(self, sync_folder: str | Path | None = None):
        """Start watching the glasses sync folder."""
        if sync_folder:
            self._sync_folder = Path(sync_folder)
        else:
            # Default Meta View sync location
            self._sync_folder = Path.home() / "Pictures" / "Meta"

        if not self._sync_folder.exists():
            log.warning(
                f"Glasses sync folder not found: {self._sync_folder}. "
                "Create it or install Meta View — glasses won't be watched until it exists."
            )

        # Seed seen files so we don't describe old photos on startup
        if self._sync_folder.exists():
            for f in self._sync_folder.rglob("*"):
                if f.suffix.lower() in SUPPORTED_EXTENSIONS:
                    self._seen_files.add(str(f))

        log.info(f"Meta Glasses Vision: watching {self._sync_folder} ({len(self._seen_files)} existing files seeded)")

        self._running = True
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    # ─── Status ───────────────────────────────────────────────────

    def get_status(self) -> dict:
        with self._lock:
            return {
                "watching": self._running,
                "sync_folder": str(self._sync_folder) if self._sync_folder else None,
                "folder_exists": self._sync_folder.exists() if self._sync_folder else False,
                "files_seen": len(self._seen_files),
                "last_capture": self._last_capture_path,
                "last_capture_time": self._last_capture_time,
                "last_description": self._last_description[:200] if self._last_description else "",
            }

    def get_last_image(self) -> bytes | None:
        with self._lock:
            return self._last_image_bytes

    def get_last_description(self) -> str:
        with self._lock:
            return self._last_description

    # ─── Watch Loop ───────────────────────────────────────────────

    def _watch_loop(self):
        """Poll sync folder every 2 seconds for new images."""
        while self._running:
            try:
                if self._sync_folder and self._sync_folder.exists():
                    for f in sorted(self._sync_folder.rglob("*"), key=lambda p: p.stat().st_mtime):
                        if f.suffix.lower() in SUPPORTED_EXTENSIONS and str(f) not in self._seen_files:
                            self._seen_files.add(str(f))
                            log.info(f"New glasses capture: {f.name}")
                            self._handle_new_capture(f)
            except Exception as e:
                log.error(f"Watch loop error: {e}")
            time.sleep(2)

    def _handle_new_capture(self, path: Path):
        """Process a new photo from the glasses."""
        try:
            # Small delay — let the file finish writing before reading
            time.sleep(0.5)

            image_bytes = path.read_bytes()

            # Determine media type
            ext = path.suffix.lower()
            media_type = "image/jpeg" if ext in (".jpg", ".jpeg", ".heic", ".heif") else "image/png"

            description = self._describe_image(image_bytes, media_type)

            with self._lock:
                self._last_image_bytes = image_bytes
                self._last_description = description
                self._last_capture_time = datetime.now().isoformat()
                self._last_capture_path = str(path)

            log.info(f"Glasses vision: {description[:100]}...")

            # Speak the description
            if self._voice and description:
                brief = self._shorten_for_speech(description)
                threading.Thread(target=self._voice.speak, args=(brief,), daemon=True).start()

            # Push to orchestrator
            self._push_to_orchestrator(description, str(path))

        except Exception as e:
            log.error(f"Failed to handle glasses capture {path}: {e}")

    # ─── Vision ───────────────────────────────────────────────────

    def _describe_image(self, image_bytes: bytes, media_type: str, question: str | None = None) -> str:
        """Send image to Claude Vision and return description."""
        try:
            image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

            prompt = question or (
                "You are JARVIS, Danny's AI assistant. He just took this photo with his Meta Ray-Ban glasses. "
                "Describe what you see concisely and helpfully — like you're narrating to someone wearing the glasses. "
                "Lead with the most important or interesting detail. Be brief (2-3 sentences max)."
            )

            response = self._client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=300,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )

            return response.content[0].text.strip()

        except Exception as e:
            log.error(f"Vision API error: {e}")
            return f"Vision analysis failed: {e}"

    def ask_about_last_image(self, question: str) -> str:
        """Ask a specific question about the last glasses capture."""
        with self._lock:
            image_bytes = self._last_image_bytes

        if not image_bytes:
            return "No glasses capture available yet. Take a photo with your Meta glasses first."

        prompt = (
            f"You are JARVIS, Danny's AI assistant. He's asking about a photo he just took with his Meta Ray-Ban glasses.\n\n"
            f"Question: {question}\n\n"
            "Answer directly and helpfully based on what you see in the image."
        )

        return self._describe_image(image_bytes, "image/jpeg", question=prompt)

    def ask_about_image_file(self, image_path: str, question: str) -> str:
        """Describe a specific image file with an optional question."""
        try:
            path = Path(image_path)
            if not path.exists():
                return f"Image not found: {image_path}"

            image_bytes = path.read_bytes()
            ext = path.suffix.lower()
            media_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

            prompt = (
                f"You are JARVIS, Danny's AI assistant. He's asking about a photo.\n\n"
                f"Question: {question}\n\n"
                "Answer directly and helpfully based on what you see in the image."
            ) if question else None

            return self._describe_image(image_bytes, media_type, question=prompt)
        except Exception as e:
            return f"Failed to analyze image: {e}"

    # ─── Helpers ──────────────────────────────────────────────────

    def _shorten_for_speech(self, text: str) -> str:
        """Trim to first 2 sentences for comfortable TTS."""
        sentences = text.replace("! ", ". ").replace("? ", ". ").split(". ")
        return ". ".join(sentences[:2]).strip()

    def _push_to_orchestrator(self, description: str, image_path: str):
        """Notify JARVIS orchestrator of a new glasses capture."""
        try:
            httpx.post(
                f"{self._orchestrator_url}/api/sidecar/events",
                json={
                    "type": "glasses_capture",
                    "data": {
                        "description": description,
                        "image_path": image_path,
                        "timestamp": datetime.now().isoformat(),
                    },
                },
                timeout=5,
            )
        except Exception:
            pass  # Don't block if orchestrator is down
