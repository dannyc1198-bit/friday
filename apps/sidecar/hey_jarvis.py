"""
Hey Jarvis — always-on ear for Friday.

Say "Hey Jarvis", then the command. This process only listens and speaks.
The orchestrator decides what is allowed, plays YouTube, and runs tools.

  python hey_jarvis.py
  python hey_jarvis.py --check
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(__file__).with_name("voice-ear.config.json")
ENV_PATH = ROOT / "apps" / "orchestrator" / ".env"


def load_config() -> dict:
    defaults = {
        "wakeWord": "hey jarvis",
        "sensitivity": 0.5,
        "micDevice": None,
        "commandSeconds": 8,
        "conversationSeconds": 12,
        "orchestratorUrl": "http://127.0.0.1:3001",
        "pushToTalk": "ctrl+shift",
    }
    try:
        stored = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        stored = {}
    defaults.update({key: value for key, value in stored.items() if value is not None})
    try:
        defaults["sensitivity"] = min(1.0, max(0.1, float(defaults["sensitivity"])))
    except (TypeError, ValueError):
        defaults["sensitivity"] = 0.5
    return defaults


def load_api_key() -> str:
    if os.environ.get("FRIDAY_API_KEY", "").strip():
        return os.environ["FRIDAY_API_KEY"].strip()
    try:
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            if line.startswith("FRIDAY_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        return ""
    return ""


def check() -> int:
    config = load_config()
    key = load_api_key()
    wake = "openwakeword" if importable("openwakeword") and importable("sounddevice") else "speech-recognition"
    report = {
        "ok": True,
        "wakeWord": config["wakeWord"],
        "wakeEngine": wake,
        "orchestrator": config["orchestratorUrl"],
        "apiKey": "present" if key else "needs key",
        "mic": "not opened",
    }
    print(json.dumps(report))
    return 0


def importable(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


class EarClient:
    def __init__(self, config: dict, api_key: str):
        self.base = str(config["orchestratorUrl"]).rstrip("/")
        self.headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    def post(self, path: str, payload: dict, timeout: float = 30) -> dict:
        import httpx
        try:
            response = httpx.post(f"{self.base}{path}", headers=self.headers, json=payload, timeout=timeout)
            if response.status_code == 401:
                return {"say": "needs key — FRIDAY_API_KEY was rejected.", "acted": False}
            if response.status_code >= 400:
                return {"say": "The brain did not take that command.", "acted": False}
            data = response.json()
            return data if isinstance(data, dict) else {}
        except Exception as err:
            return {"say": f"Friday is not running. {err}", "acted": False}

    def presence(self, phase: str) -> None:
        self.post("/api/voice/ear/presence", {"phase": phase}, timeout=4)

    def hear(self, text: str, push_to_talk: bool = False) -> dict:
        return self.post("/api/voice/ear/hear", {"text": text, "pushToTalk": push_to_talk}, timeout=90)

    def muted(self) -> bool:
        import httpx
        try:
            response = httpx.get(f"{self.base}/api/voice/ear", headers=self.headers, timeout=4)
            body = response.json()
            return bool(body.get("muted"))
        except Exception:
            return False


def speak(client: EarClient, text: str) -> None:
    line = (text or "").strip()
    if not line:
        return
    print(f"Jarvis: {line}")
    import httpx
    try:
        response = httpx.post(
            f"{client.base}/api/tts",
            headers=client.headers,
            json={"text": line[:1500]},
            timeout=30,
        )
        if response.status_code == 200 and response.content:
            play_mp3(response.content)
            return
    except Exception as err:
        print(f"TTS unavailable: {err}")
    print("(Spoken reply needs the orchestrator TTS route. The line above is the answer.)")


def play_mp3(payload: bytes) -> None:
    path = ""
    try:
        import pygame
        handle = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        handle.write(payload)
        handle.close()
        path = handle.name
        pygame.mixer.init()
        pygame.mixer.music.load(path)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            time.sleep(0.1)
        pygame.mixer.music.stop()
        pygame.mixer.quit()
    except Exception as err:
        print(f"Could not play audio: {err}")
    finally:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


def transcribe_command(seconds: int, device) -> str:
    if importable("faster_whisper"):
        heard = transcribe_whisper(seconds, device)
        if heard:
            return heard
    return transcribe_google(seconds, device)


def transcribe_google(seconds: int, device) -> str:
    try:
        import speech_recognition as sr
    except Exception:
        print("SpeechRecognition is not installed. Run the PowerShell setup.")
        return ""
    recognizer = sr.Recognizer()
    mic_kwargs = {"device_index": device} if isinstance(device, int) else {}
    try:
        with sr.Microphone(**mic_kwargs) as mic:
            recognizer.adjust_for_ambient_noise(mic, duration=0.3)
            audio = recognizer.listen(mic, timeout=seconds, phrase_time_limit=seconds)
        return recognizer.recognize_google(audio)
    except Exception:
        return ""


def transcribe_whisper(seconds: int, device) -> str:
    try:
        import sounddevice as sd
        from faster_whisper import WhisperModel
    except Exception:
        return ""
    sample_rate = 16000
    frames = sd.rec(int(seconds * sample_rate), samplerate=sample_rate, channels=1, dtype="int16", device=device if isinstance(device, int) else None)
    sd.wait()
    path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    try:
        with wave.open(path, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)
            handle.writeframes(frames.tobytes())
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _info = model.transcribe(path)
        return " ".join(segment.text for segment in segments).strip()
    except Exception:
        return ""
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def wake_loop(config: dict, client: EarClient) -> None:
    sensitivity = float(config["sensitivity"])
    device = config.get("micDevice")
    phrase = str(config["wakeWord"]).lower()
    command_seconds = int(config.get("commandSeconds") or 8)
    follow_seconds = int(config.get("conversationSeconds") or 12)
    engine = start_openwakeword()
    if engine is None:
        print(f"Wake model unavailable. Listening for the phrase \"{phrase}\" with speech recognition.")
    else:
        print(f"Wake word ready ({phrase}). Sensitivity {sensitivity}.")
    print("Ctrl+C stops the ear. Ctrl+Shift talks once if the keyboard package is installed.")
    ptt = Ptt(str(config.get("pushToTalk") or "ctrl+shift"))
    follow_until = 0.0
    while True:
        try:
            if client.muted() and not ptt.pressed():
                time.sleep(0.3)
                continue
            heard_wake = ptt.consume() or time.time() < follow_until or wait_for_wake(engine, phrase, sensitivity, device)
            if not heard_wake:
                continue
            client.presence("listening")
            print("Listening…")
            text = transcribe_command(command_seconds, device)
            client.presence("asleep")
            if not text:
                continue
            print(f"You: {text}")
            result = client.hear(text, push_to_talk=ptt.was_used)
            ptt.was_used = False
            speak(client, str(result.get("say") or ""))
            follow_until = time.time() + follow_seconds
        except KeyboardInterrupt:
            print("Ear off.")
            return
        except Exception as err:
            print(f"Ear loop error: {err}")
            time.sleep(1)


def start_openwakeword():
    try:
        from openwakeword.model import Model
        import openwakeword
        try:
            openwakeword.utils.download_models()
        except Exception:
            pass
        return Model(wakeword_models=["hey_jarvis"])
    except Exception as err:
        print(f"openWakeWord not active: {err}")
        return None


def wait_for_wake(engine, phrase: str, sensitivity: float, device) -> bool:
    if engine is None:
        text = transcribe_google(3, device).lower()
        return phrase in text
    try:
        import sounddevice as sd
    except Exception:
        text = transcribe_google(3, device).lower()
        return phrase in text
    chunk = 1280
    audio = sd.rec(chunk, samplerate=16000, channels=1, dtype="int16", device=device if isinstance(device, int) else None)
    sd.wait()
    scores = engine.predict(audio.flatten())
    score = 0.0
    for value in scores.values():
        score = max(score, float(value))
    return score >= sensitivity


class Ptt:
    def __init__(self, hotkey: str):
        self.was_used = False
        self._pending = False
        try:
            import keyboard
            keyboard.add_hotkey(hotkey, self._mark)
            print(f"Push to talk: {hotkey}")
        except Exception:
            print("Push to talk is off. pip install keyboard, then restart, for Ctrl+Shift.")

    def _mark(self) -> None:
        self._pending = True

    def consume(self) -> bool:
        if not self._pending:
            return False
        self._pending = False
        self.was_used = True
        return True

    def pressed(self) -> bool:
        return self._pending


def main() -> int:
    if "--check" in sys.argv:
        return check()
    config = load_config()
    key = load_api_key()
    if not key:
        print("needs key — put FRIDAY_API_KEY in apps/orchestrator/.env")
        print("The ear can still start, but Friday will refuse commands until the key is there.")
    print(f"Friday ear → {config['orchestratorUrl']}")
    print("Start Friday first (orchestrator on port 3001), then say Hey Jarvis.")
    wake_loop(config, EarClient(config, key))
    return 0


if __name__ == "__main__":
    sys.exit(main())
