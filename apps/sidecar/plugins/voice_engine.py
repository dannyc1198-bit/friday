"""
Voice Engine — Wake word detection, STT, TTS, conversation loop.
State machine: SLEEPING -> (hear wake word) -> CONVERSATION -> (timeout) -> SLEEPING
"""
import os
import time
import base64
import logging
import tempfile
import threading

import anthropic
import httpx
import pygame
import speech_recognition as sr

from config import (
    ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID,
    ORCHESTRATOR_URL, CLAUDE_MODEL, WAKE_WORD, CONVERSATION_TIMEOUT,
)
from plugins.memory_loader import (
    build_voice_memory_context, record_behavioral_pattern,
    save_conversation_summary,
)

log = logging.getLogger("sidecar.voice")

SYSTEM_PROMPT = """You are Danny's AI Companion — FRIDAY, like Tony Stark's assistant after JARVIS.

Your personality:
- Call Danny "boss" naturally (not every sentence, just occasionally)
- Warm, sharp, slightly Irish-tinged. Less formal than JARVIS — more conversational, still caring
- You can see the room through a camera and hear Danny through a microphone
- You know about Danny's projects: Wavelength AI (his AI agency), FRIDAY (his AI assistant), his DJ career
- You're aware of his ADHD — be direct, give one thing at a time
- Keep responses SHORT (2-4 sentences) — you're speaking aloud, not writing an essay
- If he asks about the room/kitchen, reference what you see in the camera
- You're his accountability partner, hype man, and home assistant rolled into one

You can execute tools through the FRIDAY orchestrator. When Danny asks you to do something
that requires a tool (web search, open an app, etc.), tell him what you're doing and the
orchestrator will handle execution."""

# Conversation state
MODE_SLEEPING = "sleeping"
MODE_CONVERSATION = "conversation"


class VoiceEngine:
    def __init__(self, camera_manager):
        self.camera = camera_manager
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.mode = MODE_SLEEPING
        self.conversation_history: list[dict] = []
        self.max_history = 20
        self.last_speech_time = 0
        self._running = False
        self._thread: threading.Thread | None = None
        self._speaking_lock = threading.Lock()

    @property
    def is_sleeping(self) -> bool:
        return self.mode == MODE_SLEEPING

    def start(self):
        """Start the voice engine in a background thread."""
        self._running = True
        self._thread = threading.Thread(target=self._voice_loop, daemon=True)
        self._thread.start()
        log.info("Voice engine started — say 'Hey FRIDAY' to activate")

    def stop(self):
        self._running = False

    def speak(self, text: str):
        """Convert text to speech via ElevenLabs and play through speakers."""
        if not ELEVENLABS_API_KEY:
            log.warning(f"No ElevenLabs key, would say: {text}")
            return

        with self._speaking_lock:
            log.info(f"Speaking: {text}")
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
            headers = {"Accept": "audio/mpeg", "Content-Type": "application/json", "xi-api-key": ELEVENLABS_API_KEY}
            payload = {
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.3, "use_speaker_boost": True},
            }

            try:
                with httpx.Client(timeout=30) as http:
                    resp = http.post(url, headers=headers, json=payload)
                    resp.raise_for_status()

                    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
                    tmp.write(resp.content)
                    tmp.close()

                    try:
                        pygame.mixer.init()
                        pygame.mixer.music.load(tmp.name)
                        pygame.mixer.music.play()
                        while pygame.mixer.music.get_busy():
                            time.sleep(0.1)
                        pygame.mixer.music.stop()
                        pygame.mixer.quit()
                    finally:
                        try:
                            os.unlink(tmp.name)
                        except OSError:
                            pass
            except Exception as e:
                log.error(f"TTS error: {e}")

    def _listen(self, timeout: int = 5, phrase_limit: int = 15) -> str | None:
        """Listen for speech via microphone."""
        recognizer = sr.Recognizer()
        recognizer.energy_threshold = 1000
        recognizer.dynamic_energy_threshold = True

        try:
            with sr.Microphone() as mic:
                recognizer.adjust_for_ambient_noise(mic, duration=0.5)
                audio = recognizer.listen(mic, timeout=timeout, phrase_time_limit=phrase_limit)
                text = recognizer.recognize_google(audio)
                return text
        except sr.WaitTimeoutError:
            return None
        except sr.UnknownValueError:
            return None
        except sr.RequestError as e:
            log.error(f"Speech recognition error: {e}")
            return None

    def _chat_with_ai(self, user_text: str) -> str:
        """Get a response from Claude, with camera frame + full memory context."""
        frame = self.camera.get_frame()

        content = []
        if frame:
            b64 = base64.standard_b64encode(frame).decode("utf-8")
            content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}})
        content.append({"type": "text", "text": user_text})

        # Build messages from history
        messages = list(self.conversation_history[-self.max_history:])
        messages.append({"role": "user", "content": content})

        # Inject full memory context into system prompt
        memory_context = build_voice_memory_context()
        full_prompt = SYSTEM_PROMPT + "\n\n" + memory_context

        response = self.client.messages.create(
            model=CLAUDE_MODEL, max_tokens=300,
            system=full_prompt,
            messages=messages,
        )

        reply = response.content[0].text.strip()

        # Save to history (text only to save tokens)
        self.conversation_history.append({"role": "user", "content": user_text})
        self.conversation_history.append({"role": "assistant", "content": reply})

        # Trim history
        while len(self.conversation_history) > self.max_history * 2:
            self.conversation_history.pop(0)

        # Save conversation summary + track patterns
        try:
            save_conversation_summary(user_text, reply)
            hour = time.localtime().tm_hour
            if hour < 7:
                record_behavioral_pattern("Danny talks to FRIDAY early morning")
            elif hour >= 22:
                record_behavioral_pattern("Danny talks to FRIDAY late at night")
            if len(user_text.split()) <= 5:
                record_behavioral_pattern("Danny uses short voice commands")
        except Exception:
            pass

        return reply

    def _try_orchestrator_tool(self, text: str) -> str | None:
        """Try to execute a tool through the orchestrator if text seems like a command."""
        try:
            with httpx.Client(timeout=30) as http:
                resp = http.post(
                    f"{ORCHESTRATOR_URL}/api/tools/execute",
                    json={"message": text},
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code == 200:
                    return resp.json().get("result")
        except Exception:
            pass
        return None

    def _voice_loop(self):
        """Main voice loop: sleeping -> wake word -> conversation -> timeout -> sleeping."""
        while self._running:
            try:
                if self.mode == MODE_SLEEPING:
                    # Listen for wake word
                    text = self._listen(timeout=3, phrase_limit=5)
                    if text and WAKE_WORD in text.lower():
                        self.mode = MODE_CONVERSATION
                        self.last_speech_time = time.time()
                        log.info("Wake word detected! Entering conversation mode.")
                        self.speak("Yes, boss?")
                        continue

                elif self.mode == MODE_CONVERSATION:
                    # Check timeout
                    if time.time() - self.last_speech_time > CONVERSATION_TIMEOUT:
                        self.mode = MODE_SLEEPING
                        log.info("Conversation timeout — returning to sleep")
                        continue

                    # Listen for speech
                    text = self._listen(timeout=5, phrase_limit=15)
                    if text is None or len(text.strip()) < 3:
                        continue

                    self.last_speech_time = time.time()
                    log.info(f"Danny said: {text}")

                    # Check for sleep command
                    if any(phrase in text.lower() for phrase in ["go to sleep", "that's all", "thank you friday", "stop listening"]):
                        self.speak("Standing by, boss.")
                        self.mode = MODE_SLEEPING
                        continue

                    # Camera toggle commands
                    text_lower = text.lower()
                    if any(phrase in text_lower for phrase in ["camera off", "turn off camera", "disable camera", "stop watching", "stop looking"]):
                        try:
                            with httpx.Client(timeout=5) as http:
                                http.post("http://localhost:3002/api/camera/toggle", json={"enabled": False})
                            self.speak("Camera off. I'm blind but still listening, boss.")
                        except Exception:
                            self.speak("Couldn't reach the camera switch.")
                        continue

                    if any(phrase in text_lower for phrase in ["camera on", "turn on camera", "enable camera", "start watching", "eyes on"]):
                        try:
                            with httpx.Client(timeout=5) as http:
                                http.post("http://localhost:3002/api/camera/toggle", json={"enabled": True})
                            self.speak("Camera back on. I can see you again.")
                        except Exception:
                            self.speak("Couldn't reach the camera switch.")
                        continue

                    # Get AI response
                    reply = self._chat_with_ai(text)
                    log.info(f"FRIDAY: {reply}")
                    self.speak(reply)

            except Exception as e:
                log.error(f"Voice loop error: {e}")
                time.sleep(1)
