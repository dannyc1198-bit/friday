"""
Push-to-Talk — System-wide Ctrl+Shift hotkey for talking to FRIDAY.
Hold Ctrl+Shift to record, release to transcribe + send to FRIDAY + speak response.
Works globally — no browser tab needed.
"""
import io
import time
import wave
import base64
import logging
import threading
import tempfile
import os

import keyboard
import sounddevice as sd
import numpy as np
import anthropic
import httpx

from config import (
    ANTHROPIC_API_KEY, CLAUDE_MODEL, ORCHESTRATOR_URL,
)
from plugins.memory_loader import build_voice_memory_context, save_conversation_summary

log = logging.getLogger("sidecar.ptt")

SAMPLE_RATE = 16000
CHANNELS = 1

# Whisper API for transcription (uses OpenAI-compatible endpoint)
# Falls back to Google Speech Recognition if unavailable
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

SYSTEM_PROMPT = """You are FRIDAY — Danny's AI assistant. Iron Man style.
- British wit, concise, loyal. Call him "boss" or "sir" occasionally.
- Keep responses SHORT (2-4 sentences) — you are speaking aloud.
- Danny has ADHD — one thing at a time, be direct.
- You can see through his camera and hear through his mic.
- You're his accountability partner, hype man, and home assistant."""


class PushToTalk:
    def __init__(self, voice_engine, camera_manager):
        self.voice = voice_engine
        self.camera = camera_manager
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self._recording = False
        self._audio_frames: list[np.ndarray] = []
        self._stream = None
        self._running = False
        self._thread: threading.Thread | None = None
        self._conversation_history: list[dict] = []
        self._max_history = 20
        self._lock = threading.Lock()

    def start(self):
        """Start listening for Ctrl+Shift hotkey."""
        self._running = True
        self._thread = threading.Thread(target=self._hotkey_loop, daemon=True)
        self._thread.start()
        log.info("Push-to-Talk active — hold Ctrl+Shift to talk to FRIDAY")

    def stop(self):
        self._running = False

    def _hotkey_loop(self):
        """Monitor Ctrl+Shift key state."""
        was_pressed = False

        while self._running:
            try:
                # Check if both Ctrl and Shift are held
                is_pressed = keyboard.is_pressed("ctrl") and keyboard.is_pressed("shift")

                if is_pressed and not was_pressed:
                    # Just pressed — start recording
                    self._start_recording()
                elif not is_pressed and was_pressed:
                    # Just released — stop recording and process
                    self._stop_and_process()

                was_pressed = is_pressed
                time.sleep(0.05)  # 50ms polling — responsive enough
            except Exception as e:
                log.error(f"Hotkey loop error: {e}")
                time.sleep(0.5)

    def _start_recording(self):
        """Start capturing audio from microphone."""
        with self._lock:
            if self._recording:
                return
            self._recording = True
            self._audio_frames = []

        log.info("Recording... (release Ctrl+Shift to send)")

        # Play a subtle beep to indicate recording started
        try:
            self._play_beep(880, 0.1)  # Short high beep
        except Exception:
            pass

        def audio_callback(indata, frames, time_info, status):
            if self._recording:
                self._audio_frames.append(indata.copy())

        try:
            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="int16",
                callback=audio_callback,
            )
            self._stream.start()
        except Exception as e:
            log.error(f"Failed to start recording: {e}")
            self._recording = False

    def _stop_and_process(self):
        """Stop recording, transcribe, send to FRIDAY, speak response."""
        with self._lock:
            if not self._recording:
                return
            self._recording = False

        # Stop the audio stream
        if self._stream:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None

        if not self._audio_frames:
            log.info("No audio captured")
            return

        # Play a subtle beep to indicate recording stopped
        try:
            self._play_beep(440, 0.1)  # Short low beep
        except Exception:
            pass

        # Combine audio frames
        audio_data = np.concatenate(self._audio_frames, axis=0)
        duration = len(audio_data) / SAMPLE_RATE

        if duration < 0.5:
            log.info(f"Too short ({duration:.1f}s), ignoring")
            return

        log.info(f"Captured {duration:.1f}s of audio, transcribing...")

        # Process in background thread so hotkey loop stays responsive
        threading.Thread(
            target=self._process_audio,
            args=(audio_data,),
            daemon=True,
        ).start()

    def _process_audio(self, audio_data: np.ndarray):
        """Transcribe audio, send to FRIDAY, speak response."""
        # Step 1: Transcribe
        text = self._transcribe(audio_data)
        if not text or len(text.strip()) < 2:
            log.info("No speech detected")
            return

        log.info(f"Danny said: {text}")

        # Step 2: Get FRIDAY response (with camera frame + memory)
        reply = self._chat(text)
        log.info(f"FRIDAY: {reply}")

        # Step 3: Speak the response
        self.voice.speak(reply)

        # Step 4: Save conversation
        try:
            save_conversation_summary(text, reply)
        except Exception:
            pass

    def _transcribe(self, audio_data: np.ndarray) -> str | None:
        """Transcribe audio using OpenAI Whisper API or fallback to Google STT."""
        # Try OpenAI Whisper API first
        if OPENAI_API_KEY:
            try:
                return self._transcribe_whisper(audio_data)
            except Exception as e:
                log.warning(f"Whisper API failed: {e}, falling back to Google STT")

        # Fallback: Google Speech Recognition via speech_recognition library
        try:
            return self._transcribe_google(audio_data)
        except Exception as e:
            log.error(f"All transcription methods failed: {e}")
            return None

    def _transcribe_whisper(self, audio_data: np.ndarray) -> str:
        """Transcribe using OpenAI Whisper API."""
        # Convert to WAV bytes
        wav_bytes = self._audio_to_wav(audio_data)

        with httpx.Client(timeout=30) as http:
            resp = http.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                files={"file": ("audio.wav", wav_bytes, "audio/wav")},
                data={"model": "whisper-1", "language": "en"},
            )
            resp.raise_for_status()
            return resp.json().get("text", "")

    def _transcribe_google(self, audio_data: np.ndarray) -> str | None:
        """Transcribe using Google Speech Recognition (free, no API key needed)."""
        import speech_recognition as sr

        wav_bytes = self._audio_to_wav(audio_data)

        recognizer = sr.Recognizer()
        audio = sr.AudioData(wav_bytes, SAMPLE_RATE, 2)  # 2 bytes per sample (int16)

        try:
            return recognizer.recognize_google(audio)
        except sr.UnknownValueError:
            return None
        except sr.RequestError as e:
            log.error(f"Google STT error: {e}")
            return None

    def _audio_to_wav(self, audio_data: np.ndarray) -> bytes:
        """Convert numpy audio to WAV bytes."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)  # int16
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(audio_data.tobytes())
        return buf.getvalue()

    def _chat(self, user_text: str) -> str:
        """Send to Claude with camera frame + memory context."""
        frame = self.camera.get_frame()

        content = []
        if frame:
            b64 = base64.standard_b64encode(frame).decode("utf-8")
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg", "data": b64},
            })
        content.append({"type": "text", "text": user_text})

        messages = list(self._conversation_history[-self._max_history:])
        messages.append({"role": "user", "content": content})

        # Full memory context
        memory = build_voice_memory_context()
        full_prompt = SYSTEM_PROMPT + "\n\n" + memory

        response = self.client.messages.create(
            model=CLAUDE_MODEL, max_tokens=300,
            system=full_prompt,
            messages=messages,
        )

        reply = response.content[0].text.strip()

        # Save to history
        self._conversation_history.append({"role": "user", "content": user_text})
        self._conversation_history.append({"role": "assistant", "content": reply})
        while len(self._conversation_history) > self._max_history * 2:
            self._conversation_history.pop(0)

        return reply

    def _play_beep(self, freq: int, duration: float):
        """Play a short beep to indicate recording state."""
        t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
        tone = (np.sin(2 * np.pi * freq * t) * 8000).astype(np.int16)
        sd.play(tone, samplerate=SAMPLE_RATE)
        sd.wait()
