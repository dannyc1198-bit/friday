"""
JARVIS Unified Sidecar — Eyes + Ears + Kitchen Nagger
=====================================================
Single Python process replacing Desktop JARVIS + Kitchen Nagger.

Runs:
  - Camera capture (persistent, thread-safe)
  - Wake word "Hey JARVIS" + voice conversation
  - Kitchen nagger with escalating tone
  - Security monitoring with cooldown
  - Person greeting ("Hello boss")
  - FastAPI server for frontend/orchestrator integration

Usage:
  python main.py                         # Full system, webcam 0
  python main.py --camera 1              # Alternate webcam
  python main.py --rtsp rtsp://IP/stream # IP camera
  python main.py --once --no-voice       # Single scan, no audio (testing)
  python main.py --no-voice              # No TTS/STT (headless)
"""
import sys
import json
import time
import logging
import argparse
import threading
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Add parent to path for config
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    SIDECAR_PORT, CHECK_INTERVAL, MESS_THRESHOLD,
    STATE_FILE, FRAMES_DIR, ORCHESTRATOR_URL,
    ANTHROPIC_API_KEY,
)
from plugins.camera_manager import CameraManager
from plugins.voice_engine import VoiceEngine
from plugins.kitchen_nagger import KitchenNagger
from plugins.security_monitor import SecurityMonitor
from plugins.greeting_system import GreetingSystem
from plugins.notification_manager import NotificationManager
from plugins.push_to_talk import PushToTalk
from plugins.meta_glasses import MetaGlassesVision

# ─── Logging ───────────────────────────────────────────────────
LOG_FILE = Path(__file__).parent / "data" / "sidecar.log"
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)
log = logging.getLogger("sidecar")

# ─── State Persistence ─────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except json.JSONDecodeError:
            pass
    return {
        "consecutive_nags": 0,
        "last_nag_time": 0,
        "last_greeting_date": "",
        "person_present": False,
        "person_last_seen": 0,
        "daily_events": [],
        "total_nags_today": 0,
        "total_cleanups_today": 0,
    }

def save_state(state: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ─── Global Instances ──────────────────────────────────────────

camera_enabled = True
camera = CameraManager()
notifications = NotificationManager()
nagger = KitchenNagger()
security = SecurityMonitor(notifications)
greeting = GreetingSystem()
voice = VoiceEngine(camera)
ptt = PushToTalk(voice, camera)
glasses = MetaGlassesVision(ANTHROPIC_API_KEY, ORCHESTRATOR_URL, voice_engine=voice)

state = load_state()
last_analysis: dict = {}
recent_events: list[dict] = []
MAX_EVENTS = 100

def add_event(event_type: str, message: str):
    recent_events.append({
        "type": event_type,
        "message": message,
        "timestamp": datetime.now().isoformat(),
    })
    if len(recent_events) > MAX_EVENTS:
        recent_events.pop(0)

def push_event_to_orchestrator(event_type: str, data: dict):
    """Send event to orchestrator (non-blocking)."""
    try:
        httpx.post(
            f"{ORCHESTRATOR_URL}/api/sidecar/events",
            json={"type": event_type, "data": data},
            timeout=5,
        )
    except Exception:
        pass  # Don't block sidecar for orchestrator issues

# ─── Scan Loop ─────────────────────────────────────────────────

def scan_loop(args):
    """Main monitoring loop — captures, analyzes, nags, greets, secures."""
    global state, last_analysis

    # Reset daily counters if new day
    today = datetime.now().strftime("%Y-%m-%d")
    if state.get("last_greeting_date", "")[:10] != today:
        state["daily_events"] = []
        state["total_nags_today"] = 0
        state["total_cleanups_today"] = 0

    while True:
        try:
            if not camera_enabled:
                time.sleep(args.interval)
                continue

            log.info("--- Scanning ---")
            frame = camera.get_frame()

            if frame is None:
                log.warning("No frame available, retrying next cycle")
                if args.once:
                    break
                time.sleep(args.interval)
                continue

            # Save frame if requested
            if args.save_frames:
                FRAMES_DIR.mkdir(parents=True, exist_ok=True)
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                (FRAMES_DIR / f"frame_{ts}.jpg").write_bytes(frame)

            # Full scene analysis with Claude Vision
            log.info("Analyzing scene...")
            analysis = nagger.analyze_scene(frame)
            last_analysis = analysis

            person = analysis.get("person_detected", False)
            mess = analysis.get("mess_level", 0)
            observation = analysis.get("general_observation", "")

            log.info(f"Scene: {observation}")
            log.info(f"Person: {person} | Mess: {mess}/10")
            add_event("scan", f"Person: {person}, Mess: {mess}/10 — {observation}")

            # ── GREETING ──
            greeting_msg = greeting.check(analysis, state)
            if greeting_msg and not args.no_voice:
                voice.speak(greeting_msg)
                add_event("greeting", greeting_msg)
                push_event_to_orchestrator("greeting", {"message": greeting_msg})

            # ── SECURITY ──
            alert_msg = security.check(analysis, state.get("person_present", False))
            if alert_msg:
                if not args.no_voice and person:
                    voice.speak(f"Security notice: {alert_msg}")
                add_event("security", alert_msg)
                state["daily_events"].append(f"{datetime.now().strftime('%H:%M')} Security: {alert_msg}")
                push_event_to_orchestrator("security", {"alert": alert_msg})

            # ── KITCHEN NAGGER ──
            nag_msg = nagger.check_and_nag(analysis, state)
            if nag_msg:
                if not args.no_voice and person:
                    voice.speak(nag_msg)
                add_event("nag", nag_msg)
                esc_level = state.get("consecutive_nags", 0)
                state["daily_events"].append(
                    f"{datetime.now().strftime('%H:%M')} Nag #{esc_level} (mess {mess}/10)"
                )
                push_event_to_orchestrator("nag", {"message": nag_msg, "mess_level": mess})

            save_state(state)

        except json.JSONDecodeError as e:
            log.error(f"JSON parse error: {e}")
        except Exception as e:
            log.error(f"Scan error: {e}", exc_info=True)

        if args.once:
            break

        log.info(f"Next scan in {args.interval}s...\n")
        time.sleep(args.interval)

# ─── FastAPI Server ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Sidecar API starting...")
    yield
    log.info("Sidecar API shutting down...")
    camera.stop()
    voice.stop()

app = FastAPI(title="JARVIS Sidecar", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"ok": True, "service": "JARVIS-sidecar", "timestamp": datetime.now().isoformat()}


@app.get("/api/frame")
def get_frame():
    frame = camera.get_frame()
    if frame is None:
        return JSONResponse({"error": "No frame available"}, status_code=503)
    return Response(content=frame, media_type="image/jpeg")


@app.get("/api/status")
def get_status():
    return {
        "camera_enabled": camera_enabled,
        "voice_mode": voice.mode,
        "ptt_active": ptt._running,
        "person_present": state.get("person_present", False),
        "mess_level": last_analysis.get("mess_level", 0),
        "consecutive_nags": state.get("consecutive_nags", 0),
        "total_nags_today": state.get("total_nags_today", 0),
        "total_cleanups_today": state.get("total_cleanups_today", 0),
        "last_analysis": last_analysis,
        "daily_events": state.get("daily_events", []),
    }


@app.get("/api/events")
def get_events():
    return {"events": recent_events[-50:]}


@app.post("/api/speak")
async def speak_endpoint(request_data: dict):
    text = request_data.get("text", "")
    if text:
        threading.Thread(target=voice.speak, args=(text,), daemon=True).start()
        return {"ok": True, "text": text}
    return JSONResponse({"error": "No text provided"}, status_code=400)


@app.post("/api/camera/toggle")
async def camera_toggle(request_data: dict = {}):
    global camera_enabled
    camera_enabled = request_data.get("enabled", not camera_enabled)
    if not camera_enabled:
        camera.stop()
        log.info("Camera disabled by user")
    else:
        camera.start("webcam", 0)
        log.info("Camera enabled by user")
    return {"ok": True, "camera_enabled": camera_enabled}


@app.post("/api/notify")
async def notify_endpoint(request_data: dict):
    title = request_data.get("title", "JARVIS")
    message = request_data.get("message", "")
    level = request_data.get("level", "info")
    if message:
        notifications.alert(title, message, level)
        return {"ok": True}
    return JSONResponse({"error": "No message provided"}, status_code=400)


# ─── Meta Glasses Vision endpoints ────────────────────────────

@app.get("/api/glasses/status")
def glasses_status():
    """Status of the Meta Glasses Vision watcher."""
    return glasses.get_status()


@app.get("/api/glasses/last")
def glasses_last():
    """Return the latest description from the glasses."""
    description = glasses.get_last_description()
    status = glasses.get_status()
    if not description:
        return JSONResponse({"ok": False, "error": "No glasses capture yet"}, status_code=404)
    return {
        "ok": True,
        "description": description,
        "captured_at": status["last_capture_time"],
        "image_path": status["last_capture"],
    }


@app.post("/api/glasses/ask")
async def glasses_ask(request_data: dict):
    """Ask JARVIS a question about the last glasses photo.

    Body: {"question": "What brand is this?"}
    Or:   {"question": "How many calories is this meal?"}
    """
    question = request_data.get("question", "")
    if not question:
        return JSONResponse({"error": "question is required"}, status_code=400)

    def _run():
        answer = glasses.ask_about_last_image(question)
        if voice:
            voice.speak(answer)

    threading.Thread(target=_run, daemon=True).start()

    # Return synchronous answer too (runs vision inline for API callers)
    answer = glasses.ask_about_last_image(question)
    return {"ok": True, "question": question, "answer": answer}


@app.post("/api/glasses/describe-file")
async def glasses_describe_file(request_data: dict):
    """Describe a specific image file.

    Body: {"path": "C:/Users/12368/Pictures/Meta/photo.jpg", "question": "optional"}
    """
    image_path = request_data.get("path", "")
    question = request_data.get("question", "What do you see in this image?")
    if not image_path:
        return JSONResponse({"error": "path is required"}, status_code=400)

    answer = glasses.ask_about_image_file(image_path, question)
    return {"ok": True, "path": image_path, "answer": answer}


# ─── Main ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="JARVIS Unified Sidecar")
    parser.add_argument("--camera", type=int, default=0, help="Webcam index")
    parser.add_argument("--rtsp", type=str, help="RTSP stream URL")
    parser.add_argument("--snapshot-url", type=str, help="HTTP snapshot URL")
    parser.add_argument("--interval", type=int, default=CHECK_INTERVAL, help="Seconds between scans")
    parser.add_argument("--threshold", type=int, default=MESS_THRESHOLD, help="Mess threshold 1-10")
    parser.add_argument("--once", action="store_true", help="Run one scan and exit")
    parser.add_argument("--no-voice", action="store_true", help="Disable voice I/O")
    parser.add_argument("--save-frames", action="store_true", help="Save captured frames to disk")
    parser.add_argument("--no-server", action="store_true", help="Skip FastAPI server")
    parser.add_argument("--no-ptt", action="store_true", help="Disable push-to-talk (Ctrl+Shift)")
    parser.add_argument("--glasses-folder", type=str, help="Meta Glasses sync folder (default: ~/Pictures/Meta)")
    parser.add_argument("--no-glasses", action="store_true", help="Disable Meta Glasses Vision watcher")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("JARVIS UNIFIED SIDECAR — Online")
    log.info("=" * 60)

    # Start camera
    if args.rtsp:
        camera.start("rtsp", args.rtsp)
        src = f"RTSP: {args.rtsp}"
    elif args.snapshot_url:
        camera.start("http", args.snapshot_url)
        src = f"HTTP: {args.snapshot_url}"
    else:
        camera.start("webcam", args.camera)
        src = f"Webcam #{args.camera}"

    log.info(f"Camera: {src}")
    log.info(f"Scan interval: {args.interval}s | Mess threshold: {args.threshold}/10")
    log.info(f"Voice: {'OFF' if args.no_voice else 'ON'}")
    log.info("=" * 60)

    # Wait for first frame
    time.sleep(2)

    # Startup greeting
    if not args.no_voice:
        try:
            voice.speak("JARVIS sidecar online. All systems operational.")
        except Exception as e:
            log.warning(f"Startup voice failed: {e}")

    # Start voice engine (wake word)
    if not args.no_voice and not args.once:
        voice.start()

    # Start Meta Glasses Vision watcher
    if not args.no_glasses and not args.once:
        glasses.start(sync_folder=args.glasses_folder)
        log.info(f"Meta Glasses Vision: watching {glasses.get_status()['sync_folder']}")

    # Start push-to-talk (Ctrl+Shift)
    if not args.no_ptt and not args.once:
        ptt.start()
        log.info("Push-to-Talk: Hold Ctrl+Shift to talk to JARVIS")

    # Start scan loop in background thread
    scan_thread = threading.Thread(target=scan_loop, args=(args,), daemon=True)
    scan_thread.start()

    if args.once:
        scan_thread.join()
        return

    # Start FastAPI server (blocking)
    if not args.no_server:
        log.info(f"Sidecar API: http://localhost:{SIDECAR_PORT}")
        uvicorn.run(app, host="0.0.0.0", port=SIDECAR_PORT, log_level="warning")
    else:
        # Just keep main thread alive
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            log.info("Shutting down...")


if __name__ == "__main__":
    main()
